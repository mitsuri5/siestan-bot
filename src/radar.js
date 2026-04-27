const { analyzeSolanaTokenDeep } = require("./deepAnalysis");
const { discoverSolanaCandidates } = require("./discovery");

const CONFIDENCE_ORDER = ["risky", "low", "medium", "high"];
const NETFLOW_MISSING_WARNING = "Smart Money netflow上位には未検出ですにゃ";
const DEX_SELL_DOMINANT_WARNING = "Deep分析では直近DEX売買が売り優勢ですにゃ";
const TOKEN_INFO_THIN_WARNING = "Token Infoが十分に取れていないため、確信度を下げていますにゃ";

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function lowerConfidence(confidence, steps = 1) {
  const index = CONFIDENCE_ORDER.indexOf(confidence);
  const currentIndex = index === -1 ? 0 : index;
  return CONFIDENCE_ORDER[Math.max(currentIndex - steps, 0)];
}

function confidenceFromScore(score) {
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

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}

function isBuyDominanceNote(note) {
  return note.includes("買い金額") && note.includes("売り金額") && note.includes("上回");
}

function getTokenInfoCompleteness(analysis) {
  const marketCapUsd = toNumber(analysis.tokenInfo?.marketCapUsd);
  const liquidityUsd = toNumber(analysis.tokenInfo?.liquidityUsd);

  return {
    hasMarketCap: marketCapUsd > 0,
    hasLiquidity: liquidityUsd > 0
  };
}

function hasStrongDeepFlow(analysis, isDexSellDominant) {
  const netflow = analysis.netflowToken || {};
  return (
    toNumber(netflow.net_flow_24h_usd) > 0 &&
    toNumber(netflow.net_flow_7d_usd) > 0 &&
    toNumber(analysis.flow?.netFlowUsd) > 0 &&
    !isDexSellDominant
  );
}

function allowsHighConfidence({ discovery, analysis, isDexSellDominant }) {
  if (discovery.buyCount >= 2) {
    return true;
  }

  return hasStrongDeepFlow(analysis, isDexSellDominant);
}

function createStats({ discoveries, analyzedResults, displayedResults }) {
  const confidenceCounts = {
    high: 0,
    medium: 0,
    low: 0,
    risky: 0
  };

  for (const result of analyzedResults) {
    if (confidenceCounts[result.finalConfidence] !== undefined) {
      confidenceCounts[result.finalConfidence] += 1;
    }
  }

  return {
    source: discoveries.stats?.source || "cli",
    sourceLabel: discoveries.stats?.sourceLabel || "CLI",
    dexTradeCount: discoveries.stats?.dexTradeCount || 0,
    g0CandidateCount: discoveries.length,
    deepAnalyzedCount: analyzedResults.length,
    confidenceCounts,
    displayedCount: displayedResults.length,
    hasMediumOrHigher: confidenceCounts.high + confidenceCounts.medium > 0,
    hasOnlyRisky: analyzedResults.length > 0 && analyzedResults.every((result) => result.finalConfidence === "risky")
  };
}

