const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const AutoSaveCore = require(path.join(__dirname, "..", "public", "autosave-core.js"));

const BASE = Date.parse("2026-09-13T12:00:00Z");

function draft(savedAt, quoteId) {
  return {
    savedAt,
    currentQuoteId: quoteId,
    state: { projectName: "قديم" },
    sections: [],
  };
}

function serverQuote(updatedAt, id) {
  return { id: id != null ? id : 7, updated_at: updatedAt };
}

// A. Server newer than draft -> restore rejected, stale draft dropped,
//    server state retained (only the draft is skipped -> effectively "keep
//    already-loaded server state", nothing gets marked for re-save).
test("FIX-14 A: server updated_at strictly newer than draft -> stale -> reject restore", () => {
  const olderDraft = draft(BASE - 5000, 7);
  assert.equal(AutoSaveCore.isDraftStale(BASE, olderDraft.savedAt), true);
  assert.equal(AutoSaveCore.shouldRestoreDraft(olderDraft, serverQuote(BASE)), false);
});

// B. Draft newer than server -> restore allowed.
test("FIX-14 B: draft savedAt newer than server -> restore allowed", () => {
  const newerDraft = draft(BASE + 5000, 7);
  assert.equal(AutoSaveCore.isDraftStale(BASE, newerDraft.savedAt), false);
  assert.equal(AutoSaveCore.shouldRestoreDraft(newerDraft, serverQuote(BASE)), true);
});

// C. Equal timestamps -> restore allowed (only strictly-newer rejects).
test("FIX-14 C: equal timestamps -> restore allowed", () => {
  const equalDraft = draft(BASE, 7);
  assert.equal(AutoSaveCore.isDraftStale(BASE, equalDraft.savedAt), false);
  assert.equal(AutoSaveCore.shouldRestoreDraft(equalDraft, serverQuote(BASE)), true);
});

// D. Missing/invalid timestamps -> preserve restore behavior, never discard
//    the draft on an uncertain comparison.
test("FIX-14 D: missing/invalid timestamps -> restore preserved, draft not discarded", () => {
  const drafts = [
    draft(null, 7),
    draft(undefined, 7),
    draft("not-a-date", 7),
    draft(BASE, 7),
  ];
  const servers = [
    undefined,
    null,
    "garbage",
    "ليس تاريخاً",
    serverQuote(undefined),
    serverQuote(null),
    serverQuote(""),
  ];
  for (const d of drafts) {
    assert.equal(AutoSaveCore.shouldRestoreDraft(d, serverQuote(BASE)), true, "restore with missing draft.savedAt");
    if (d.savedAt != null && d.savedAt !== "not-a-date") {
      assert.equal(AutoSaveCore.isDraftStale(BASE, d.savedAt), false);
    }
  }
  for (const s of servers) {
    assert.equal(AutoSaveCore.isDraftStale(s, BASE), false, "invalid server timestamp is never stale");
    assert.equal(AutoSaveCore.shouldRestoreDraft(draft(BASE), s), true, "invalid server timestamp restores");
  }
});

// E. Different quote id -> another quote's timestamp is never used to
//    invalidate this draft.
test("FIX-14 E: different quote id -> restore, do not use unrelated timestamp", () => {
  const d = draft(BASE - 5000, 7); // looks stale IF judged by its own quote
  const otherQuoteNewer = serverQuote(BASE + 60000, 99); // different quote, newer
  assert.equal(AutoSaveCore.shouldRestoreDraft(d, otherQuoteNewer), true);
  const otherQuoteOlder = serverQuote(BASE - 60000, 99);
  assert.equal(AutoSaveCore.shouldRestoreDraft(d, otherQuoteOlder), true);
  assert.equal(AutoSaveCore.shouldRestoreDraft(d, serverQuote(BASE, 7)), false, "same quote still rejects");
});

// Format coverage: SQLite CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS" is UTC with
// no zone marker and must compare against epoch ms correctly.
test("FIX-14: SQLite timestamp format parses as UTC and compares correctly", () => {
  const dbTime = "2026-09-13 12:00:00"; // == BASE as UTC
  assert.equal(AutoSaveCore.parseTimestampToEpochMs(dbTime), BASE);
  assert.equal(AutoSaveCore.isDraftStale(dbTime, BASE - 1000), true);
  assert.equal(AutoSaveCore.isDraftStale(dbTime, BASE + 1000), false);
  assert.equal(AutoSaveCore.isDraftStale(dbTime, BASE), false);

  const dbTimeNoSeconds = "2026-09-13 12:00"; // shorthand, same instant
  assert.equal(AutoSaveCore.parseTimestampToEpochMs(dbTimeNoSeconds), BASE);

  const isoZ = "2026-09-13T12:00:00.000Z";
  assert.equal(AutoSaveCore.parseTimestampToEpochMs(isoZ), BASE);

  const epochString = String(BASE);
  assert.equal(AutoSaveCore.parseTimestampToEpochMs(epochString), BASE);
});

