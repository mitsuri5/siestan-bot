const {
  getSolanaTokenOhlcv,
  getSolanaSmartMoneyNetflow,
  getTokenDexTrades,
  getTokenFlowIntelligence,
  getTokenHolders,
  getTokenInfo,
  getWalletPnlSummary
} = require("./nansen");
const { readSm90dCache, writeSm90dCache } = require("./storage");

const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SM90D_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BUYER_QUALITY_LIMIT = 3;
const DEXSCREENER_TIMEOUT_MS = 15 * 1000;

function isValidSolanaAddress(address) {
  return SOLANA_ADDRESS_PATTERN.test(String(address || ""));
}

function extractSolanaTokenAddress(input) {
  const value = String(input || "").trim();

  if (isValidSolanaAddress(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const isDexscreener = url.hostname.toLowerCase().endsWith("dexscreener.com");
    const parts = url.pathname.split("/").filter(Boolean);
    const solanaIndex = parts.findIndex((part) => part.toLowerCase() === "solana");

    if (isDexscreener && solanaIndex >= 0) {
      const candidate = parts[solanaIndex + 1];
      if (isValidSolanaAddress(candidate)) {
        return candidate;
      }
    }
  } catch (_error) {
    // Fall through to loose extraction below.
  }

  const match = value.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return match && isValidSolanaAddress(match[0]) ? match[0] : null;
}

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

async function readOptional(label, loader, fallback) {
  try {
    return {
      ok: true,
      data: await loader()
    };
  } catch (error) {
    console.error(`Failed to load watch radar ${label}:`, error.message);
    return {
      ok: false,
      data: fallback,
      error: label
    };
  }
}

function getTokenPriceUsd(info) {
  const details = info?.token_details || {};
  const metrics = info?.spot_metrics || {};
  return toNumber(
    info?.price_usd ||
    info?.priceUsd ||
    info?.token_price_usd ||
    details.price_usd ||
    details.priceUsd ||
    metrics.price_usd ||
    metrics.priceUsd ||
    metrics.token_price_usd
  );
}

function getTokenMarketCapUsd(info) {
  const details = info?.token_details || {};
  return toNumber(details.market_cap_usd || info?.market_cap_usd || info?.marketCapUsd);
}

function getTokenFdvUsd(info) {
  const details = info?.token_details || {};
  return toNumber(details.fdv_usd || details.fdv || info?.fdv_usd || info?.fdvUsd || info?.fdv);
}

function getLatestOhlcvSnapshot(rows) {
  const latest = (rows || [])
    .filter((row) => row && Number.isFinite(new Date(row.interval_start || row.intervalStart || 0).getTime()))
    .sort((a, b) =>
      new Date(b.interval_start || b.intervalStart || 0).getTime() -
      new Date(a.interval_start || a.intervalStart || 0).getTime()
    )[0];

  if (!latest) {
    return {
      priceUsd: 0,
      marketCapUsd: 0
    };
  }

  const marketCap = latest.market_cap || latest.marketCap || {};
  return {
    priceUsd: toNumber(latest.close || latest.price_usd || latest.priceUsd),
    marketCapUsd: toNumber(marketCap.close || marketCap.high || latest.market_cap_usd || latest.marketCapUsd)
  };
}

function selectDexscreenerBestPair(pairs) {
  return (pairs || [])
    .filter((pair) => pair && String(pair.chainId || "").toLowerCase() === "solana")
    .sort((a, b) => toNumber(b.liquidity?.usd) - toNumber(a.liquidity?.usd))[0] || null;
}

async function fetchJsonWithTimeout(url) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this Node.js runtime.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEXSCREENER_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "siestan-bot/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Dexscreener request failed with status ${response.status}.`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getDexscreenerTokenSnapshot({ chain, tokenAddress }) {
  if (String(chain).toLowerCase() !== "solana") {
    return {
      priceUsd: 0,
      marketCapUsd: 0,
      fdvUsd: 0,
      liquidityUsd: 0,
      source: "none"
    };
  }

  const urls = [
    `https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(tokenAddress)}`,
    `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(tokenAddress)}`
  ];

  for (const url of urls) {
    try {
      const parsed = await fetchJsonWithTimeout(url);
      const pairs = Array.isArray(parsed) ? parsed : parsed?.pairs;
      const bestPair = selectDexscreenerBestPair(pairs);

      if (bestPair) {
        const marketCapUsd = toNumber(bestPair.marketCap);
        const fdvUsd = toNumber(bestPair.fdv);
        return {
          priceUsd: toNumber(bestPair.priceUsd),
          marketCapUsd: marketCapUsd || fdvUsd,
          fdvUsd,
          liquidityUsd: toNumber(bestPair.liquidity?.usd),
          source: "dexscreener",
          pairAddress: bestPair.pairAddress || ""
        };
      }
    } catch (error) {
      console.error("Failed to load Dexscreener token pairs:", error.message);
    }
  }

  return {
    priceUsd: 0,
    marketCapUsd: 0,
    fdvUsd: 0,
    liquidityUsd: 0,
    source: "none"
  };
}