function combineScores(discovery, analysis) {
  let finalScore = Math.round(toNumber(discovery.score) * 0.4 + toNumber(analysis.score) * 0.6);
  let finalConfidence = confidenceFromScore(finalScore);
  const g0Notes = [...(discovery.notes || [])];
  const deepNotes = [...(analysis.good || [])];
  const warnings = [...(discovery.warnings || []), ...(analysis.warnings || [])];
  const buyValue = toNumber(analysis.dexTrades?.buyValueUsd);
  const sellValue = toNumber(analysis.dexTrades?.sellValueUsd);
  const isDexSellDominant = sellValue > buyValue;
  const isDexStrongSellDominant = buyValue > 0 ? sellValue >= buyValue * 2 : sellValue > 0;
  const tokenInfo = getTokenInfoCompleteness(analysis);
  let scoreCap = 100;
  const canBeHighConfidence = allowsHighConfidence({ discovery, analysis, isDexSellDominant });

  if (analysis.confidence === "high") {
    finalScore += 5;
  }

  if (analysis.confidence === "risky") {
    finalScore -= 20;
    finalConfidence = lowerConfidence(finalConfidence, 2);
  }

  if (!analysis.hasNetflowTopHit) {
    warnings.push(NETFLOW_MISSING_WARNING);
    finalConfidence = lowerConfidence(finalConfidence);
  }

  if (isDexStrongSellDominant) {
    finalScore -= 20;
    warnings.push(DEX_SELL_DOMINANT_WARNING);
    finalConfidence = lowerConfidence(finalConfidence);
  } else if (isDexSellDominant) {
    finalScore -= 10;
    warnings.push(DEX_SELL_DOMINANT_WARNING);
    finalConfidence = lowerConfidence(finalConfidence);
  }

  if (!tokenInfo.hasMarketCap && !tokenInfo.hasLiquidity) {
    scoreCap = Math.min(scoreCap, 60);
    warnings.push(TOKEN_INFO_THIN_WARNING);
    finalConfidence = lowerConfidence(finalConfidence);
  } else if (!tokenInfo.hasMarketCap) {
    scoreCap = Math.min(scoreCap, 75);
    warnings.push("Token Infoの時価総額が取得できないため、最終スコアの上限を下げていますにゃ");
    finalConfidence = lowerConfidence(finalConfidence);
  }

  finalScore = Math.max(Math.min(finalScore, scoreCap), 0);

  const scoreConfidence = confidenceFromScore(finalScore);
  if (CONFIDENCE_ORDER.indexOf(scoreConfidence) < CONFIDENCE_ORDER.indexOf(finalConfidence)) {
    finalConfidence = scoreConfidence;
  }

  if (finalConfidence === "high" && !canBeHighConfidence) {
    finalConfidence = "medium";
    warnings.push("Smart Moneyの買いが単発寄りなので、high判定は見送っていますにゃ");
  }

  const filteredG0Notes = isDexSellDominant ? g0Notes.filter((note) => !isBuyDominanceNote(note)) : g0Notes;

  return {
    address: discovery.address,
    discovery,
    analysis,
    finalScore,
    finalConfidence,
    g0Notes: uniqueList(filteredG0Notes),
    deepNotes: uniqueList(deepNotes),
    good: uniqueList([...filteredG0Notes, ...deepNotes]),
    warnings: uniqueList(warnings)
  };
}

async function runSolanaRadar({ source = "cli" } = {}) {
  const discoveries = await discoverSolanaCandidates({ limit: 5, source });
  const analyzedResults = [];

  for (const discovery of discoveries) {
    try {
      const analysis = await analyzeSolanaTokenDeep(discovery.address);
      analyzedResults.push(combineScores(discovery, analysis));
    } catch (error) {
      console.error("Failed to run radar deep analysis:", discovery.address, error);
      analyzedResults.push({
        address: discovery.address,
        discovery,
        analysis: null,
        finalScore: Math.max(Math.round(toNumber(discovery.score) * 0.4) - 20, 0),
        finalConfidence: "risky",
        g0Notes: uniqueList(discovery.notes || []),
        deepNotes: [],
        good: uniqueList(discovery.notes || []),
        warnings: uniqueList([
          ...(discovery.warnings || []),
          "Deep分析に失敗したため、最終候補としては慎重に見てくださいにゃ"
        ])
      });
    }
  }

  const results = analyzedResults
    .sort((a, b) => {
      if (a.finalConfidence === "risky" && b.finalConfidence !== "risky") {
        return 1;
      }
      if (a.finalConfidence !== "risky" && b.finalConfidence === "risky") {
        return -1;
      }
      return b.finalScore - a.finalScore;
    })
    .slice(0, 3);

  return {
    results,
    stats: createStats({
      discoveries,
      analyzedResults,
      displayedResults: results
    })
  };
}

module.exports = {
  runSolanaRadar
};
