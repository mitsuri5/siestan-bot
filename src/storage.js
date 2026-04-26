const fs = require("fs/promises");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const signalsPath = path.join(dataDir, "signals.json");

async function readExistingSignals() {
  try {
    const raw = await fs.readFile(signalsPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function saveScanResult({ chain, signals }) {
  await fs.mkdir(dataDir, { recursive: true });

  const existingSignals = await readExistingSignals();
  const scanResult = {
    scanned_at: new Date().toISOString(),
    chain,
    signals
  };

  existingSignals.push(scanResult);
  await fs.writeFile(signalsPath, `${JSON.stringify(existingSignals, null, 2)}\n`);

  return scanResult;
}

module.exports = {
  saveScanResult
};