// Uncertain fetch result (server quote unknown) -> restore, never discard.
test("FIX-14: unknown server quote (fetch failed) -> restore preserved", () => {
  const d = draft(BASE - 5000, 7);
  assert.equal(AutoSaveCore.shouldRestoreDraft(d, null), true);
  assert.equal(AutoSaveCore.shouldRestoreDraft(d, undefined), true);
});

// Unpersisted draft (brand-new quote, no id) -> restore exactly as before.
test("FIX-14: unpersisted draft (no quote id) -> restore allowed", () => {
  const newQuoteDraft = draft(BASE - 5000, null);
  assert.equal(AutoSaveCore.shouldRestoreDraft(newQuoteDraft, serverQuote(BASE, 7)), true);
});

// =====================================================================
// FIX-14 CORRECTION — orchestration seam (decideDraftRestore)
//
// These prove the corrected INIT behavior at the decision seam the init path
// delegates to: rejecting a stale draft carries the authoritative serverQuote
// back to the caller (so init populates the editor instead of leaving it
// blank), and draft cleanup is conditional on the currently stored value
// still being the inspected draft (so another tab's replacement draft is
// never deleted).
// =====================================================================

// 1. Same quote + newer server: reject; serverQuote present for editor
//    population; stored RAW value still byte-identical to the inspected one
//    -> safe to clear.
test("FIX-14 CORRECTION A: stale same-quote reject carries serverQuote for editor population + safe clear", () => {
  const inspectedDraft = draft(BASE - 5000, 7);
  const raw = JSON.stringify(inspectedDraft);
  const server = serverQuote(BASE); // id 7, updated_at newer than draft
  const outcome = AutoSaveCore.decideDraftRestore(inspectedDraft, server, raw, raw);
  assert.deepEqual(outcome.action, "reject-stale");
  // The authoritative server quote is handed back so the editor can be
  // populated (currentQuoteId + sections/rooms/items come from it).
  assert.equal(outcome.serverQuote, server);
  assert.equal(outcome.serverQuote.id, 7);
  // Stored raw value is still the SAME inspected one -> cleanup is safe.
  assert.equal(outcome.clearDraft, true);
});

// 2. Accepted draft: the corrected seam still routes to the unchanged restore
//    behavior — no regression to the helper semantics.
test("FIX-14 CORRECTION B: accepted drafts still route to restore", () => {
  const newerDraft = draft(BASE + 5000, 7);
  const equalDraft = draft(BASE, 7);
  const unknownServerDraft = draft(BASE - 5000, 7);
  const crossQuoteDraft = draft(BASE - 5000, 7);
  assert.deepEqual(AutoSaveCore.decideDraftRestore(newerDraft, serverQuote(BASE), "", "").action, "restore");
  assert.deepEqual(AutoSaveCore.decideDraftRestore(equalDraft, serverQuote(BASE), "", "").action, "restore");
  // Fetch failed / no server data -> uncertainty preserves recovery.
  assert.deepEqual(AutoSaveCore.decideDraftRestore(unknownServerDraft, null, null, JSON.stringify(unknownServerDraft)).action, "restore");
  assert.deepEqual(AutoSaveCore.decideDraftRestore(unknownServerDraft, undefined, null, JSON.stringify(unknownServerDraft)).action, "restore");
  // Different quote id -> that quote's timestamp never invalidates this draft.
  assert.deepEqual(AutoSaveCore.decideDraftRestore(crossQuoteDraft, serverQuote(BASE + 60000, 99), "", "").action, "restore");
  // No draft at all -> nothing to do.
  assert.deepEqual(AutoSaveCore.decideDraftRestore(null, serverQuote(BASE), null, null).action, "none");
});

