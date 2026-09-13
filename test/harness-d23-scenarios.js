"use strict";

// -----------------------------------------------------------------------------
// D-2.3 REPLACEMENT — Increment 2A ONLY (structural scenario contracts).
// This is NOT the original harness-c. It is a NEW, self-identifying replacement
// skeleton. Pure data + small pure helpers. No browser, no fs, no require of
// production. No fabricated request counts — live probes are BLOCKED and never
// reported as PASS.
// -----------------------------------------------------------------------------

const COUNTER_KEYS = [
  "quotePut",
  "sectionPut",
  "sectionPost",
  "roomPut",
  "roomPost",
  "itemPut",
  "itemPost",
  "itemDelete",
  "other",
];

function createRequestCounters() {
  const c = {};
  for (const k of COUNTER_KEYS) c[k] = 0;
  return c;
}

// A1 - Single Item Edit
const scenarioA1 = {
  name: "A1",
  description: "Single Item Edit",
  expected: { quotePut: 1, itemPut: 1 },
  zero: ["sectionPut", "sectionPost", "roomPut", "roomPost", "itemPost", "itemDelete", "other"],
};

// A2 - Room Edit
const scenarioA2 = {
  name: "A2",
  description: "Room Edit",
  expected: { quotePut: 1, roomPut: 1 },
  zero: ["sectionPut", "sectionPost", "roomPost", "itemPut", "itemPost", "itemDelete", "other"],
};

// A3 - Section Edit
const scenarioA3 = {
  name: "A3",
  description: "Section Edit",
  expected: { quotePut: 1, sectionPut: 1 },
  zero: ["sectionPost", "roomPut", "roomPost", "itemPut", "itemPost", "itemDelete", "other"],
};

// A4 - Header-Only Edit
const scenarioA4 = {
  name: "A4",
  description: "Header-Only Edit",
  expected: { quotePut: 1 },
  zero: ["sectionPut", "sectionPost", "roomPut", "roomPost", "itemPut", "itemPost", "itemDelete", "other"],
};

// A5 - Three Item Edits
const scenarioA5 = {
  name: "A5",
  description: "Three Item Edits",
  expected: { quotePut: 1, itemPut: 3 },
  zero: ["sectionPut", "sectionPost", "roomPut", "roomPost", "itemPost", "itemDelete", "other"],
};

const ALL_SCENARIOS = [scenarioA1, scenarioA2, scenarioA3, scenarioA4, scenarioA5];

function getScenario(name) {
  for (const s of ALL_SCENARIOS) {
    if (s.name === name) return s;
  }
  return null;
}

function matchesExpected(actual, expected) {
  if (!actual || !expected) return false;
  for (const k of COUNTER_KEYS) {
    if ((actual[k] || 0) !== (expected[k] || 0)) return false;
  }
  return true;
}

module.exports = {
  COUNTER_KEYS,
  createRequestCounters,
  ALL_SCENARIOS,
  getScenario,
  matchesExpected,
};