function summarizeTokenInfo(info, market = {}) {
  const details = info?.token_details || {};
  const metrics = info?.spot_metrics || {};
  const infoPriceUsd = getTokenPriceUsd(info);
  const infoMarketCapUsd = getTokenMarketCapUsd(info);
  const infoFdvUsd = getTokenFdvUsd(info);

  return {
    name: info?.name || details.name || "",
    symbol: info?.symbol || details.symbol || "",
    imageUrl: info?.image_url || info?.imageUrl || info?.image || info?.logo_url || info?.logoUrl || details.image_url || details.imageUrl || details.logo_url || details.logoUrl || "",
    priceUsd: toNumber(market.priceUsd) || infoPriceUsd,
    marketCapUsd: toNumber(market.marketCapUsd) || infoMarketCapUsd || infoFdvUsd,
    fdvUsd: toNumber(market.fdvUsd) || infoFdvUsd,
    liquidityUsd: toNumber(metrics.liquidity_usd || info?.liquidity_usd || info?.liquidityUsd) || toNumber(market.liquidityUsd),
    holderCount: toNumber(metrics.total_holders || info?.holder_count || info?.holderCount),
    volumeUsd: toNumber(metrics.volume_total_usd || metrics.volume_usd || info?.volume_usd),
    priceSource: market.source || (infoPriceUsd > 0 || infoMarketCapUsd > 0 || infoFdvUsd > 0 ? "nansen" : "none")
  };
}

async function getTokenMarketSnapshot({ chain, tokenAddress, tokenInfoResult }) {
  const tokenInfo = tokenInfoResult || {};
  const nansenInfoMarket = {
    priceUsd: getTokenPriceUsd(tokenInfo),
    marketCapUsd: getTokenMarketCapUsd(tokenInfo),
    fdvUsd: getTokenFdvUsd(tokenInfo),
    source: "nansen"
  };

  let nansenOhlcvMarket = {
    priceUsd: 0,
    marketCapUsd: 0
  };

  if (String(chain).toLowerCase() === "solana") {
    try {
      nansenOhlcvMarket = getLatestOhlcvSnapshot(await getSolanaTokenOhlcv({ tokenAddress, timeframe: "1h" }));
    } catch (error) {
      console.error("Failed to load Nansen token OHLCV market data:", error.message);
    }
  }

  const nansenMarket = {
    priceUsd: nansenInfoMarket.priceUsd || nansenOhlcvMarket.priceUsd,
    marketCapUsd: nansenInfoMarket.marketCapUsd || nansenOhlcvMarket.marketCapUsd,
    fdvUsd: nansenInfoMarket.fdvUsd,
    source: "nansen"
  };

  if (nansenMarket.priceUsd > 0 && (nansenMarket.marketCapUsd > 0 || nansenMarket.fdvUsd > 0)) {
    return {
      ...nansenMarket,
      marketCapUsd: nansenMarket.marketCapUsd || nansenMarket.fdvUsd
    };
  }

  const dexMarket = await getDexscreenerTokenSnapshot({ chain, tokenAddress });

  return {
    priceUsd: nansenMarket.priceUsd || dexMarket.priceUsd,
    marketCapUsd: nansenMarket.marketCapUsd || nansenMarket.fdvUsd || dexMarket.marketCapUsd,
    fdvUsd: nansenMarket.fdvUsd || dexMarket.fdvUsd,
    liquidityUsd: dexMarket.liquidityUsd,
    source: nansenMarket.priceUsd > 0 || nansenMarket.marketCapUsd > 0 || nansenMarket.fdvUsd > 0
      ? "nansen+dexscreener"
      : dexMarket.source
  };
}

