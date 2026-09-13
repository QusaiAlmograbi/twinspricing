(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AutoSaveCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- FIX-6 Slice D-1: dirty-state snapshot + selective-clear primitives ----
  // Operate on a live object shaped { quote:boolean, sections:Set, rooms:Set,
  // items:Set }. The snapshot is an ISOLATED COPY of the live dirty sets, so
  // marks that arrive DURING a save cycle never leak into the cycle's snapshot.
  // Clearing is selective: only keys present in the snapshot are removed from
  // the live state, so entities marked mid-save survive the clean.

  function createDirtySnapshot(live) {
    return {
      quote: !!live.quote,
      sections: new Set(live.sections),
      rooms: new Set(live.rooms),
      items: new Set(live.items),
    };
  }

  // Removes from `live` ONLY the keys present in `snapshot`. Keys added after
  // the snapshot was taken are never touched. Quote is only reset when it was
  // dirty in the snapshot.
  //
  // Pre-condition (enforced by the caller's stamp gate at the cycle end): no
  // edit re-marked a snapshot key after the snapshot was taken — i.e. the editor
  // stamp is unchanged since the cycle started. Returns the number of keys
  // actually removed (the quote flag counts as one key when cleared).
  function clearDirtySnapshot(live, snapshot) {
    if (!live || !snapshot) return 0;
    let cleared = 0;
    if (snapshot.quote === true && live.quote === true) {
      live.quote = false;
      cleared += 1;
    }
    for (const key of snapshot.sections) {
      if (live.sections && live.sections.delete(key)) cleared += 1;
    }
    for (const key of snapshot.rooms) {
      if (live.rooms && live.rooms.delete(key)) cleared += 1;
    }
    for (const key of snapshot.items) {
      if (live.items && live.items.delete(key)) cleared += 1;
    }
    return cleared;
  }

  function createController(opts) {
    const debounceMs = opts.debounceMs || 5000;
    const retryDelays = opts.retryDelays || [5000, 15000];
    const readSnapshot = opts.readSnapshot;
    const runSave = opts.runSave;
    const isLocked = opts.isLocked || (() => false);
    const onSaving = opts.onSaving || (() => {});
    const onSaved = opts.onSaved || (() => {});
    const onError = opts.onError || (() => {});
    const onClean = opts.onClean || (() => {});
    const onDirty = opts.onDirty || (() => {});

    let timer = null;
    let running = false;
    let retriggered = false;
    let dirty = false;
    let stamp = 0;
    let lastSaved = null;
    let failures = 0;

    function markDirty() {
      stamp += 1;
      dirty = true;
      onDirty();
      schedule();
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, debounceMs);
    }

    // After a failed save, re-arm using a bounded retry delay.
    // 1st failure → retryDelays[0], 2nd → retryDelays[1], then the last entry
    // is capped for all subsequent failures (no unbounded backoff, no storm).
    function scheduleRetry() {
      const idx = Math.min(
        Math.max(failures - 1, 0),
        retryDelays.length - 1
      );
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, retryDelays[idx]);
    }

    // Re-arm for a hidden→active resume. No-op while a timer is already
    // pending so a resume can never stack a second timer or a second save.
    function armNext() {
      if (timer) return;
      if (failures > 0) scheduleRetry();
      else schedule();
    }

    function cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    async function run() {
      if (running) {
        // Busy-lock: never drop a trigger — remember it so the in-flight run
        // re-schedules after it completes.
        retriggered = true;
        return;
      }
      if (isLocked()) {
        // A manual save holds the shared lock. Re-arm so the retry happens
        // after the lock is released instead of dropping the trigger.
        retriggered = true;
        schedule();
        return;
      }

      const stampBefore = stamp;
      const snapshot = readSnapshot();
      if (snapshot === lastSaved) {
        dirty = false;
        onClean();
        return;
      }

      running = true;
      retriggered = false;
      onSaving();

      let ok = false;
      try {
        ok = await runSave(snapshot);
      } catch (err) {
        ok = false;
      }
      running = false;

      if (!ok) {
        // Failure: never mark state as saved; keep it dirty and re-arm a
        // bounded retry so the work is never silently stranded.
        dirty = true;
        failures += 1;
        onError();
        scheduleRetry();
        return;
      }

      // Success resets the failure/retry state.
      failures = 0;

      if (stamp !== stampBefore) {
        // A real edit happened while the save was in flight. Only the snapshot
        // we captured and sent counts as persisted; the newer edit stays dirty
        // and another save is scheduled for it.
        lastSaved = snapshot;
        dirty = true;
        onDirty();
        schedule();
      } else {
        // No user edits during the run. The save body may have mutated the
        // live objects with server-assigned ids/flags; absorb that bookkeeping
        // by capturing the current state, which equals what the server holds.
        lastSaved = readSnapshot();
        dirty = false;
        onSaved();
        onClean();
      }

      if (retriggered && dirty) {
        schedule();
      }
    }

    return {
      markDirty,
      schedule,
      cancel,
      run,
      resume: () => {
        // Idempotent "page became active" hook. Busy-lock semantics: never
        // start a second save while one is in flight or a manual save holds
        // the shared lock — just remember the request so the in-flight run
        // re-schedules if work is still dirty.
        if (running || isLocked()) {
          retriggered = true;
          return;
        }
        if (!dirty) return; // clean state → nothing to resume
        armNext();
      },
      isRunning: () => running,
      isDirty: () => dirty,
      getStamp: () => stamp,
      getLastSavedSnapshot: () => lastSaved,
      getRetryFailures: () => failures,
      commitSaved: (snapshot) => {
        lastSaved = snapshot;
        dirty = false;
        failures = 0;
        cancel();
      },
      destroy: cancel,
    };
  }

  // ---- FIX-14: stale local-draft guard ----
  //
  // The editor persists a local recovery draft (localStorage) on every edit.
  // That draft used to be restored unconditionally on page load, so an OLDER
  // snapshot could overwrite NEWER server-side data when the draft outlived a
  // save that another tab or a later session already completed. The guard
  // makes the restore conditional on the draft not being stale relative to the
  // server timestamp of the SAME quote. Uncertainty always restores.

  // Parse a timestamp of any supported shape into UTC epoch milliseconds, or
  // null when the value is missing/invalid. Supported shapes: epoch numbers
  // (Date.now()/Date.parse output, also numeric strings), JS Date objects,
  // ISO-8601 strings (e.g. pg's JSON serialization "…Z"), and SQLite
  // CURRENT_TIMESTAMP strings "YYYY-MM-DD HH:MM:SS" which are UTC with no zone
  // marker.
  function parseTimestampToEpochMs(value) {
    if (value == null) return null;
    if (value instanceof Date) {
      const t = value.getTime();
      return isFinite(t) ? t : null;
    }
    if (typeof value === "number") {
      return isFinite(value) ? value : null;
    }
    if (typeof value !== "string") return null;
    const s = value.trim();
    if (s === "") return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      return isFinite(n) ? n : null;
    }
    if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(s)) {
      const iso = s.replace(" ", "T") + (s.length <= 16 ? ":00" : "") + "Z";
      const t = Date.parse(iso);
      return isFinite(t) ? t : null;
    }
    const t = Date.parse(s);
    return isFinite(t) ? t : null;
  }

  // True only when BOTH timestamps are valid and the server's updated_at is
  // strictly newer than the draft's savedAt. Strictly-newer is the ONLY case
  // that rejects a restore; equal timestamps (draft.savedAt >= server) and
  // any missing/invalid timestamp keep the existing restore behavior.
  function isDraftStale(serverUpdatedAt, draftSavedAt) {
    const serverEpoch = parseTimestampToEpochMs(serverUpdatedAt);
    const draftEpoch = parseTimestampToEpochMs(draftSavedAt);
    if (serverEpoch == null || draftEpoch == null) return false;
    return serverEpoch > draftEpoch;
  }

  // Full restore decision for a draft against its own quote. Returns true
  // when the draft should be restored exactly as before FIX-14:
  //   - the draft is brand-new (no quote id yet) -> restore
  //   - the server quote is unknown (fetch failed) -> restore; no uncertain
  //     comparison ever discards a draft
  //   - the provided server quote is NOT the draft's own quote -> restore;
  //     one quote's timestamp is never used to invalidate another's draft
  //   - server updated_at is valid and strictly newer -> false (stale)
  //   - otherwise (draft newer, or equal) -> restore
  function shouldRestoreDraft(draft, serverQuote) {
    if (!draft || draft.savedAt == null) return true;
    if (!draft.currentQuoteId) return true;
    if (!serverQuote || serverQuote.id == null) return true;
    if (String(serverQuote.id) !== String(draft.currentQuoteId)) return true;
    return !isDraftStale(serverQuote.updated_at, draft.savedAt);
  }

  // Final FIX-14 correction: pure parse/validate of a raw draft value so the
  // init path can derive BOTH the parsed draft and the identity string from a
  // SINGLE storage read. Keeps loadDraft's behavior exactly:
  //   - null / non-string / empty -> null (nothing stored, or unreadable)
  //   - invalid JSON -> null
  //   - parsed value without a `state` object -> null
  //   - parsed value whose `sections` is not an array -> null
  //   - otherwise -> the parsed draft object
  // This function never touches localStorage; it is a pure mapping from the
  // already-read raw string so the parsed draft ALWAYS describes the same
  // snapshot the raw identity value was captured from.
  function parseDraftRaw(raw) {
    if (typeof raw !== "string" || raw === "") return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.state ||
      !Array.isArray(parsed.sections)
    ) {
      return null;
    }
    return parsed;
  }

  // Final FIX-14 correction: same-serialized-draft proof for conditional
  // cleanup. A draft may only be deleted when what is CURRENTLY stored is the
  // EXACT same serialized localStorage value that was inspected. Comparing
  // just quote id + savedAt could not detect two drafts that share those
  // metadata fields but contain different content; the raw-string comparison
  // below turns ANY difference (content, savedAt, quote id, key order) into a
  // mismatch, so the currently stored entry must still be byte-identical to
  // the one originally read. localStorage provides no compare-and-delete, so
  // the change-conservative default is: anything missing/unreadable/malformed
  // is simply refused and the stored draft is preserved.
  function sameSerializedDraft(rawA, rawB) {
    if (typeof rawA !== "string" || typeof rawB !== "string") return false;
    return rawA === rawB;
  }

  // Final FIX-14 correction: single deterministic decision for the init
  // restore path, kept pure so the corrected initialization behavior can be
  // regression-tested without a DOM.
  // Args:
  //   draft              — the parsed draft inspected before the server fetch
  //   serverQuote        — the authoritative quote fetched for the draft's id
  //   storedRawNow       — the RAW localStorage value re-read after the fetch
  //   inspectedDraftRaw  — the RAW localStorage value read before the fetch
  // Returns one of:
  //   { action: "none" }  — no draft present; nothing to do
  //   { action: "restore" } — the draft is not provably stale; restore it
  //     exactly as before
  //   { action: "reject-stale", serverQuote, clearDraft } — newer server data
  //     exists for the same quote. The caller must populate the editor from
  //     serverQuote (authoritative) and clear the draft ONLY when clearDraft
  //     is true, i.e. the raw stored value is byte-identical before and after
  //     the fetch (proven by sameSerializedDraft). serverQuote is guaranteed
  //     non-null on this path (shouldRestoreDraft only rejects when the quote
  //     fetch succeeded).
  //   Note: this proves the storage entry did not change across the async
  //   fetch, but localStorage offers no true compare-and-delete; a tiny
  //   synchronous gap between this re-read and the clearing removal remains.
  function decideDraftRestore(draft, serverQuote, storedRawNow, inspectedDraftRaw) {
    if (!draft) return { action: "none" };
    if (shouldRestoreDraft(draft, serverQuote)) {
      return { action: "restore" };
    }
    const canClear = sameSerializedDraft(inspectedDraftRaw, storedRawNow) === true;
    return {
      action: "reject-stale",
      serverQuote: serverQuote || null,
      clearDraft: canClear,
    };
  }

  return {
    createController,
    createDirtySnapshot,
    clearDirtySnapshot,
    parseTimestampToEpochMs,
    isDraftStale,
    shouldRestoreDraft,
    sameSerializedDraft,
    parseDraftRaw,
    decideDraftRestore,
  };
});