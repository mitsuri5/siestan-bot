const fs = require("fs/promises");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const signalsPath = path.join(dataDir, "signals.json");
const discoveriesPath = path.join(dataDir, "discoveries.json");

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
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

  const existingSignals = await readJsonArray(signalsPath);
  const scanResult = {
    scanned_at: new Date().toISOString(),
    chain,
    signals
  };

  existingSignals.push(scanResult);
  await fs.writeFile(signalsPath, `${JSON.stringify(existingSignals, null, 2)}\n`);

  return scanResult;
}

async function saveDiscoveryResult({ chain, discoveries }) {
  await fs.mkdir(dataDir, { recursive: true });

  const existingDiscoveries = await readJsonArray(discoveriesPath);
  const discoveryResult = {
    discovered_at: new Date().toISOString(),
    chain,
    discoveries
  };

  existingDiscoveries.push(discoveryResult);
  await fs.writeFile(discoveriesPath, `${JSON.stringify(existingDiscoveries, null, 2)}\n`);

  return discoveryResult;
}

module.exports = {
  saveDiscoveryResult,
  saveScanResult
};
