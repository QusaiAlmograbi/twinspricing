"use strict";

const { test } = require("node:test");
const assert = require("node:assert");

const {
  COUNTER_KEYS,
  ALL_SCENARIOS,
  getScenario,
  matchesExpected,
  createRequestCounters,
} = require("./harness-d23-scenarios.js");

const EXPECTED_NAMES = ["A1", "A2", "A3", "A4", "A5"];

test("T1: exactly five scenarios, named A1..A5", () => {
  assert.strictEqual(ALL_SCENARIOS.length, 5);
  assert.deepStrictEqual(
    ALL_SCENARIOS.map((s) => s.name),
    EXPECTED_NAMES
  );
});

test("T2: every scenario has a description", () => {
  for (const s of ALL_SCENARIOS) {
    assert.strictEqual(typeof s.description, "string");
    assert.ok(s.description.length > 0, s.name + " description must be non-empty");
  }
});

test("T3: A1 counters are correct", () => {
  const s = getScenario("A1");
  assert.ok(s, "A1 must exist");
  assert.strictEqual(s.expected.quotePut, 1);
  assert.strictEqual(s.expected.itemPut, 1);
});

test("T4: A2 counters are correct", () => {
  const s = getScenario("A2");
  assert.ok(s, "A2 must exist");
  assert.strictEqual(s.expected.quotePut, 1);
  assert.strictEqual(s.expected.roomPut, 1);
});

test("T5: A3 counters are correct", () => {
  const s = getScenario("A3");
  assert.ok(s, "A3 must exist");
  assert.strictEqual(s.expected.quotePut, 1);
  assert.strictEqual(s.expected.sectionPut, 1);
});

test("T6: A4 counters are correct (header-only)", () => {
  const s = getScenario("A4");
  assert.ok(s, "A4 must exist");
  assert.strictEqual(s.expected.quotePut, 1);
  let allZero = true;
  for (const k of COUNTER_KEYS) {
    if (k === "quotePut") continue;
    if ((s.expected[k] || 0) !== 0) allZero = false;
  }
  assert.ok(allZero, "A4 entity-level counters must all be 0");
});

test("T7: A5 counters are correct (three item edits)", () => {
  const s = getScenario("A5");
  assert.ok(s, "A5 must exist");
  assert.strictEqual(s.expected.quotePut, 1);
  assert.strictEqual(s.expected.itemPut, 3);
});

test("T3e: matchesExpected true on exact match", () => {
  const actual = createRequestCounters();
  actual.quotePut = 1;
  actual.itemPut = 1;
  assert.ok(matchesExpected(actual, getScenario("A1").expected));
});

test("T3f: matchesExpected false on deliberately wrong count", () => {
  const actual = createRequestCounters();
  actual.quotePut = 1;
  actual.itemPut = 2; // deliberate wrong value
  assert.strictEqual(matchesExpected(actual, getScenario("A1").expected), false);
});

test("T8: getScenario('A1') returns A1, unknown returns null", () => {
  assert.strictEqual(getScenario("A1").name, "A1");
  assert.strictEqual(getScenario("does-not-exist"), null);
});
