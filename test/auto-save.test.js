const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const AutoSaveCore = require(path.join(__dirname, "..", "public", "autosave-core.js"));

// ---------------- helpers ----------------

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Deterministic fake timers so scheduling can be driven explicitly.
// Handlers are fired without awaiting so a handler that itself awaits a
// deferred (an in-flight save) does not deadlock the advancement.
function installFakeTimers() {
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  let now = 0;
  const queue = [];

  global.setTimeout = (fn, ms) => {
    const handle = { fn, at: now + ms };
    queue.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    if (!handle) return;
    const i = queue.findIndex((h) => h === handle);
    if (i !== -1) queue.splice(i, 1);
  };

  return {
    advance(ms) {
      now += ms;
      const due = queue
        .filter((h) => h.at <= now)
        .sort((a, b) => a.at - b.at);
      queue.length = 0;
      for (const h of due) {
        h.fn();
      }
    },
    pending() {
      return queue.length;
    },
    nextAt() {
      if (queue.length === 0) return null;
      return Math.min(...queue.map((h) => h.at - now));
    },
    restore() {
      global.setTimeout = realSetTimeout;
      global.clearTimeout = realClearTimeout;
    },
  };
}

// Let pending async handlers (started but not awaited) run to their next await.
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

// ---------------- tests ----------------

test("marks ONLY the in-flight snapshot as saved; edits during save stay dirty and get re-sent", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [
      { name: "S1", items: [{ name: "a" }], _fromServer: true, id: 1 },
    ];

    const gates = [];
    const sentSnapshots = [];
    let dirtyCalls = 0;
    let cleanCalls = 0;
    let savedCalls = 0;
    let errCalls = 0;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async (snapshot) => {
        sentSnapshots.push(snapshot);
        const gate = deferred();
        gates.push(gate);
        await gate.promise;
        // simulate server-side bookkeeping assigned during the save
        for (const sec of JSON.parse(snapshot).sections) {
          const live = sections.find((s) => s.name === sec.name);
          if (live) live.id = live.id || 100;
        }
        return true;
      },
      onDirty: () => dirtyCalls++,
      onClean: () => cleanCalls++,
      onSaved: () => savedCalls++,
      onError: () => errCalls++,
    });

    const snapshotA = JSON.stringify({ state, sections });
    const firstRun = ctl.run();
    assert.equal(sentSnapshots.length, 1); // save started

    // user edits while the first save is in flight
    ctl.markDirty();
    sections.push({ name: "S2", items: [{ name: "b" }] });
    const snapshotB = JSON.stringify({ state, sections });

    gates[0].resolve();
    await firstRun;

    // only the exact snapshot sent (A) is marked persisted; not B
    assert.equal(ctl.getLastSavedSnapshot(), snapshotA);
    assert.equal(ctl.isRunning(), false);
    assert.equal(ctl.isDirty(), true);
    // the newer edit is NOT reported as clean or as "saved"
    assert.equal(cleanCalls, 0);
    assert.equal(savedCalls, 0);
    assert.equal(errCalls, 0);
    assert.ok(dirtyCalls >= 1);

    // the newer dirty state gets another save attempt scheduled
    assert.ok(timers.pending() >= 1);
    timers.advance(50);
    await flush();
    assert.equal(sentSnapshots.length, 2);
    assert.equal(sentSnapshots[1], snapshotB);
    gates[1].resolve();
    await flush();
    assert.equal(ctl.isDirty(), false);
    assert.equal(cleanCalls, 1);
  } finally {
    timers.restore();
  }
});

test("busy-lock: trigger during a manual save is not dropped; run after the lock releases", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [], _fromServer: true, id: 1 }];
    let locked = true;
    let saveCount = 0;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      isLocked: () => locked,
      runSave: async () => {
        saveCount++;
        return true;
      },
      onDirty: () => {},
      onClean: () => {},
    });

    ctl.markDirty();
    timers.advance(50); // timer fires while manual lock held
    await flush();
    assert.equal(saveCount, 0); // must NOT run while locked

    locked = false;
    timers.advance(50); // re-armed → runs now
    await flush();
    assert.equal(saveCount, 1);
    assert.equal(ctl.isDirty(), false);
  } finally {
    timers.restore();
  }
});

