const fs = require("fs");
const path = require("path");
const { runSimulation } = require("./simulator");

function loadFlights(filePath) {
  const absPath = path.resolve(filePath);
  const raw = fs.readFileSync(absPath, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error("Input JSON must be an array of flights.");
  }
  return data;
}

function main() {
  const input = process.argv[2] || "data/sample_flights.json";
  const flights = loadFlights(input);
  const result = runSimulation(flights);

  console.log(`Loaded ${flights.length} flights from ${path.resolve(input)}`);
  console.table(
    Object.entries(result).map(([policy, value]) => ({
      policy,
      ...value.summary,
    }))
  );
}

if (require.main === module) {
  main();
}

module.exports = { loadFlights };
