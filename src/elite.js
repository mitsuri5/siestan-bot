const { getSolanaSmartMoneyDexTradesRest, getTokenInfo, getWalletPnlSummary } = require("./nansen");
const { readSm90dCache, writeSm90dCache } = require("./storage");

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WALLETS_TO_EVALUATE = 10;
const MAX_WALLETS_TO_EVALUATE = 50;
const TOKEN_INFO_LIMIT = 30;
const DEX_TRADE_LIMIT = 500;
const ELITE_TIMEOUT_MS = 3 * 60 * 1000;
const QUOTE_TOKENS = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
]);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.abs(number) > 1 ? number / 100 : number;
}

function normalizeAddress(address) {
  return String(address || "").toLowerCase();
}

function getTraderAddress(row) {
  return row.trader_address || row.wallet_address || row.address || row.wallet;
}

function getTraderLabel(row) {
  return row.trader_address_label || row.wallet_label || row.address_label || row.label || "";
}

function getTradeValueUsd(row) {
  return toNumber(row.trade_value_usd || row.estimated_value_usd || row.value_usd);
}

function hasEliteLabel(label) {
  const normalized = String(label || "").toLowerCase();
  return ["90d smart trader", "smart trader", "fund"].some((keyword) => normalized.includes(keyword));
}

function isFreshCacheEntry(entry) {
  const cachedAt = new Date(entry?.cachedAt || 0).getTime();
  return Number.isFinite(cachedAt) && Date.now() - cachedAt < CACHE_TTL_MS;
}

function isLikelyRateLimitOrTimeout(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("abort") ||
    message.includes("maxbuffer") ||
    message.includes("max buffer") ||
    error?.code === "ETIMEDOUT" ||
    error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
  );
}

function isDeadlineExpired(deadlineMs) {
  return Number.isFinite(deadlineMs) && Date.now() >= deadlineMs;
}

async function getCachedWalletPnlSummary({ address, cache, stats }) {
  const cacheKey = `solana:${normalizeAddress(address)}`;
  const cached = cache[cacheKey];

  if (isFreshCacheEntry(cached)) {
    stats.cacheHitCount += 1;
    return cached.data;
  }

  const data = await getWalletPnlSummary({ address, chain: "solana", days: 90 });
  cache[cacheKey] = {
    cachedAt: new Date().toISOString(),
    data
  };
  stats.cacheMissCount += 1;
  stats.cacheChanged = true;
  return data;
}

function scoreWallet({ label, pnlSummary }) {
  const realizedPnlUsd = toNumber(pnlSummary.realized_pnl_usd);
  const realizedPnlPercent = normalizePercent(pnlSummary.realized_pnl_percent);
  const winRate = normalizePercent(pnlSummary.win_rate);
  const tradedTokenCount = toNumber(pnlSummary.traded_token_count);
  const tradedTimes = toNumber(pnlSummary.traded_times);
  let score = 0;

  if (realizedPnlUsd > 0) {
    score += 20;
    score += Math.min(Math.log10(realizedPnlUsd + 1) * 6, 20);
  }

  if (winRate >= 0.55) {
    score += 20;
  }

  if (winRate >= 0.65) {
    score += 10;
  }

  if (realizedPnlPercent > 0.2) {
    score += 10;
  }

  if (tradedTimes >= 5 && tradedTokenCount >= 3) {
    score += 10;
  }

  if (hasEliteLabel(label)) {
    score += 10;
  }

  return {
    realizedPnlUsd,
    realizedPnlPercent,
    winRate,
    tradedTokenCount,
    tradedTimes,
    score: Math.min(Math.round(score), 100)
  };
}

function collectWallets(rows, limit = DEFAULT_WALLETS_TO_EVALUATE) {
  const wallets = new Map();
  const walletLimit = Math.min(Math.max(Number(limit) || DEFAULT_WALLETS_TO_EVALUATE, 1), MAX_WALLETS_TO_EVALUATE);

  for (const row of rows) {
    const address = getTraderAddress(row);
    if (!address) {
      continue;
    }

    const key = normalizeAddress(address);
    const existing = wallets.get(key) || {
      address: String(address),
      label: String(getTraderLabel(row) || ""),
      tradeCount: 0,
      tradeValueUsd: 0
    };

    existing.tradeCount += 1;
    existing.tradeValueUsd += getTradeValueUsd(row);
    if (!existing.label) {
      existing.label = String(getTraderLabel(row) || "");
    }

    wallets.set(key, existing);
  }

  return Array.from(wallets.values())
    .sort((a, b) => b.tradeValueUsd - a.tradeValueUsd)
    .slice(0, walletLimit);
}