test("busy-lock: an in-flight save is not doubled but the retry keeps the newest state", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [], _fromServer: true, id: 1 }];
    const gates = [];
    const sent = [];

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async (snapshot) => {
        sent.push(snapshot);
        const gate = deferred();
        gates.push(gate);
        await gate.promise;
        return true;
      },
      onDirty: () => {},
      onClean: () => {},
    });

    const run1 = ctl.run();
    ctl.markDirty(); // second trigger while first is in flight
    sections.push({ name: "S2", items: [{ name: "b" }] }); // a real edit
    timers.advance(50); // its timer fires while still running
    await flush();
    assert.equal(sent.length, 1); // no overlapping/duplicate request

    gates[0].resolve();
    await run1;

    // newest dirty state is re-sent exactly once after completion
    assert.equal(ctl.isDirty(), true);
    timers.advance(50);
    await flush();
    assert.equal(sent.length, 2);
    gates[1].resolve();
    await flush();
    assert.equal(ctl.isDirty(), false);
  } finally {
    timers.restore();
  }
});

test("failed save never marks state as saved; stays dirty and retryable", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [{ name: "a" }] }];
    let ok = false;
    let errCalls = 0;
    let cleanCalls = 0;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => ok,
      onError: () => errCalls++,
      onClean: () => cleanCalls++,
    });

    ctl.markDirty();
    timers.advance(50);
    await flush();
    assert.equal(ctl.isDirty(), true);
    assert.equal(ctl.getLastSavedSnapshot(), null); // nothing marked saved
    assert.equal(errCalls, 1);
    assert.equal(cleanCalls, 0);

    // retry is possible via a new trigger
    ok = true;
    ctl.markDirty();
    timers.advance(50);
    await flush();
    assert.equal(ctl.isDirty(), false);
    assert.equal(cleanCalls, 1);
  } finally {
    timers.restore();
  }
});

test("a thrown save failure is treated as a failure (not a silent success)", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [{ name: "a" }] }];
    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => {
        throw new Error("network down");
      },
      onError: () => {},
      onClean: () => {},
    });

    ctl.markDirty();
    timers.advance(50);
    await flush();
    assert.equal(ctl.isDirty(), true);
    assert.equal(ctl.getLastSavedSnapshot(), null);
  } finally {
    timers.restore();
  }
});

test("no-edit successful save absorbs bookkeeping: no redundant re-save afterwards", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [{ name: "a" }] }];
    let saveCount = 0;
    let lastCleanBaseline = null;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => {
        saveCount++;
        // server assigns ids — same object gets mutated, no markDirty
        sections[0].id = 5;
        sections[0]._fromServer = true;
        return true;
      },
      onDirty: () => {},
      onClean: () => {
        lastCleanBaseline = ctl.getLastSavedSnapshot();
      },
    });

    ctl.markDirty();
    timers.advance(50);
    await flush();
    assert.equal(saveCount, 1);
    assert.equal(ctl.isDirty(), false);

    // any later trigger where nothing changed is a clean no-op (no HTTP round-trip)
    ctl.markDirty();
    timers.advance(50);
    await flush();
    assert.equal(saveCount, 1);
    assert.ok(lastCleanBaseline !== null);
  } finally {
    timers.restore();
  }
});

test("commitSaved (manual-save path) marks state clean and prevents a redundant auto-save", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    const sections = [{ name: "S1", items: [], _fromServer: true, id: 1 }];
    let saveCount = 0;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => {
        saveCount++;
        return true;
      },
      onDirty: () => {},
      onClean: () => {},
    });

    ctl.commitSaved(JSON.stringify({ state, sections }));
    ctl.markDirty(); // an earlier edit already absorbed by the manual save
    timers.advance(50);
    await flush();
    // nothing changed since the manual save — auto-save must not fire
    assert.equal(saveCount, 0);
  } finally {
    timers.restore();
  }
});

// ---------------- FIX-6 Slice B: failure re-arm / resume ----------------

test("Slice B: a failed save stays dirty and automatically re-arms a retry (no clean transition)", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [{ name: "a" }] }];
    let ok = false;
    let errCalls = 0;
    let cleanCalls = 0;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => ok,
      onError: () => errCalls++,
      onClean: () => cleanCalls++,
    });

    ctl.markDirty();
    timers.advance(50);
    await flush();

    assert.equal(ctl.isDirty(), true);
    assert.equal(ctl.getLastSavedSnapshot(), null); // nothing marked saved
    assert.equal(errCalls, 1);
    assert.equal(cleanCalls, 0);
    // a retry is automatically armed (not dropped)
    assert.equal(timers.pending(), 1);

    // the armed retry alone (no further edit) eventually retries the save
    ok = true;
    timers.advance(5000);
    await flush();
    assert.equal(ctl.isDirty(), false);
    assert.equal(cleanCalls, 1);
    assert.equal(timers.pending(), 0);
  } finally {
    timers.restore();
  }
});