function findNetflowToken(rows, tokenAddress) {
  const normalizedAddress = normalizeAddress(tokenAddress);
  return rows.find((row) => normalizeAddress(row.token_address || row.address) === normalizedAddress) || null;
}

function getTradeValueUsd(row) {
  return toNumber(row.estimated_value_usd || row.trade_value_usd || row.value_usd);
}

function getTraderAddress(row) {
  return row.trader_address || row.wallet_address || row.address || row.wallet;
}

function getTraderLabel(row) {
  return row.trader_address_label || row.wallet_label || row.address_label || row.label || "";
}

function summarizeDexTrades(rows) {
  const buyers = new Map();
  const summary = rows.reduce(
    (acc, row) => {
      const action = String(row.action || "").toUpperCase();
      const valueUsd = getTradeValueUsd(row);

      if (action === "BUY") {
        acc.buyCount += 1;
        acc.buyValueUsd += valueUsd;

        const address = getTraderAddress(row);
        if (address) {
          const key = normalizeAddress(address);
          const buyer = buyers.get(key) || {
            address: String(address),
            label: String(getTraderLabel(row) || ""),
            buyCount: 0,
            buyValueUsd: 0
          };
          buyer.buyCount += 1;
          buyer.buyValueUsd += valueUsd;
          if (!buyer.label) {
            buyer.label = String(getTraderLabel(row) || "");
          }
          buyers.set(key, buyer);
        }
      }

      if (action === "SELL") {
        acc.sellCount += 1;
        acc.sellValueUsd += valueUsd;
      }

      return acc;
    },
    { buyCount: 0, buyValueUsd: 0, sellCount: 0, sellValueUsd: 0 }
  );

  return {
    ...summary,
    rowCount: rows.length,
    buyers: Array.from(buyers.values()).sort((a, b) => b.buyValueUsd - a.buyValueUsd)
  };
}

function summarizeFlowIntelligence(rows) {
  const totals = rows.reduce(
    (summary, row) => {
      summary.netFlowUsd += toNumber(row.public_figure_net_flow_usd);
      summary.netFlowUsd += toNumber(row.top_pnl_net_flow_usd);
      summary.netFlowUsd += toNumber(row.whale_net_flow_usd);
      summary.netFlowUsd += toNumber(row.smart_trader_net_flow_usd);
      summary.netFlowUsd += toNumber(row.exchange_net_flow_usd);
      summary.netFlowUsd += toNumber(row.fresh_wallets_net_flow_usd);
      summary.walletCount += toNumber(row.public_figure_wallet_count);
      summary.walletCount += toNumber(row.top_pnl_wallet_count);
      summary.walletCount += toNumber(row.whale_wallet_count);
      summary.walletCount += toNumber(row.smart_trader_wallet_count);
      summary.walletCount += toNumber(row.exchange_wallet_count);
      summary.walletCount += toNumber(row.fresh_wallets_wallet_count);
      return summary;
    },
    { netFlowUsd: 0, walletCount: 0 }
  );

  return {
    ...totals,
    rowCount: rows.length,
    labels: collectValues(rows, ["label", "entity_label", "wallet_label"]).slice(0, 5)
  };
}

function summarizeHolders(rows) {
  return {
    rowCount: rows.length,
    totalValueUsd: rows.reduce((sum, row) => sum + toNumber(row.value_usd), 0),
    totalOwnership: rows.reduce((sum, row) => sum + toNumber(row.ownership_percentage), 0),
    smartMoneyHolderCount: rows.filter(isSmartMoneyHolder).length,
    labels: collectValues(rows, ["address_label", "label", "entity_label", "wallet_label"]).slice(0, 5)
  };
}

function collectValues(rows, keys) {
  const values = [];

  for (const row of rows) {
    for (const key of keys) {
      if (row[key] && !values.includes(String(row[key]))) {
        values.push(String(row[key]));
      }
    }
  }

  return values;
}