// 3. Replacement-draft race: D1 inspected, D2 written to storage while the
//    quote fetch was pending. Rejecting D1 MUST NOT clear D2 — the raw stored
//    value changed, so the stored entry is no longer the inspected one.
test("FIX-14 CORRECTION C: replacement draft D2 is never deleted by D1's stale rejection", () => {
  const inspectedD1 = draft(BASE - 5000, 7);
  const rawInspected = JSON.stringify(inspectedD1);
  const storedNowD2 = draft(BASE + 2000, 7); // another tab replaced the draft
  const rawNowD2 = JSON.stringify(storedNowD2);
  const outcome = AutoSaveCore.decideDraftRestore(inspectedD1, serverQuote(BASE), rawNowD2, rawInspected);
  assert.deepEqual(outcome.action, "reject-stale");
  assert.equal(outcome.clearDraft, false, "must NOT clear a replaced draft");

  const storedD2DifferentQuote = draft(BASE + 2000, 99);
  const outcome2 = AutoSaveCore.decideDraftRestore(inspectedD1, serverQuote(BASE), JSON.stringify(storedD2DifferentQuote), rawInspected);
  assert.equal(outcome2.clearDraft, false, "different-quote replacement also preserved");
});

// 4. sameSerializedDraft: exact raw-string equality is the cleanup proof.
//    quote id + savedAt metadata alone is NOT enough.
test("FIX-14 CORRECTION D: sameSerializedDraft requires exact serialized-string equality", () => {
  const raw = '{"savedAt":12345,"currentQuoteId":7,"state":{"projectName":"A"},"sections":[]}';
  assert.equal(AutoSaveCore.sameSerializedDraft(raw, raw), true);
  assert.equal(AutoSaveCore.sameSerializedDraft(raw, '{"savedAt":12345,"currentQuoteId":7,"state":{"projectName":"B"},"sections":[]}'), false);
  assert.equal(AutoSaveCore.sameSerializedDraft(raw, null), false);
  assert.equal(AutoSaveCore.sameSerializedDraft(null, raw), false);
  assert.equal(AutoSaveCore.sameSerializedDraft(undefined, undefined), false);
  assert.equal(AutoSaveCore.sameSerializedDraft(raw, 12345), false);
});

// 5. Uncertain stored value (read failure / missing) -> cleanup never.
test("FIX-14 CORRECTION E: unreadable/missing stored raw -> cleanup refused", () => {
  const inspected = draft(BASE - 5000, 7);
  const rawInspected = JSON.stringify(inspected);
  assert.equal(AutoSaveCore.decideDraftRestore(inspected, serverQuote(BASE), null, rawInspected).clearDraft, false);
  assert.equal(AutoSaveCore.decideDraftRestore(inspected, serverQuote(BASE), undefined, rawInspected).clearDraft, false);
  // Malformed / non-string current value could not be the same entry either.
  assert.equal(AutoSaveCore.decideDraftRestore(inspected, serverQuote(BASE), 12345, rawInspected).clearDraft, false);
});

// =====================================================================
// FIX-14 FINAL IDENTITY CORRECTION — exact serialized-value cleanup proof
// =====================================================================

// 1. Original stored draft unchanged -> cleanup allowed.
test("FIX-14 IDENTITY 1: unchanged stored raw -> cleanup allowed", () => {
  const inspectedDraft = draft(BASE - 5000, 7);
  const raw = JSON.stringify(inspectedDraft);
  assert.equal(AutoSaveCore.sameSerializedDraft(raw, raw), true);
  const outcome = AutoSaveCore.decideDraftRestore(inspectedDraft, serverQuote(BASE), raw, raw);
  assert.deepEqual(outcome.action, "reject-stale");
  assert.equal(outcome.clearDraft, true);
});

// 2. Same quote + same savedAt + DIFFERENT content -> cleanup refused.
test("FIX-14 IDENTITY 2: same quote + same savedAt + different content -> cleanup refused", () => {
  const D1 = { savedAt: BASE - 5000, currentQuoteId: 7, state: { projectName: "A" }, sections: [] };
  const D2 = { savedAt: BASE - 5000, currentQuoteId: 7, state: { projectName: "B" }, sections: [] };
  const rawInspected = JSON.stringify(D1);
  const rawNow = JSON.stringify(D2);
  // Metadata (savedAt + quoteId) matches; only the serialized content differs.
  assert.notEqual(rawInspected, rawNow);
  assert.equal(AutoSaveCore.sameSerializedDraft(rawInspected, rawNow), false);
  const outcome = AutoSaveCore.decideDraftRestore(D1, serverQuote(BASE), rawNow, rawInspected);
  assert.deepEqual(outcome.action, "reject-stale");
  assert.equal(outcome.clearDraft, false, "same-metadata/different-content draft must NOT be cleared");
});