test("Slice B: first failure arms a 5s retry; second and later failures are capped at 15s", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    const sections = [{ name: "S1", items: [{ name: "a" }] }];
    let fail = true;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => !fail,
      onError: () => {},
      onClean: () => {},
    });

    ctl.markDirty();
    timers.advance(50);
    await flush(); // initial attempt fails
    assert.equal(ctl.getRetryFailures(), 1);
    assert.equal(timers.nextAt(), 5000); // first retry delay

    timers.advance(5000);
    await flush(); // first retry fails
    assert.equal(ctl.getRetryFailures(), 2);
    assert.equal(timers.nextAt(), 15000); // second retry delay

    timers.advance(15000);
    await flush(); // second retry fails
    assert.equal(ctl.getRetryFailures(), 3);
    assert.equal(timers.nextAt(), 15000); // capped, not growing unbounded

    // recovery: the capped retry eventually persists and stops retrying
    fail = false;
    timers.advance(15000);
    await flush();
    assert.equal(ctl.isDirty(), false);
    assert.equal(timers.pending(), 0);
    assert.equal(ctl.getRetryFailures(), 0);
  } finally {
    timers.restore();
  }
});

test("Slice B: success resets retry state — a later failure starts a fresh 5s retry", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [{ name: "a" }] }];
    let ok = false;
    let saveCount = 0;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => {
        saveCount++;
        return ok;
      },
      onError: () => {},
      onClean: () => {},
    });

    ctl.markDirty();
    timers.advance(50);
    await flush(); // failure #1 → 5s retry armed, failures=1
    assert.equal(ctl.getRetryFailures(), 1);
    assert.equal(timers.nextAt(), 5000);

    ok = true;
    timers.advance(5000);
    await flush(); // retry succeeds
    assert.equal(ctl.isDirty(), false);
    assert.equal(ctl.getRetryFailures(), 0);
    assert.equal(timers.pending(), 0); // no extra retry after success

    // a brand-new failure chain starts over at the 5s delay (proves reset)
    ok = false;
    sections.push({ name: "S2", items: [{ name: "b" }] }); // real edit
    ctl.markDirty();
    timers.advance(50);
    await flush();
    assert.equal(ctl.getRetryFailures(), 1);
    assert.equal(timers.nextAt(), 5000);
  } finally {
    timers.restore();
  }
});

test("Slice B: no overlapping saves — retry + focus/visibility resumes never stack a second request", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [{ name: "a" }] }];
    const gates = [];
    let saveCount = 0;
    let ok = false;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => {
        saveCount++;
        const gate = deferred();
        gates.push(gate);
        return await gate.promise;
      },
      onError: () => {},
      onClean: () => {},
    });

    ctl.markDirty();
    timers.advance(50);
    await flush(); // attempt 1 starts and is awaiting its gate
    assert.equal(saveCount, 1);
    gates[0].resolve(ok); // ok=false → fails
    await flush(); // failure → retry armed (5s)
    assert.equal(timers.nextAt(), 5000);
    assert.equal(saveCount, 1);

    // visibility + focus resume while the retry timer is pending → no stack
    ctl.resume();
    ctl.resume();
    assert.equal(timers.pending(), 1);
    assert.equal(timers.nextAt(), 5000); // same timer, not re-armed

    // retry fires and starts an in-flight save
    timers.advance(5000);
    await flush();
    assert.equal(saveCount, 2);
    assert.equal(gates.length, 2); // retry request started, awaiting gate

    // focus/visibility while the save is in flight → no second save
    ctl.resume();
    ctl.resume();
    assert.equal(saveCount, 2);
    assert.equal(timers.pending(), 0);

    ok = true;
    gates[1].resolve(ok);
    await flush();
    assert.equal(ctl.isDirty(), false);
    assert.equal(saveCount, 2);
    assert.equal(timers.pending(), 0);

    // focus/visibility while clean does nothing
    ctl.resume();
    assert.equal(saveCount, 2);
  } finally {
    timers.restore();
  }
});

