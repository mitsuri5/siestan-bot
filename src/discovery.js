const {
  fetchSolanaSmartMoneyDexTradesRestPage,
  getSolanaSmartMoneyDexTrades,
  getSolanaSmartMoneyDexTradesRest,
  getTokenInfo
} = require("./nansen");

const QUOTE_TOKENS = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
]);

const STRONG_SM_LABELS = [
  "90d smart trader",
  "180d smart trader",
  "smart trader",
  "fund",
  "whale",
  "smart money"
];
const STRONG_SM_BUY_VALUE_USD = 10000;

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeLabel(label) {
  return String(label || "").toLowerCase();
}

function isStrongSmLabel(label) {
  const normalized = normalizeLabel(label);
  return STRONG_SM_LABELS.some((strongLabel) => normalized.includes(strongLabel));
}

function has90dSmartTraderLabel(labels) {
  return labels.some((label) => normalizeLabel(label).includes("90d smart trader"));
}

function createEmptyCandidate({ address, symbol }) {
  return {
    address,
    symbol: symbol || "",
    name: "",
    buyCount: 0,
    sellCount: 0,
    buyValueUsd: 0,
    sellValueUsd: 0,
    totalTradeValueUsd: 0,
    marketCapUsd: 0,
    liquidityUsd: 0,
    holderCount: 0,
    smBuyers: new Map(),
    smBuyerCount: 0,
    strongSmBuyerCount: 0,
    strongSmBuyValueUsd: 0,
    smBuyerLabels: [],
    sm90dQualityLevel: "unknown",
    score: 0,
    confidence: "risky",
    notes: [],
    warnings: []
  };
}

function addBuyer(candidate, row, tradeValueUsd) {
  const address = row.trader_address || row.wallet_address || row.address;
  const label = row.trader_address_label || row.wallet_label || row.address_label || "";

  if (!address) {
    return;
  }

  const key = String(address).toLowerCase();
  const existing = candidate.smBuyers.get(key) || {
    address: String(address),
    label: String(label || ""),
    buyCount: 0,
    buyValueUsd: 0
  };

  existing.buyCount += 1;
  existing.buyValueUsd += tradeValueUsd;
  if (!existing.label && label) {
    existing.label = String(label);
  }

  candidate.smBuyers.set(key, existing);
}

function summarizeBuyerQuality(smBuyers) {
  const buyers = Array.from(smBuyers.values()).sort((a, b) => b.buyValueUsd - a.buyValueUsd);
  const strongBuyers = buyers.filter((buyer) => isStrongSmLabel(buyer.label));
  const strongSmBuyValueUsd = strongBuyers.reduce((sum, buyer) => sum + buyer.buyValueUsd, 0);
  const smBuyerLabels = [...new Set(buyers.map((buyer) => buyer.label).filter(Boolean))].slice(0, 8);
  let sm90dQualityLevel = "unknown";

  if (buyers.length > 0 && smBuyerLabels.length === 0) {
    sm90dQualityLevel = "unknown";
  } else if (strongBuyers.length >= 2 || strongSmBuyValueUsd >= STRONG_SM_BUY_VALUE_USD) {
    sm90dQualityLevel = "strong";
  } else if (strongBuyers.length >= 1) {
    sm90dQualityLevel = "medium";
  } else if (buyers.length > 0) {
    sm90dQualityLevel = "weak";
  }

  return {
    smBuyers: buyers,
    smBuyerCount: buyers.length,
    strongSmBuyerCount: strongBuyers.length,
    strongSmBuyValueUsd,
    smBuyerLabels,
    sm90dQualityLevel
  };
}

function getCandidate(map, address, symbol) {
  if (!address || QUOTE_TOKENS.has(address)) {
    return null;
  }

  if (!map.has(address)) {
    map.set(address, createEmptyCandidate({ address, symbol }));
  }

  const candidate = map.get(address);
  if (!candidate.symbol && symbol) {
    candidate.symbol = symbol;
  }

  return candidate;
}

