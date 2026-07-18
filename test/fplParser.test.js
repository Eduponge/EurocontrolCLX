const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAftnFpl, planCtot, hhmmToMin, minToHHMM } = require("../src/fplParser");

const SAMPLE_FPL = `(FPL-PRABC-IS
-C172/L-S/C
-SBGR0230
-N0120F080 DCT
-SBGL0130 SBGR
-RMK/EQUIPAMENTO GPS E TRANSPONDER MODO C)`;

// ─── parseAftnFpl ────────────────────────────────────────────────────────────

test("parseAftnFpl extracts callsign and flight rules from field 7", () => {
  const result = parseAftnFpl(SAMPLE_FPL);
  assert.equal(result.callsign, "PRABC");
  assert.equal(result.flightRules, "I");
});

test("parseAftnFpl extracts aircraft type and wake turbulence from field 9", () => {
  const result = parseAftnFpl(SAMPLE_FPL);
  assert.equal(result.aircraftType, "C172");
  assert.equal(result.wakeTurbulence, "L");
});

test("parseAftnFpl extracts ADEP and EOBT from field 13", () => {
  const result = parseAftnFpl(SAMPLE_FPL);
  assert.equal(result.adep, "SBGR");
  assert.equal(result.eobtHHMM, "0230");
  assert.equal(result.eobtMin, 150); // 2 * 60 + 30
});

test("parseAftnFpl extracts ADES, EET and alternate from field 16", () => {
  const result = parseAftnFpl(SAMPLE_FPL);
  assert.equal(result.ades, "SBGL");
  assert.equal(result.eetHHMM, "0130");
  assert.equal(result.eetMin, 90); // 1 * 60 + 30
  assert.equal(result.altn, "SBGR");
});

test("parseAftnFpl handles FPL without alternate", () => {
  const fpl = `(FPL-PRABC-IS
-C172/L-S/C
-SBGR0230
-N0120F080 DCT
-SBGL0130
-RMK/NO ALTN)`;
  const result = parseAftnFpl(fpl);
  assert.equal(result.ades, "SBGL");
  assert.equal(result.altn, null);
});

test("parseAftnFpl handles FPL without enclosing parentheses", () => {
  const fpl = `FPL-PRABC-IS
-C172/L-S/C
-SBGR0230
-N0120F080 DCT
-SBGL0130 SBGR`;
  const result = parseAftnFpl(fpl);
  assert.equal(result.callsign, "PRABC");
  assert.equal(result.adep, "SBGR");
});

test("parseAftnFpl throws on missing field 7", () => {
  assert.throws(() => parseAftnFpl("not a valid FPL"), /Invalid FPL format/);
});

test("parseAftnFpl throws on empty input", () => {
  assert.throws(() => parseAftnFpl("   "), /Invalid FPL format/);
});

// ─── hhmmToMin / minToHHMM ───────────────────────────────────────────────────

test("hhmmToMin converts 0000 to 0", () => {
  assert.equal(hhmmToMin("0000"), 0);
});

test("hhmmToMin converts 0230 to 150", () => {
  assert.equal(hhmmToMin("0230"), 150);
});

test("hhmmToMin converts 2359 to 1439", () => {
  assert.equal(hhmmToMin("2359"), 23 * 60 + 59);
});

test("minToHHMM converts 0 to 0000", () => {
  assert.equal(minToHHMM(0), "0000");
});

test("minToHHMM converts 150 to 0230", () => {
  assert.equal(minToHHMM(150), "0230");
});

test("minToHHMM wraps midnight correctly", () => {
  assert.equal(minToHHMM(24 * 60), "0000");
});

// ─── planCtot ────────────────────────────────────────────────────────────────

test("planCtot computes correct ATFM delay", () => {
  const fpl = parseAftnFpl(SAMPLE_FPL); // EOBT = 0230 = 150 min
  const plan = planCtot(fpl, 195); // CTOT = 03:15 = 195 min
  assert.equal(plan.atfmDelayMin, 45);
});

test("planCtot computes correct slot window", () => {
  const fpl = parseAftnFpl(SAMPLE_FPL); // EOBT = 150 min
  const plan = planCtot(fpl, 195); // CTOT = 195 min
  assert.equal(plan.slotWindow.openMin, 190);   // 195 - 5
  assert.equal(plan.slotWindow.closeMin, 205);  // 195 + 10
});

test("planCtot proactive strategy revises EOBT when delay > 15 min", () => {
  const fpl = parseAftnFpl(SAMPLE_FPL); // EOBT = 150 min
  const plan = planCtot(fpl, 195); // delay = 45 min > 15
  assert.equal(plan.strategies.proactive_revision.eobtMin, 190); // CTOT - 5
  assert.equal(plan.strategies.proactive_revision.revisionMin, 40);
});

test("planCtot proactive strategy keeps EOBT when delay ≤ 15 min", () => {
  const fpl = parseAftnFpl(SAMPLE_FPL); // EOBT = 150 min
  const plan = planCtot(fpl, 160); // delay = 10 min ≤ 15
  assert.equal(plan.strategies.proactive_revision.eobtMin, 150);
  assert.equal(plan.strategies.proactive_revision.revisionMin, 0);
});

test("planCtot stability strategy rounds to nearest 5-min boundary", () => {
  const fpl = parseAftnFpl(SAMPLE_FPL); // EOBT = 150 min
  const plan = planCtot(fpl, 197); // CTOT = 197 min, slotOpen = 192
  // rawStability = max(150, 192) = 192 → ceil(192/5)*5 = 195
  assert.equal(plan.strategies.stability_rounded.eobtMin, 195);
});

test("planCtot keep_original strategy never revises EOBT", () => {
  const fpl = parseAftnFpl(SAMPLE_FPL);
  const plan = planCtot(fpl, 300);
  assert.equal(plan.strategies.keep_original_eobt.eobtMin, fpl.eobtMin);
  assert.equal(plan.strategies.keep_original_eobt.revisionMin, 0);
});