async function evaluateWallets(wallets, { deadlineMs } = {}) {
  let cache = {};
  try {
    cache = await readSm90dCache();
  } catch (error) {
    console.error("Failed to read SM 90D cache:", error.message);
  }
  const stats = {
    cacheChanged: false,
    cacheHitCount: 0,
    cacheMissCount: 0,
    profilerFailedCount: 0,
    stoppedEarly: false,
    stopReason: ""
  };
  const evaluated = [];

  for (const wallet of wallets) {
    if (isDeadlineExpired(deadlineMs)) {
      stats.stoppedEarly = true;
      stats.stopReason = "timeout";
      break;
    }

    try {
      const pnlSummary = await getCachedWalletPnlSummary({
        address: wallet.address,
        cache,
        stats
      });
      evaluated.push({
        ...wallet,
        ...scoreWallet({ label: wallet.label, pnlSummary })
      });
    } catch (error) {
      stats.profilerFailedCount += 1;
      console.error("Failed to evaluate elite Smart Money wallet:", wallet.address, error.message);

      if (isLikelyRateLimitOrTimeout(error)) {
        stats.stoppedEarly = true;
        stats.stopReason = "rate-limit-or-timeout";
        break;
      }
    }
  }

  if (stats.cacheChanged) {
    try {
      await writeSm90dCache(cache);
    } catch (error) {
      console.error("Failed to write SM 90D cache:", error.message);
    }
  }

  return {
    wallets: evaluated.sort((a, b) => b.score - a.score),
    stats
  };
}

function getTokenCandidate(map, address, symbol) {
  if (!address || QUOTE_TOKENS.has(address)) {
    return null;
  }

  const key = String(address);
  if (!map.has(key)) {
    map.set(key, {
      address: key,
      symbol: symbol || "",
      name: "",
      eliteBuyers: new Map(),
      eliteSellers: new Map(),
      eliteBuyValueUsd: 0,
      eliteSellValueUsd: 0,
      marketCapUsd: 0,
      liquidityUsd: 0,
      holderCount: 0,
      warnings: []
    });
  }

  const candidate = map.get(key);
  if (!candidate.symbol && symbol) {
    candidate.symbol = symbol;
  }

  return candidate;
}

function aggregateEliteTokens(rows, eliteWallets) {
  const eliteByAddress = new Map(eliteWallets.map((wallet) => [normalizeAddress(wallet.address), wallet]));
  const candidates = new Map();

  for (const row of rows) {
    const wallet = eliteByAddress.get(normalizeAddress(getTraderAddress(row)));
    if (!wallet) {
      continue;
    }

    const tradeValueUsd = getTradeValueUsd(row);
    const bought = getTokenCandidate(candidates, row.token_bought_address, row.token_bought_symbol);
    const sold = getTokenCandidate(candidates, row.token_sold_address, row.token_sold_symbol);

    if (bought) {
      bought.eliteBuyValueUsd += tradeValueUsd;
      bought.eliteBuyers.set(normalizeAddress(wallet.address), wallet);
    }

    if (sold) {
      sold.eliteSellValueUsd += tradeValueUsd;
      sold.eliteSellers.set(normalizeAddress(wallet.address), wallet);
    }
  }

  return Array.from(candidates.values())
    .filter((candidate) => candidate.eliteBuyers.size > 0)
    .map((candidate) => {
      const buyers = Array.from(candidate.eliteBuyers.values());
      const sellerCount = candidate.eliteSellers.size;
      const avgWinRate = buyers.reduce((sum, buyer) => sum + buyer.winRate, 0) / buyers.length;
      const avgRealizedPnlUsd = buyers.reduce((sum, buyer) => sum + buyer.realizedPnlUsd, 0) / buyers.length;
      const labels = [...new Set(buyers.map((buyer) => buyer.label).filter(Boolean))].slice(0, 5);
      const warnings = [];

      if (candidate.eliteSellValueUsd >= candidate.eliteBuyValueUsd && candidate.eliteSellValueUsd > 0) {
        warnings.push("Elite SMの売りも多いので注意ですにゃ");
      }

      return {
        ...candidate,
        eliteBuyerCount: buyers.length,
        eliteSellerCount: sellerCount,
        eliteNetBuyValueUsd: candidate.eliteBuyValueUsd - candidate.eliteSellValueUsd,
        averageWinRate: avgWinRate,
        averageRealizedPnlUsd: avgRealizedPnlUsd,
        eliteBuyerLabels: labels,
        warnings
      };
    });
}

function summarizeTokenInfo(info) {
  const details = info.token_details || {};
  const metrics = info.spot_metrics || {};

  return {
    name: info.name || "",
    symbol: info.symbol || "",
    imageUrl: info.image_url || info.imageUrl || info.image || info.logo_url || info.logoUrl || info.logo || details.image_url || details.imageUrl || details.image || details.logo_url || details.logoUrl || details.logo || "",
    marketCapUsd: toNumber(details.market_cap_usd),
    liquidityUsd: toNumber(metrics.liquidity_usd),
    holderCount: toNumber(metrics.total_holders)
  };
}