test("Slice B: edit during a pending retry — single timer, stamp increments, newest state re-sent, no duplicate save", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [{ name: "a" }], _fromServer: true, id: 1 }];
    let ok = false;
    let saveCount = 0;
    const sent = [];
    let stampBefore = 0;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async (snapshot) => {
        saveCount++;
        sent.push(snapshot);
        return ok;
      },
      onDirty: () => {},
      onError: () => {},
      onClean: () => {},
    });

    ctl.markDirty();
    const stampEdit1 = ctl.getStamp();
    timers.advance(50);
    await flush(); // attempt 1 fails → retry armed at 5s
    assert.equal(ctl.getRetryFailures(), 1);
    assert.equal(timers.nextAt(), 5000);

    // user edits while the retry timer is still pending
    ctl.markDirty();
    stampBefore = ctl.getStamp();
    assert.ok(stampBefore > stampEdit1); // stamp increments normally
    sections.push({ name: "S2", items: [{ name: "b" }] });
    const snapshotWithEdit = JSON.stringify({ state, sections });

    // the edit re-armed debounce (clearing the retry) — exactly one timer
    assert.equal(timers.pending(), 1);
    assert.equal(timers.nextAt(), 50);
    assert.equal(saveCount, 1); // no duplicate request from the edit

    ok = true;
    timers.advance(50);
    await flush(); // the pending timer sends the NEWEST state once
    assert.equal(saveCount, 2);
    assert.equal(sent[1], snapshotWithEdit);
    assert.equal(ctl.isDirty(), false);
    assert.equal(timers.pending(), 0);
  } finally {
    timers.restore();
  }
});

test("Slice B: resume — dirty work continues, clean state does not save, existing timer is not duplicated", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [{ name: "a" }] }];
    let saveCount = 0;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => {
        saveCount++;
        return true;
      },
      onError: () => {},
      onClean: () => {},
    });

    // clean state → resume must not trigger anything
    ctl.commitSaved(JSON.stringify({ state, sections }));
    ctl.resume();
    assert.equal(saveCount, 0);
    assert.equal(timers.pending(), 0);

    // a real edit makes it dirty
    sections.push({ name: "S2", items: [{ name: "b" }] });
    // dirty with a timer already pending → resume must not stack a timer
    ctl.markDirty();
    assert.equal(timers.pending(), 1);
    ctl.resume();
    assert.equal(timers.pending(), 1);
    ctl.resume();
    assert.equal(timers.pending(), 1);

    // dirty with NO timer (e.g. the debounce was cancelled) → resume re-arms
    ctl.cancel();
    assert.equal(timers.pending(), 0);
    assert.equal(ctl.isDirty(), true);
    ctl.resume();
    assert.equal(timers.pending(), 1);
    timers.advance(50);
    await flush();
    assert.equal(saveCount, 1); // the resumed save ran exactly once
    assert.equal(ctl.isDirty(), false);
    assert.equal(timers.pending(), 0);
  } finally {
    timers.restore();
  }
});

test("Slice B: FIX-3 stamp regression — edit during a failing in-flight save keeps both stamps unsaved and re-sends on the retry", async () => {
  const timers = installFakeTimers();
  try {
    const state = { projectName: "P1" };
    let sections = [{ name: "S1", items: [{ name: "a" }], _fromServer: true, id: 1 }];
    const gates = [];
    let saveCount = 0;
    const sent = [];
    let ok = false;

    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async (snapshot) => {
        saveCount++;
        sent.push(snapshot);
        const gate = deferred();
        gates.push(gate);
        return await gate.promise;
      },
      onDirty: () => {},
      onError: () => {},
      onClean: () => {},
    });

    const snapshotA = JSON.stringify({ state, sections });
    const run1 = ctl.run();
    const stampAtSaveStart = ctl.getStamp();

    // edit while the save is in flight → newer stamp, newer snapshot
    ctl.markDirty();
    assert.equal(ctl.getStamp(), stampAtSaveStart + 1);
    sections.push({ name: "S2", items: [{ name: "b" }] });
    const snapshotB = JSON.stringify({ state, sections });

    // the in-flight save fails
    gates[0].resolve(ok); // ok=false
    await run1;
    // neither snapshot got marked persisted; both stamps remain dirty;
    // a retry is re-armed on the single timer (it replaced the edit's debounce)
    assert.equal(ctl.getLastSavedSnapshot(), null);
    assert.equal(ctl.isDirty(), true);
    assert.equal(timers.pending(), 1);

    // the retry sends the NEWEST snapshot, not the stale one
    timers.advance(5000);
    await flush();
    assert.equal(saveCount, 2);
    assert.equal(gates.length, 2);
    ok = true;
    gates[1].resolve(ok);
    await flush();
    assert.equal(sent[1], snapshotB);
    // only snapshot B is now marked saved — A was never persisted
    assert.equal(ctl.getLastSavedSnapshot(), snapshotB);
    assert.equal(ctl.isDirty(), false);
    assert.equal(timers.pending(), 0);
  } finally {
    timers.restore();
  }
});