function aggregateDexTrades(rows) {
  const candidates = new Map();

  for (const row of rows) {
    const tradeValueUsd = toNumber(row.trade_value_usd);
    const bought = getCandidate(candidates, row.token_bought_address, row.token_bought_symbol);
    const sold = getCandidate(candidates, row.token_sold_address, row.token_sold_symbol);

    if (bought) {
      bought.buyCount += 1;
      bought.buyValueUsd += tradeValueUsd;
      bought.totalTradeValueUsd += tradeValueUsd;
      addBuyer(bought, row, tradeValueUsd);
    }

    if (sold) {
      sold.sellCount += 1;
      sold.sellValueUsd += tradeValueUsd;
      sold.totalTradeValueUsd += tradeValueUsd;
    }
  }

  return Array.from(candidates.values())
    .filter((candidate) => candidate.buyCount > 0)
    .map((candidate) => ({
      ...candidate,
      ...summarizeBuyerQuality(candidate.smBuyers)
    }));
}

async function getDexTradesByTargetTokens({ maxTrades = 3000, targetTokens }) {
  const rows = [];
  const pageErrors = [];
  let lastPagination = null;
  let targetReached = false;
  const pageSize = 100;
  const maxPages = Math.ceil(maxTrades / pageSize);

  for (let page = 1; page <= maxPages; page += 1) {
    try {
      const pageRows = await fetchSolanaSmartMoneyDexTradesRestPage({ page, perPage: pageSize });
      lastPagination = pageRows._meta?.pagination || null;
      rows.push(...pageRows);

      const aggregated = aggregateDexTrades(rows);
      if (aggregated.length >= targetTokens) {
        targetReached = true;
        break;
      }

      if (lastPagination?.is_last_page || rows.length >= maxTrades) {
        break;
      }
    } catch (error) {
      pageErrors.push({ page, message: error.message });
      break;
    }
  }

  const limitedRows = rows.slice(0, maxTrades);
  return attachRowsMeta(limitedRows, {
    actualRowCount: limitedRows.length,
    maxTrades,
    mode: "target tokens",
    pageErrors,
    pagination: lastPagination,
    partialFailure: pageErrors.length > 0,
    requestedLimit: maxTrades,
    source: "rest",
    targetReached,
    targetTokens
  });
}

function summarizeTokenInfo(info) {
  const details = info.token_details || {};
  const metrics = info.spot_metrics || {};

  return {
    name: info.name || "",
    symbol: info.symbol || "",
    imageUrl: info.image_url || info.imageUrl || info.image || info.logo_url || info.logoUrl || info.logo || info.icon_url || info.iconUrl || info.icon || info.token_image || info.tokenImage || details.image_url || details.imageUrl || details.image || details.logo_url || details.logoUrl || details.logo || details.icon_url || details.iconUrl || details.icon || details.token_image || details.tokenImage || "",
    marketCapUsd: toNumber(details.market_cap_usd),
    liquidityUsd: toNumber(metrics.liquidity_usd),
    holderCount: toNumber(metrics.total_holders)
  };
}

