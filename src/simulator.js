const policies = require("./policies");

const MAX_REGULATION_PENALTY_MIN = 15;
const SLOT_TOLERANCE_WINDOW_MIN = 10;

function estimateCtotMin(flight, adjustedEobtMin) {
  const regulationPenalty = Math.round(
    (flight.regulationSeverity || 0) * MAX_REGULATION_PENALTY_MIN
  );
  // In this simplified model, CTOT cannot be earlier than the original assigned CTOT,
  // and may move later when adjusted EOBT plus regulation pressure requires it.
  return Math.max(flight.initialCtotMin, adjustedEobtMin + regulationPenalty);
}

function simulateFlight(flight, policyFn) {
  const { adjustedEobtMin, revisionCount } = policyFn(flight);
  const ctotMin = estimateCtotMin(flight, adjustedEobtMin);
  const offblockMin = Math.max(flight.readyMin, ctotMin);

  const atfmDelayMin = Math.max(0, ctotMin - adjustedEobtMin);
  const departureDelayMin = Math.max(0, offblockMin - flight.eobtMin);
  const ctotShiftMin = Math.abs(ctotMin - flight.initialCtotMin);
  const slotMissCount = isSlotMissed(flight.readyMin, ctotMin) ? 1 : 0;

  return {
    flightId: flight.flightId,
    adjustedEobtMin,
    ctotMin,
    offblockMin,
    atfmDelayMin,
    departureDelayMin,
    ctotShiftMin,
    slotMissCount,
    revisionCount,
  };
}

function isSlotMissed(readyMin, ctotMin) {
  return readyMin > ctotMin + SLOT_TOLERANCE_WINDOW_MIN;
}

function aggregate(results) {
  if (results.length === 0) {
    return {
      flights: 0,
      avgAtfmDelayMin: 0,
      avgDepartureDelayMin: 0,
      avgCtotShiftMin: 0,
      slotMissCount: 0,
      revisionCount: 0,
    };
  }

  const totals = results.reduce(
    (acc, row) => {
      acc.atfmDelayMin += row.atfmDelayMin;
      acc.departureDelayMin += row.departureDelayMin;
      acc.ctotShiftMin += row.ctotShiftMin;
      acc.slotMissCount += row.slotMissCount;
      acc.revisionCount += row.revisionCount;
      return acc;
    },
    {
      atfmDelayMin: 0,
      departureDelayMin: 0,
      ctotShiftMin: 0,
      slotMissCount: 0,
      revisionCount: 0,
    }
  );

  const flights = results.length;
  const round2 = (value) => Math.round(value * 100) / 100;
  return {
    flights,
    avgAtfmDelayMin: round2(totals.atfmDelayMin / flights),
    avgDepartureDelayMin: round2(totals.departureDelayMin / flights),
    avgCtotShiftMin: round2(totals.ctotShiftMin / flights),
    slotMissCount: totals.slotMissCount,
    revisionCount: totals.revisionCount,
  };
}

function runSimulation(flights, selectedPolicies) {
  const policyMap = selectedPolicies || {
    keep_original_eobt: policies.keepOriginalEobt,
    proactive_risk_update: policies.proactiveRiskUpdate,
    stability_postpone: policies.stabilityPostpone,
  };

  const output = {};
  for (const [policyName, policyFn] of Object.entries(policyMap)) {
    const details = flights.map((flight) => simulateFlight(flight, policyFn));
    output[policyName] = {
      summary: aggregate(details),
      details,
    };
  }
  return output;
}

module.exports = {
  estimateCtotMin,
  isSlotMissed,
  simulateFlight,
  runSimulation,
};
