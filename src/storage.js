const fs = require("fs/promises");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const signalsPath = path.join(dataDir, "signals.json");
const discoveriesPath = path.join(dataDir, "discoveries.json");
const radarPath = path.join(dataDir, "radar.json");
const sm90dCachePath = path.join(dataDir, "sm90d-cache.json");
const watchlistPath = path.join(dataDir, "watchlist.json");

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

async function saveRadarResult({ chain, results, stats }) {
  await fs.mkdir(dataDir, { recursive: true });

  const existingResults = await readJsonArray(radarPath);
  const radarResult = {
    radar_at: new Date().toISOString(),
    chain,
    stats,
    results
  };

  existingResults.push(radarResult);
  await fs.writeFile(radarPath, `${JSON.stringify(existingResults, null, 2)}\n`);

  return radarResult;
}

async function readRadarResults() {
  return readJsonArray(radarPath);
}

async function readSm90dCache() {
  try {
    const raw = await fs.readFile(sm90dCachePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeSm90dCache(cache) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(sm90dCachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

async function readWatchlist() {
  return readJsonArray(watchlistPath);
}

function isSameWatchItem(item, { userId, chain, tokenAddress }) {
  return (
    String(item.userId) === String(userId) &&
    String(item.chain).toLowerCase() === String(chain).toLowerCase() &&
    String(item.tokenAddress).toLowerCase() === String(tokenAddress).toLowerCase()
  );
}

async function saveWatchlist(watchlist) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(watchlistPath, `${JSON.stringify(watchlist, null, 2)}\n`);
}

async function addWatchlistItem(item) {
  const watchlist = await readWatchlist();
  const existingIndex = watchlist.findIndex((entry) => isSameWatchItem(entry, item));
  const normalizedItem = {
    ...item,
    chain: String(item.chain).toLowerCase(),
    tokenAddress: String(item.tokenAddress)
  };

  if (existingIndex >= 0) {
    watchlist[existingIndex] = {
      ...watchlist[existingIndex],
      ...normalizedItem
    };
  } else {
    watchlist.push(normalizedItem);
  }

  await saveWatchlist(watchlist);
  return {
    item: existingIndex >= 0 ? watchlist[existingIndex] : normalizedItem,
    alreadyWatched: existingIndex >= 0,
    watchCount: countWatchers(watchlist, normalizedItem)
  };
}

async function removeWatchlistItem({ userId, chain, tokenAddress }) {
  const watchlist = await readWatchlist();
  const nextWatchlist = watchlist.filter((entry) => !isSameWatchItem(entry, { userId, chain, tokenAddress }));

  if (nextWatchlist.length !== watchlist.length) {
    await saveWatchlist(nextWatchlist);
  }

  return {
    removed: nextWatchlist.length !== watchlist.length,
    watchCount: countWatchers(nextWatchlist, { chain, tokenAddress })
  };
}

async function getUserWatchlist(userId) {
  const watchlist = await readWatchlist();
  return watchlist.filter((item) => String(item.userId) === String(userId));
}

async function getWatchCount({ chain, tokenAddress }) {
  const watchlist = await readWatchlist();
  return countWatchers(watchlist, { chain, tokenAddress });
}

function countWatchers(watchlist, { chain, tokenAddress }) {
  const watchers = new Set();
  const normalizedChain = String(chain).toLowerCase();
  const normalizedAddress = String(tokenAddress).toLowerCase();

  for (const item of watchlist) {
    if (
      String(item.chain).toLowerCase() === normalizedChain &&
      String(item.tokenAddress).toLowerCase() === normalizedAddress
    ) {
      watchers.add(String(item.userId));
    }
  }

  return watchers.size;
}

module.exports = {
  addWatchlistItem,
  getUserWatchlist,
  getWatchCount,
  readRadarResults,
  readSm90dCache,
  readWatchlist,
  removeWatchlistItem,
  saveDiscoveryResult,
  saveRadarResult,
  saveScanResult,
  saveWatchlist,
  writeSm90dCache
};
