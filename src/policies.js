const PROACTIVE_RISK_DELAY_THRESHOLD_MIN = 15;
const PROACTIVE_READY_BUFFER_MIN = 5;
const STABILITY_READY_BUFFER_MIN = 10;
const STABILITY_ROUNDING_STEP_MIN = 5;

function keepOriginalEobt(flight) {
  return { adjustedEobtMin: flight.eobtMin, revisionCount: 0 };
}

function proactiveRiskUpdate(flight) {
  const riskDelay = flight.readyMin - flight.eobtMin;
  if (riskDelay <= PROACTIVE_RISK_DELAY_THRESHOLD_MIN) {
    return { adjustedEobtMin: flight.eobtMin, revisionCount: 0 };
  }

  return {
    adjustedEobtMin: flight.readyMin - PROACTIVE_READY_BUFFER_MIN,
    revisionCount: 1,
  };
}

function stabilityPostpone(flight) {
  const target = Math.max(flight.eobtMin, flight.readyMin - STABILITY_READY_BUFFER_MIN);
  const rounded =
    Math.ceil(target / STABILITY_ROUNDING_STEP_MIN) * STABILITY_ROUNDING_STEP_MIN;
  const changed = rounded !== flight.eobtMin;
  return { adjustedEobtMin: rounded, revisionCount: changed ? 1 : 0 };
}

module.exports = {
  keepOriginalEobt,
  proactiveRiskUpdate,
  stabilityPostpone,
};