async function enrichCandidates(candidates, enrichLimit = 30) {
  const topCandidates = candidates
    .sort((a, b) => b.buyValueUsd - a.buyValueUsd)
    .slice(0, enrichLimit);
  const enrichAddresses = new Set(topCandidates.map((candidate) => candidate.address));
  const enrichedByAddress = new Map();
  let enrichedCount = 0;

  for (const candidate of topCandidates) {
    try {
      const info = summarizeTokenInfo(
        await getTokenInfo({
          chain: "solana",
          token: candidate.address
        })
      );

      enrichedByAddress.set(candidate.address, {
        ...candidate,
        name: info.name || candidate.name,
        symbol: info.symbol || candidate.symbol,
        imageUrl: info.imageUrl || candidate.imageUrl,
        marketCapUsd: info.marketCapUsd,
        liquidityUsd: info.liquidityUsd,
        holderCount: info.holderCount
      });
      enrichedCount += 1;
    } catch (error) {
      console.error("Failed to enrich discovery candidate:", candidate.address, error);
      enrichedByAddress.set(candidate.address, {
        ...candidate,
        warnings: [...candidate.warnings, "Token infoを取得できませんでしたにゃ"]
      });
    }
  }

  const result = candidates.map((candidate) => (
    enrichAddresses.has(candidate.address)
      ? enrichedByAddress.get(candidate.address) || candidate
      : candidate
  ));

  Object.defineProperty(result, "_meta", {
    enumerable: false,
    value: { enrichedCount }
  });

  return result;
}

function attachDiscoveryStats(discoveries, stats) {
  Object.defineProperty(discoveries, "stats", {
    enumerable: false,
    value: stats
  });

  return discoveries;
}

function attachRowsMeta(rows, meta) {
  Object.defineProperty(rows, "_meta", {
    enumerable: false,
    value: meta
  });

  return rows;
}

async function getDexTradesBySource(source, { dexTradeLimit = 200, targetTokens = null } = {}) {
  if (source === "rest") {
    if (targetTokens) {
      return getDexTradesByTargetTokens({ targetTokens });
    }

    return getSolanaSmartMoneyDexTradesRest({ limit: dexTradeLimit, perPage: 100 });
  }

  return getSolanaSmartMoneyDexTrades();
}

function getConfidence(score, hasThinInfo) {
  if (hasThinInfo && score >= 80) {
    return "medium";
  }
  if (hasThinInfo && score >= 60) {
    return "low";
  }
  if (score >= 80) {
    return "high";
  }
  if (score >= 60) {
    return "medium";
  }
  if (score >= 40) {
    return "low";
  }
  return "risky";
}

function getConfidenceRank(confidence) {
  const ranks = {
    high: 3,
    medium: 2,
    low: 1,
    risky: 0
  };

  return ranks[confidence] ?? 0;
}

function getDiscoveryBreakdown(candidates) {
  return {
    buyCountAtLeast2: candidates.filter((candidate) => candidate.buyCount >= 2).length,
    buyCountAtLeast3: candidates.filter((candidate) => candidate.buyCount >= 3).length,
    withMarketCap: candidates.filter((candidate) => candidate.marketCapUsd > 0).length,
    withLiquidity: candidates.filter((candidate) => candidate.liquidityUsd > 0).length
  };
}

