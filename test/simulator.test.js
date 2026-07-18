const test = require("node:test");
const assert = require("node:assert/strict");
const { runSimulation } = require("../src/simulator");

const flights = [
  {
    flightId: "A",
    eobtMin: 600,
    readyMin: 640,
    initialCtotMin: 620,
    regulationSeverity: 0.8,
  },
  {
    flightId: "B",
    eobtMin: 720,
    readyMin: 730,
    initialCtotMin: 730,
    regulationSeverity: 0.2,
  },
];

test("simulation returns all required policies", () => {
  const result = runSimulation(flights);
  assert.ok(result.keep_original_eobt);
  assert.ok(result.proactive_risk_update);
  assert.ok(result.stability_postpone);
});

test("proactive strategy reduces slot misses in delayed scenario", () => {
  const result = runSimulation(flights);
  assert.ok(
    result.proactive_risk_update.summary.slotMissCount <=
      result.keep_original_eobt.summary.slotMissCount
  );
});

test("summaries expose aggregated metrics", () => {
  const result = runSimulation(flights);
  const summary = result.stability_postpone.summary;
  assert.equal(typeof summary.avgAtfmDelayMin, "number");
  assert.equal(typeof summary.avgDepartureDelayMin, "number");
  assert.equal(typeof summary.avgCtotShiftMin, "number");
});
