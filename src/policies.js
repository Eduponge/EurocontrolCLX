function keepOriginalEobt(flight) {
  return { adjustedEobtMin: flight.eobtMin, revisionCount: 0 };
}

function proactiveRiskUpdate(flight) {
  const riskDelay = flight.readyMin - flight.eobtMin;
  if (riskDelay <= 15) {
    return { adjustedEobtMin: flight.eobtMin, revisionCount: 0 };
  }

  return { adjustedEobtMin: flight.readyMin - 5, revisionCount: 1 };
}

function stabilityPostpone(flight) {
  const target = Math.max(flight.eobtMin, flight.readyMin - 10);
  const rounded = Math.ceil(target / 5) * 5;
  const changed = rounded !== flight.eobtMin;
  return { adjustedEobtMin: rounded, revisionCount: changed ? 1 : 0 };
}

module.exports = {
  keepOriginalEobt,
  proactiveRiskUpdate,
  stabilityPostpone,
};