// 3. Different quote -> cleanup refused.
test("FIX-14 IDENTITY 3: different quote -> cleanup refused", () => {
  const D1 = draft(BASE - 5000, 7);
  const D2 = draft(BASE - 5000, 99);
  const outcome = AutoSaveCore.decideDraftRestore(D1, serverQuote(BASE), JSON.stringify(D2), JSON.stringify(D1));
  assert.equal(outcome.clearDraft, false);
});

// 4. Same quote + different savedAt -> cleanup refused.
test("FIX-14 IDENTITY 4: different savedAt -> cleanup refused", () => {
  const D1 = draft(BASE - 5000, 7);
  const D2 = draft(BASE + 2000, 7);
  const outcome = AutoSaveCore.decideDraftRestore(D1, serverQuote(BASE), JSON.stringify(D2), JSON.stringify(D1));
  assert.equal(outcome.clearDraft, false);
});

// 5. Missing/unreadable current storage value -> cleanup refused.
test("FIX-14 IDENTITY 5: missing/unreadable current raw value -> cleanup refused", () => {
  const D1 = draft(BASE - 5000, 7);
  const rawInspected = JSON.stringify(D1);
  for (const storedRawNow of [null, undefined, "", "definitely not json", 0, false, {}, []]) {
    const outcome = AutoSaveCore.decideDraftRestore(D1, serverQuote(BASE), storedRawNow, rawInspected);
    assert.equal(outcome.clearDraft, false, String(storedRawNow));
  }
});

// =====================================================================
// FIX-14 FINAL PARSE-CONSISTENCY — single-read init freeze
// =====================================================================

// 1. parseDraftRaw is the pure parse/validate of loadDraft: same validation
//    outcomes, no storage access, derived only from the passed raw string.
test("FIX-14 PARSE-CONSISTENCY A: parseDraftRaw reproduces loadDraft validation", () => {
  const good = { savedAt: BASE, currentQuoteId: 7, state: { projectName: "A" }, sections: [] };
  assert.deepEqual(AutoSaveCore.parseDraftRaw(JSON.stringify(good)), good);
  assert.equal(AutoSaveCore.parseDraftRaw(null), null);
  assert.equal(AutoSaveCore.parseDraftRaw(undefined), null);
  assert.equal(AutoSaveCore.parseDraftRaw(""), null);
  assert.equal(AutoSaveCore.parseDraftRaw("{ not json"), null); // invalid JSON
  assert.equal(AutoSaveCore.parseDraftRaw("42"), null); // valid JSON, wrong shape
  assert.equal(AutoSaveCore.parseDraftRaw(JSON.stringify({ savedAt: BASE, currentQuoteId: 7, sections: [] })), null); // missing state
  assert.equal(AutoSaveCore.parseDraftRaw(JSON.stringify({ savedAt: BASE, currentQuoteId: 7, state: {} })), null); // sections not array
});

// 2. Single-capture playback of the corrected init flow: the parsed draft
//    (quote id + timestamp decision) and the identity string BOTH come from
//    one captured raw value (D1). If storage changes to D2 while the fetch
//    is pending, the parsed draft is still D1-derived and the post-fetch
//    re-read (raw D2) refuses cleanup.
test("FIX-14 PARSE-CONSISTENCY B: parsed draft and identity come from the single captured raw; D2 observed after fetch is refused", () => {
  const D1 = { savedAt: BASE - 5000, currentQuoteId: 7, state: { projectName: "D1" }, sections: [] };
  const D2 = { savedAt: BASE + 2000, currentQuoteId: 99, state: { projectName: "D2" }, sections: [] };
  const rawD1 = JSON.stringify(D1);
  const rawD2 = JSON.stringify(D2);

  // Single pre-fetch read: parse the SAME raw that becomes the identity value.
  const draftD1 = AutoSaveCore.parseDraftRaw(rawD1);
  assert.deepEqual(draftD1, D1);
  assert.equal(draftD1.currentQuoteId, 7); // quote fetch would target D1, not D2

  // Storage replaced by D2 while the quote fetch was pending (re-read now).
  const server = serverQuote(BASE); // quote 7, updated_at newer than D1's savedAt
  const outcome = AutoSaveCore.decideDraftRestore(draftD1, server, rawD2, rawD1);
  assert.deepEqual(outcome.action, "reject-stale");
  assert.equal(outcome.clearDraft, false, "post-fetch D2 forces cleanup refusal");

  // The decision/timestamp path still used D1's parsed data only.
  assert.equal(draftD1.currentQuoteId, 7);
  assert.equal(draftD1.state.projectName, "D1");
  assert.equal(AutoSaveCore.isDraftStale(server.updated_at, draftD1.savedAt), true);
});