function scoreCandidate(candidate) {
  const notes = [];
  const warnings = [...candidate.warnings];
  let score = 0;
  let scoreCap = 100;

  if (candidate.buyValueUsd > candidate.sellValueUsd) {
    score += 30;
    notes.push("買い金額が売り金額を上回っていますにゃ");
  }

  if (candidate.buyCount >= 2) {
    score += Math.min(candidate.buyCount * 6, 20);
    notes.push("複数回SMに買われていますにゃ");
  } else if (candidate.buyCount === 1) {
    scoreCap = 60;
    warnings.push("Smart Moneyの買いが1件だけなので、継続性はDeep分析で確認してくださいにゃ");
  }

  if (candidate.buyCount >= 3 && candidate.buyValueUsd >= candidate.sellValueUsd && candidate.liquidityUsd > 0) {
    score += 10;
    notes.push("Smart Moneyの買いが3件以上あり、売り優勢でもなく流動性も確認できていますにゃ");
  }

  if (has90dSmartTraderLabel(candidate.smBuyerLabels || [])) {
    score += 10;
    notes.push("90D Smart Traderラベルの買い手を確認していますにゃ");
  }

  if (candidate.strongSmBuyerCount >= 2) {
    score += 10;
    notes.push("強めのSmart Moneyラベルを持つ買い手が複数いますにゃ");
  }

  if (candidate.strongSmBuyValueUsd >= STRONG_SM_BUY_VALUE_USD) {
    score += 5;
    notes.push("強めのSmart Money買い金額が一定以上ありますにゃ");
  }

  if (candidate.marketCapUsd > 0 && candidate.marketCapUsd <= 50000000) {
    score += 20;
    notes.push("低めの時価総額で初期候補として見やすいにゃ");
  } else if (candidate.marketCapUsd > 500000000) {
    score -= 15;
    warnings.push("時価総額が大きめで、初期候補としては遅い可能性がありますにゃ");
  }

  if (candidate.liquidityUsd >= 50000) {
    score += 15;
    notes.push("最低限の流動性がありますにゃ");
  } else if (candidate.liquidityUsd > 0) {
    score -= 10;
    warnings.push("流動性が低めなので、価格が大きく動きやすいにゃ");
  } else {
    warnings.push("流動性データは取得なしですにゃ");
  }

  if (candidate.sellValueUsd > candidate.buyValueUsd * 2 && candidate.buyValueUsd > 0) {
    score -= 20;
    warnings.push("売り金額が買い金額を大きく上回っていますにゃ");
  }

  const hasThinInfo = !candidate.marketCapUsd || !candidate.liquidityUsd || !candidate.holderCount;
  const finalScore = Math.max(Math.min(Math.round(score), scoreCap), 0);
  const confidence = getConfidence(finalScore, hasThinInfo);

  return {
    ...candidate,
    score: finalScore,
    confidence: candidate.buyCount === 1 && confidence === "high" ? "medium" : confidence,
    notes,
    warnings
  };
}

async function discoverSolanaCandidates({ dexTradeLimit = 200, limit = 3, source = "cli", targetTokens = null } = {}) {
  const startedAt = Date.now();
  const rows = await getDexTradesBySource(source, { dexTradeLimit, targetTokens });
  const aggregated = aggregateDexTrades(rows);
  const enriched = await enrichCandidates(aggregated, 30);
  const sourceLabel = source === "rest" ? "REST wide" : "CLI";
  const scoredCandidates = enriched
    .map(scoreCandidate)
    .filter((candidate) => candidate.buyCount > 0);
  const breakdown = getDiscoveryBreakdown(scoredCandidates);

  const discoveries = scoredCandidates
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }

      const confidenceDiff = getConfidenceRank(b.confidence) - getConfidenceRank(a.confidence);
      if (confidenceDiff !== 0) {
        return confidenceDiff;
      }

      if (a.buyCount !== b.buyCount) {
        return b.buyCount - a.buyCount;
      }

      return b.buyValueUsd - a.buyValueUsd;
    })
    .slice(0, limit);

  return attachDiscoveryStats(discoveries, {
    source,
    sourceLabel,
    mode: rows._meta?.mode || "limit",
    requestedLimit: rows._meta?.requestedLimit || rows.length,
    targetReached: Boolean(rows._meta?.targetReached),
    targetTokens: rows._meta?.targetTokens || null,
    actualRowCount: rows._meta?.actualRowCount || rows.length,
    dexTradeCount: rows.length,
    uniqueTokenCount: aggregated.length,
    tokenInfoEnrichedCount: enriched._meta?.enrichedCount || 0,
    partialFailure: Boolean(rows._meta?.partialFailure),
    g0CandidateCount: scoredCandidates.length,
    buyCountAtLeast2: breakdown.buyCountAtLeast2,
    buyCountAtLeast3: breakdown.buyCountAtLeast3,
    withMarketCap: breakdown.withMarketCap,
    withLiquidity: breakdown.withLiquidity,
    displayedCount: discoveries.length,
    durationMs: Date.now() - startedAt,
    pagination: rows._meta?.pagination
  });
}

module.exports = {
  discoverSolanaCandidates
};