// ---------------- FIX-6 Slice D-1: dirty snapshot + selective clear ----------------

test("D-1: createDirtySnapshot is an isolated copy — mid-save marks never appear in it", () => {
  const live = {
    quote: true,
    sections: new Set([1]),
    rooms: new Set([10]),
    items: new Set([100]),
  };
  const snap = AutoSaveCore.createDirtySnapshot(live);
  live.quote = false;
  live.sections.add(2);
  live.rooms.add(11);
  live.items.add(200);

  // the snapshot froze the state at capture time...
  assert.equal(snap.quote, true);
  assert.deepEqual([...snap.sections], [1]);
  assert.deepEqual([...snap.rooms], [10]);
  assert.deepEqual([...snap.items], [100]);
  // ...and later live changes do not alias into it
  assert.deepEqual([...live.sections], [1, 2]);
  assert.deepEqual([...live.rooms], [10, 11]);
  assert.deepEqual([...live.items], [100, 200]);
  // mutating the snapshot cannot touch the live state either
  snap.sections.add(99);
  assert.deepEqual([...live.sections], [1, 2]);
});

test("D-1: clearDirtySnapshot removes ONLY snapshot keys; entities added after the snapshot survive", () => {
  const live = {
    quote: false,
    sections: new Set([1, 2]),
    rooms: new Set([10]),
    items: new Set([100]),
  };
  const snap = AutoSaveCore.createDirtySnapshot(live);
  // "during the save" new marks arrive — these must NOT be cleared
  live.sections.add(3);
  live.rooms.add(11);
  live.items.add(200);

  const cleared = AutoSaveCore.clearDirtySnapshot(live, snap);
  assert.equal(cleared, 4); // sections[1,2]=2, rooms[10]=1, items[100]=1, quote untouched
  assert.deepEqual([...live.sections], [3]);
  assert.deepEqual([...live.rooms], [11]);
  assert.deepEqual([...live.items], [200]);
});

test("D-1: quote is cleared only when it was dirty in the snapshot", () => {
  // dirty at snapshot time → cleared
  const dirtyQ = { quote: true, sections: new Set(), rooms: new Set(), items: new Set() };
  assert.equal(
    AutoSaveCore.clearDirtySnapshot(dirtyQ, AutoSaveCore.createDirtySnapshot(dirtyQ)),
    1
  );
  assert.equal(dirtyQ.quote, false);

  // NOT dirty at snapshot time → never cleared, even if the flag flips mid-save
  const wasClean = { quote: false, sections: new Set(), rooms: new Set(), items: new Set() };
  const snap = AutoSaveCore.createDirtySnapshot(wasClean); // snap.quote === false
  wasClean.quote = true;
  assert.equal(AutoSaveCore.clearDirtySnapshot(wasClean, snap), 0);
  assert.equal(wasClean.quote, true);
});

test("D-1: clearing is idempotent — a second pass is a no-op with no corruption", () => {
  const live = { quote: true, sections: new Set([1]), rooms: new Set([10]), items: new Set([100]) };
  const snap = AutoSaveCore.createDirtySnapshot(live);
  assert.equal(AutoSaveCore.clearDirtySnapshot(live, snap), 4);
  assert.equal(AutoSaveCore.clearDirtySnapshot(live, snap), 0);
  assert.equal(live.quote, false);
  assert.deepEqual([...live.sections], []);
  assert.deepEqual([...live.rooms], []);
  assert.deepEqual([...live.items], []);
});

test("D-1: a clean cycle (no concurrent edits) clears exactly the snapshot keys", async () => {
  const timers = installFakeTimers();
  try {
    const live = { quote: true, sections: new Set([1]), rooms: new Set([10]), items: new Set([100, 101]) };
    let cleanCalls = 0;
    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ sections: [] }),
      runSave: async () => {
        const saveStart = ctl.getStamp();
        const snap = AutoSaveCore.createDirtySnapshot(live);
        if (ctl.getStamp() === saveStart) {
          AutoSaveCore.clearDirtySnapshot(live, snap);
        }
        return true;
      },
      onError: () => {},
      onClean: () => { cleanCalls++; },
      onDirty: () => {},
    });

    ctl.markDirty();
    timers.advance(50);
    await flush();
    assert.equal(cleanCalls, 1);
    assert.equal(live.quote, false);
    assert.deepEqual([...live.sections], []);
    assert.deepEqual([...live.rooms], []);
    assert.deepEqual([...live.items], []);
    assert.equal(ctl.isDirty(), false);
  } finally {
    timers.restore();
  }
});