function isSmartMoneyHolder(row) {
  const labelText = [
    row.address_label,
    row.label,
    row.entity_label,
    row.wallet_label,
    row.smart_money_label,
    ...(Array.isArray(row.labels) ? row.labels : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return ["smart money", "smart trader", "fund", "whale"].some((label) => labelText.includes(label));
}

function isFreshCacheEntry(entry) {
  const cachedAt = new Date(entry?.cachedAt || 0).getTime();
  return Number.isFinite(cachedAt) && Date.now() - cachedAt < SM90D_CACHE_TTL_MS;
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
  stats.cacheChanged = true;
  stats.cacheMissCount += 1;
  return data;
}

async function analyzeBuyerQuality(dexTrades) {
  const buyers = (dexTrades.buyers || []).slice(0, BUYER_QUALITY_LIMIT);
  const stats = {
    cacheChanged: false,
    cacheHitCount: 0,
    cacheMissCount: 0
  };
  const profiles = [];
  let failedCount = 0;
  let cache = {};

  if (buyers.length === 0) {
    return {
      attemptedCount: 0,
      checkedCount: 0,
      failedCount: 0,
      goodCount: 0,
      averageWinRate: 0,
      totalRealizedPnlUsd: 0,
      profiles: []
    };
  }

  try {
    cache = await readSm90dCache();
  } catch (error) {
    console.error("Failed to read watch radar SM 90D cache:", error.message);
  }

  for (const buyer of buyers) {
    try {
      const data = await getCachedWalletPnlSummary({ address: buyer.address, cache, stats });
      profiles.push({
        address: buyer.address,
        label: buyer.label,
        buyValueUsd: buyer.buyValueUsd,
        realizedPnlUsd: toNumber(data.realized_pnl_usd),
        realizedPnlPercent: normalizePercent(data.realized_pnl_percent),
        winRate: normalizePercent(data.win_rate)
      });
    } catch (error) {
      failedCount += 1;
      console.error("Failed to load watch radar buyer profile:", buyer.address, error.message);
    }
  }

  if (stats.cacheChanged) {
    try {
      await writeSm90dCache(cache);
    } catch (error) {
      console.error("Failed to write watch radar SM 90D cache:", error.message);
    }
  }

  const checkedCount = profiles.length;
  const goodProfiles = profiles.filter((profile) =>
    profile.realizedPnlUsd > 0 && (profile.winRate >= 0.55 || profile.realizedPnlPercent > 0)
  );

  return {
    attemptedCount: buyers.length,
    checkedCount,
    failedCount,
    goodCount: goodProfiles.length,
    averageWinRate: checkedCount > 0 ? profiles.reduce((sum, profile) => sum + profile.winRate, 0) / checkedCount : 0,
    totalRealizedPnlUsd: profiles.reduce((sum, profile) => sum + profile.realizedPnlUsd, 0),
    profiles
  };
}

function scoreWatchToken({ tokenInfo, netflowToken, flow, holders, dexTrades, buyerQuality, fetchFailures }) {
  const warnings = [];
  let score = 0;

  if (toNumber(netflowToken?.net_flow_24h_usd) > 0 || flow.netFlowUsd > 0) {
    score += 25;
  } else {
    warnings.push("Smart Moneyの明確な流入はまだ弱めですにゃ");
  }

  if (dexTrades.buyValueUsd > dexTrades.sellValueUsd && dexTrades.buyCount > 0) {
    score += 20;
  } else if (dexTrades.sellValueUsd > dexTrades.buyValueUsd && dexTrades.sellValueUsd > 0) {
    warnings.push("直近DEX取引は売り優勢ですにゃ");
  }

  if (buyerQuality.goodCount >= 2) {
    score += 20;
  } else if (buyerQuality.goodCount >= 1) {
    score += 10;
  } else if (buyerQuality.attemptedCount > 0) {
    warnings.push("90D Buyer Qualityはまだ強くありませんにゃ");
  }

  if (tokenInfo.liquidityUsd >= 50000) {
    score += 15;
  } else if (tokenInfo.liquidityUsd > 0) {
    warnings.push("Liquidityが低めですにゃ");
  }

  if (tokenInfo.holderCount >= 100 || holders.rowCount >= 10) {
    score += 10;
  } else {
    warnings.push("Holder情報が薄めですにゃ");
  }

  if (tokenInfo.marketCapUsd > 0 && tokenInfo.marketCapUsd < 1000000) {
    warnings.push("MCAPが小さく値動きが荒い可能性がありますにゃ");
  }

  for (const failure of fetchFailures) {
    warnings.push(`${failure}の取得に失敗しましたにゃ`);
  }

  return {
    score: Math.max(Math.min(Math.round(score), 100), 0),
    warnings
  };
}

async function analyzeWatchToken({ chain = "solana", tokenAddress, watchCount = 0 } = {}) {
  const [tokenInfoResult, dexTradesResult, netflowResult, flowResult, holdersResult] = await Promise.all([
    readOptional("Token Info", () => getTokenInfo({ chain, token: tokenAddress }), {}),
    readOptional("Token DEX Trades", () => getTokenDexTrades({ chain, token: tokenAddress }), []),
    readOptional("Smart Money Netflow", () => getSolanaSmartMoneyNetflow(), []),
    readOptional("Flow Intelligence", () => getTokenFlowIntelligence({ chain, token: tokenAddress }), []),
    readOptional("Token Holders", () => getTokenHolders({ chain, token: tokenAddress }), [])
  ]);

  const marketResult = await readOptional(
    "Token Market Data",
    () => getTokenMarketSnapshot({ chain, tokenAddress, tokenInfoResult: tokenInfoResult.data || {} }),
    {}
  );
  const tokenInfo = summarizeTokenInfo(tokenInfoResult.data || {}, marketResult.data || {});
  const dexTrades = summarizeDexTrades(dexTradesResult.data || []);
  const flow = summarizeFlowIntelligence(flowResult.data || []);
  const holders = summarizeHolders(holdersResult.data || []);
  const netflowToken = findNetflowToken(netflowResult.data || [], tokenAddress);
  const buyerQuality = await analyzeBuyerQuality(dexTrades);
  const fetchFailures = [tokenInfoResult, marketResult, dexTradesResult, netflowResult, flowResult, holdersResult]
    .filter((result) => !result.ok)
    .map((result) => result.error);
  const scoring = scoreWatchToken({
    tokenInfo,
    netflowToken,
    flow,
    holders,
    dexTrades,
    buyerQuality,
    fetchFailures
  });

  return {
    chain,
    tokenAddress,
    tokenInfo,
    dexTrades,
    netflowToken,
    flow,
    holders,
    buyerQuality,
    watchCount,
    ...scoring
  };
}

function calculateChange({ addedPriceUsd, currentPriceUsd }) {
  const addedPrice = toNumber(addedPriceUsd);
  const currentPrice = toNumber(currentPriceUsd);

  if (addedPrice > 0 && currentPrice > 0) {
    return {
      basis: "price",
      changeRate: (currentPrice - addedPrice) / addedPrice
    };
  }

  return {
    basis: "pending",
    changeRate: null
  };
}

async function buildWatchlistView(items) {
  const viewItems = [];

  for (const item of items) {
    const result = await readOptional(
      "Watchlist Token Info",
      () => getTokenInfo({ chain: item.chain || "solana", token: item.tokenAddress }),
      {}
    );
    const marketResult = await readOptional(
      "Watchlist Market Data",
      () => getTokenMarketSnapshot({
        chain: item.chain || "solana",
        tokenAddress: item.tokenAddress,
        tokenInfoResult: result.data || {}
      }),
      {}
    );
    const currentInfo = summarizeTokenInfo(result.data || {}, marketResult.data || {});
    const change = calculateChange({
      addedPriceUsd: item.addedPriceUsd,
      currentPriceUsd: currentInfo.priceUsd
    });

    viewItems.push({
      ...item,
      currentPriceUsd: currentInfo.priceUsd,
      currentMarketCapUsd: currentInfo.marketCapUsd,
      currentFdvUsd: currentInfo.fdvUsd,
      currentLiquidityUsd: currentInfo.liquidityUsd,
      currentSymbol: currentInfo.symbol,
      currentName: currentInfo.name,
      priceSource: currentInfo.priceSource,
      fetchFailed: !result.ok && !marketResult.ok,
      ...change
    });
  }

  return viewItems;
}

module.exports = {
  analyzeWatchToken,
  buildWatchlistView,
  extractSolanaTokenAddress,
  isValidSolanaAddress
};
