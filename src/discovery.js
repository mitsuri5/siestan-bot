const { getSolanaSmartMoneyDexTrades, getSolanaSmartMoneyDexTradesRest, getTokenInfo } = require("./nansen");

const QUOTE_TOKENS = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
]);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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
    score: 0,
    confidence: "risky",
    notes: [],
    warnings: []
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
    }

    if (sold) {
      sold.sellCount += 1;
      sold.sellValueUsd += tradeValueUsd;
      sold.totalTradeValueUsd += tradeValueUsd;
    }
  }

  return Array.from(candidates.values()).filter((candidate) => candidate.buyCount > 0);
}

function summarizeTokenInfo(info) {
  const details = info.token_details || {};
  const metrics = info.spot_metrics || {};

  return {
    name: info.name || "",
    symbol: info.symbol || "",
    marketCapUsd: toNumber(details.market_cap_usd),
    liquidityUsd: toNumber(metrics.liquidity_usd),
    holderCount: toNumber(metrics.total_holders)
  };
}

async function enrichCandidates(candidates) {
  const topCandidates = candidates
    .sort((a, b) => b.buyValueUsd - a.buyValueUsd)
    .slice(0, 8);

  const enriched = [];

  for (const candidate of topCandidates) {
    try {
      const info = summarizeTokenInfo(
        await getTokenInfo({
          chain: "solana",
          token: candidate.address
        })
      );

      enriched.push({
        ...candidate,
        name: info.name || candidate.name,
        symbol: info.symbol || candidate.symbol,
        marketCapUsd: info.marketCapUsd,
        liquidityUsd: info.liquidityUsd,
        holderCount: info.holderCount
      });
    } catch (error) {
      console.error("Failed to enrich discovery candidate:", candidate.address, error);
      enriched.push({
        ...candidate,
        warnings: [...candidate.warnings, "Token infoを取得できませんでしたにゃ"]
      });
    }
  }

  return enriched;
}

function attachDiscoveryStats(discoveries, stats) {
  Object.defineProperty(discoveries, "stats", {
    enumerable: false,
    value: stats
  });

  return discoveries;
}

async function getDexTradesBySource(source) {
  if (source === "rest") {
    return getSolanaSmartMoneyDexTradesRest({ page: 1, perPage: 100 });
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

function scoreCandidate(candidate) {
  const notes = [];
  const warnings = [...candidate.warnings];
  let score = 0;

  if (candidate.buyValueUsd > candidate.sellValueUsd) {
    score += 30;
    notes.push("買い金額が売り金額を上回っていますにゃ");
  }

  if (candidate.buyCount >= 2) {
    score += Math.min(candidate.buyCount * 6, 20);
    notes.push("複数回SMに買われていますにゃ");
  } else if (candidate.buyCount === 1) {
    warnings.push("Smart Moneyの買いが1件だけなので、継続性はDeep分析で確認してくださいにゃ");
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
  const finalScore = Math.max(Math.min(Math.round(score), 100), 0);
  const confidence = getConfidence(finalScore, hasThinInfo);

  return {
    ...candidate,
    score: finalScore,
    confidence: candidate.buyCount === 1 && confidence === "high" ? "medium" : confidence,
    notes,
    warnings
  };
}

async function discoverSolanaCandidates({ limit = 3, source = "cli" } = {}) {
  const rows = await getDexTradesBySource(source);
  const aggregated = aggregateDexTrades(rows);
  const enriched = await enrichCandidates(aggregated);
  const sourceLabel = source === "rest" ? "REST wide" : "CLI";

  const discoveries = enriched
    .map(scoreCandidate)
    .filter((candidate) => candidate.buyCount > 0)
    .sort((a, b) => {
      const aBuyDominance = a.buyValueUsd > a.sellValueUsd ? 1 : 0;
      const bBuyDominance = b.buyValueUsd > b.sellValueUsd ? 1 : 0;

      if (aBuyDominance !== bBuyDominance) {
        return bBuyDominance - aBuyDominance;
      }

      if (a.score !== b.score) {
        return b.score - a.score;
      }

      return b.buyValueUsd - a.buyValueUsd;
    })
    .slice(0, limit);

  return attachDiscoveryStats(discoveries, {
    source,
    sourceLabel,
    dexTradeCount: rows.length,
    g0CandidateCount: aggregated.length,
    displayedCount: discoveries.length,
    pagination: rows._meta?.pagination
  });
}

module.exports = {
  discoverSolanaCandidates
};