async function enrichTokens(candidates, { deadlineMs } = {}) {
  const topCandidates = candidates.slice(0, TOKEN_INFO_LIMIT);
  const enrichedByAddress = new Map();
  let enrichedCount = 0;
  let stoppedEarly = false;

  for (const candidate of topCandidates) {
    if (isDeadlineExpired(deadlineMs)) {
      stoppedEarly = true;
      break;
    }

    try {
      const info = summarizeTokenInfo(await getTokenInfo({ chain: "solana", token: candidate.address }));
      enrichedByAddress.set(candidate.address, {
        ...candidate,
        name: info.name || candidate.name,
        symbol: info.symbol || candidate.symbol,
        imageUrl: info.imageUrl || candidate.imageUrl,
        marketCapUsd: info.marketCapUsd,
        liquidityUsd: info.liquidityUsd,
        holderCount: info.holderCount,
        warnings: [
          ...candidate.warnings,
          ...(info.liquidityUsd > 0 && info.liquidityUsd < 50000 ? ["流動性が低めなので値動きに注意ですにゃ"] : [])
        ]
      });
      enrichedCount += 1;
    } catch (error) {
      console.error("Failed to enrich elite token:", candidate.address, error.message);
      enrichedByAddress.set(candidate.address, {
        ...candidate,
        warnings: [...candidate.warnings, "Token Infoを取得できませんでしたにゃ"]
      });

      if (isLikelyRateLimitOrTimeout(error)) {
        stoppedEarly = true;
        break;
      }
    }
  }

  return {
    candidates: candidates.map((candidate) => enrichedByAddress.get(candidate.address) || candidate),
    enrichedCount,
    stoppedEarly
  };
}

function sortEliteTokens(candidates) {
  return candidates.sort((a, b) => {
    if (a.eliteBuyerCount !== b.eliteBuyerCount) {
      return b.eliteBuyerCount - a.eliteBuyerCount;
    }
    if (a.eliteNetBuyValueUsd !== b.eliteNetBuyValueUsd) {
      return b.eliteNetBuyValueUsd - a.eliteNetBuyValueUsd;
    }
    if (a.averageWinRate !== b.averageWinRate) {
      return b.averageWinRate - a.averageWinRate;
    }
    const aHasInfo = a.marketCapUsd > 0 || a.liquidityUsd > 0;
    const bHasInfo = b.marketCapUsd > 0 || b.liquidityUsd > 0;
    if (aHasInfo !== bHasInfo) {
      return bHasInfo - aHasInfo;
    }
    return toNumber(b.liquidityUsd) - toNumber(a.liquidityUsd);
  });
}

async function runSolanaEliteRadar({ topWallets = DEFAULT_WALLETS_TO_EVALUATE, timeoutMs = ELITE_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  const requestedTopWallets = Math.min(Math.max(Number(topWallets) || DEFAULT_WALLETS_TO_EVALUATE, 1), MAX_WALLETS_TO_EVALUATE);
  const deadlineMs = startedAt + Math.min(Math.max(Number(timeoutMs) || ELITE_TIMEOUT_MS, 30 * 1000), ELITE_TIMEOUT_MS);
  const rows = await getSolanaSmartMoneyDexTradesRest({ limit: DEX_TRADE_LIMIT, perPage: 100 });
  const walletsToEvaluate = collectWallets(rows, requestedTopWallets);
  const evaluated = await evaluateWallets(walletsToEvaluate, { deadlineMs });
  const eliteWallets = evaluated.wallets
    .filter((wallet) => wallet.score >= 40)
    .slice(0, requestedTopWallets);
  const aggregated = aggregateEliteTokens(rows, eliteWallets);
  const sortedBeforeEnrich = sortEliteTokens(aggregated);
  const enriched = await enrichTokens(sortedBeforeEnrich, { deadlineMs });
  const results = sortEliteTokens(enriched.candidates).slice(0, 5);
  const timedOut = isDeadlineExpired(deadlineMs);
  const partialFailure = Boolean(
    rows._meta?.partialFailure ||
    evaluated.stats.stoppedEarly ||
    enriched.stoppedEarly ||
    timedOut
  );

  return {
    results,
    stats: {
      evaluatedWalletCount: walletsToEvaluate.length,
      profilerEvaluatedCount: evaluated.wallets.length,
      eliteWalletCount: eliteWallets.length,
      requestedTopWallets,
      tokenCount: aggregated.length,
      displayedCount: results.length,
      tokenInfoEnrichedCount: enriched.enrichedCount,
      dexTradeCount: rows.length,
      cacheHitCount: evaluated.stats.cacheHitCount,
      cacheMissCount: evaluated.stats.cacheMissCount,
      profilerFailedCount: evaluated.stats.profilerFailedCount,
      stoppedEarly: evaluated.stats.stoppedEarly || enriched.stoppedEarly || timedOut,
      stopReason: evaluated.stats.stopReason || (enriched.stoppedEarly || timedOut ? "timeout" : ""),
      durationMs: Date.now() - startedAt,
      partialFailure
    }
  };
}

module.exports = {
  runSolanaEliteRadar
};