test("D-1: edit during save — stamp moves, snapshot is NOT cleared, the new mark stays dirty and is re-sent", async () => {
  const timers = installFakeTimers();
  try {
    const live = { quote: true, sections: new Set([1]), rooms: new Set([10]), items: new Set([100, 101]) };
    let state = { projectName: "P" };
    let sections = [{ id: 1, items: [{ id: 100 }, { id: 101 }] }];
    let cleanCalls = 0;
    let concurrentEditDone = false;
    const stampAtSaveStart = { value: -1 };
    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ state, sections }),
      runSave: async () => {
        const saveStart = ctl.getStamp();
        stampAtSaveStart.value = saveStart;
        const snap = AutoSaveCore.createDirtySnapshot(live);
        if (!concurrentEditDone) {
          concurrentEditDone = true;
          // a real edit DURING the save: new item C + its bookkeeping + a stamp bump
          sections[0].items.push({ id: 200 });
          live.items.add(200);
          live.rooms.add(11);
          ctl.markDirty();
        }
        if (ctl.getStamp() === saveStart) {
          AutoSaveCore.clearDirtySnapshot(live, snap);
        }
        return true;
      },
      onError: () => {},
      onClean: () => { cleanCalls++; },
      onDirty: () => {},
    });

    ctl.markDirty();
    timers.advance(50);
    await flush();

    // the snapshot A/B keys are NOT cleared while the new C mark came in mid-save
    assert.equal(cleanCalls, 0);
    assert.equal(ctl.isDirty(), true);
    assert.equal(ctl.getStamp(), stampAtSaveStart.value + 1);
    assert.deepEqual([...live.sections], [1]);
    assert.deepEqual([...live.rooms], [10, 11]);
    assert.deepEqual([...live.items], [100, 101, 200]);
    assert.equal(live.quote, true);

    // once the edit settles, the whole still-dirty state is re-sent and cleared
    timers.advance(50);
    await flush();
    assert.equal(cleanCalls, 1);
    assert.equal(ctl.isDirty(), false);
    assert.deepEqual([...live.sections], []);
    assert.deepEqual([...live.rooms], []);
    assert.deepEqual([...live.items], []);
    assert.equal(live.quote, false);
  } finally {
    timers.restore();
  }
});

test("D-1: a failed save never clears — dirty state survives, retry clears once it succeeds", async () => {
  const timers = installFakeTimers();
  try {
    const live = { quote: true, sections: new Set([1]), rooms: new Set([10]), items: new Set([100]) };
    let ok = false;
    let cleanCalls = 0;
    const ctl = AutoSaveCore.createController({
      debounceMs: 50,
      readSnapshot: () => JSON.stringify({ sections: [{ id: 1 }] }),
      runSave: async () => {
        const snap = AutoSaveCore.createDirtySnapshot(live);
        if (!ok) {
          // failure path: nothing is cleared before returning false
          assert.deepEqual([...live.sections], [1]);
          assert.equal(live.quote, true);
          return false;
        }
        const saveStart = ctl.getStamp();
        if (ctl.getStamp() === saveStart) {
          AutoSaveCore.clearDirtySnapshot(live, snap);
        }
        return true;
      },
      onError: () => {},
      onClean: () => { cleanCalls++; },
      onDirty: () => {},
    });

    ctl.markDirty();
    timers.advance(50);
    await flush(); // initial attempt fails
    assert.equal(ctl.isDirty(), true);
    assert.equal(cleanCalls, 0);
    assert.deepEqual([...live.sections], [1]);
    assert.deepEqual([...live.rooms], [10]);
    assert.deepEqual([...live.items], [100]);
    assert.equal(live.quote, true);

    // the armed retry (FIX-6B) succeeds and then clears
    ok = true;
    timers.advance(5000);
    await flush();
    assert.equal(ctl.isDirty(), false);
    assert.equal(cleanCalls, 1);
    assert.deepEqual([...live.sections], []);
    assert.deepEqual([...live.rooms], []);
    assert.deepEqual([...live.items], []);
    assert.equal(live.quote, false);
    assert.equal(timers.pending(), 0);
  } finally {
    timers.restore();
  }
});