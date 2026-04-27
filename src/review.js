const { getSolanaTokenOhlcv, getTokenInfo } = require("./nansen");
const { readRadarResults } = require("./storage");

const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CONFIDENCE_LEVELS = ["risky", "low", "medium", "high"];
const REVIEW_LIMIT = 20;
const MATURE_DURATIONS = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000
};
const LEGACY_SINGLE_BUY_WARNING = "G0では単発買いなので、継続性はDeep分析で確認してくださいにゃ";
const SINGLE_BUY_WARNING = "Smart Moneyの買いが1件だけなので、継続性はDeep分析で確認してくださいにゃ";

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseNansenTime(value) {
  if (!value) {
    return NaN;
  }

  if (typeof value === "number") {
    return value < 10000000000 ? value * 1000 : value;
  }

  const text = String(value);
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getMarketCapHigh(marketCap) {
  if (typeof marketCap === "number") {
    return toNumber(marketCap);
  }

  if (marketCap && typeof marketCap === "object") {
    return toNumber(marketCap.high);
  }

  return 0;
}

function getMarketCapOpenOrClose(marketCap) {
  if (typeof marketCap === "number") {
    return toNumber(marketCap);
  }

  if (marketCap && typeof marketCap === "object") {
    return toNumber(marketCap.open) || toNumber(marketCap.close);
  }

  return 0;
}

function getOhlcHigh(value) {
  if (typeof value === "number") {
    return toNumber(value);
  }

  if (value && typeof value === "object") {
    return toNumber(value.high);
  }

  return 0;
}

function getOhlcOpenOrClose(value) {
  if (typeof value === "number") {
    return toNumber(value);
  }

  if (value && typeof value === "object") {
    return toNumber(value.open) || toNumber(value.close);
  }

  return 0;
}

function getOhlcClose(value) {
  if (typeof value === "number") {
    return toNumber(value);
  }

  if (value && typeof value === "object") {
    return toNumber(value.close);
  }

  return 0;
}

function getTimeframeStart(timestampMs, timeframe) {
  if (!Number.isFinite(timestampMs)) {
    return NaN;
  }

  if (timeframe === "1h") {
    const date = new Date(timestampMs);
    date.setUTCMinutes(0, 0, 0);
    return date.getTime();
  }

  return timestampMs;
}

function getConfidenceCounts(items) {
  const counts = {
    high: 0,
    medium: 0,
    low: 0,
    risky: 0
  };

  for (const item of items) {
    if (counts[item.finalConfidence] !== undefined) {
      counts[item.finalConfidence] += 1;
    }
  }

  return counts;
}

function normalizeWarning(warning) {
  if (warning === LEGACY_SINGLE_BUY_WARNING) {
    return SINGLE_BUY_WARNING;
  }

  return warning;
}

function normalizeWarnings(warnings) {
  if (!Array.isArray(warnings)) {
    return [];
  }

  return [...new Set(warnings.map(normalizeWarning).filter(Boolean))];
}

function getDetectedMarketCap(result) {
  return (
    toNumber(result.analysis?.tokenInfo?.marketCapUsd) ||
    toNumber(result.discovery?.marketCapUsd) ||
    toNumber(result.analysis?.netflowToken?.market_cap_usd)
  );
}

function getDetectedLiquidity(result) {
  return toNumber(result.analysis?.tokenInfo?.liquidityUsd) || toNumber(result.discovery?.liquidityUsd);
}

function getDetectedSymbol(result) {
  return (
    result.analysis?.tokenInfo?.symbol ||
    result.analysis?.netflowToken?.token_symbol ||
    result.discovery?.symbol ||
    ""
  );
}

function getDetectedRecord(run, result, index) {
  const analysis = result.analysis || {};
  const discovery = result.discovery || {};
  const netflow = analysis.netflowToken || {};
  const flow = analysis.flow || {};
  const dexTrades = analysis.dexTrades || {};
  const address = result.address || analysis.tokenAddress || discovery.address;

  return {
    detectedAt: run.radar_at,
    runIndex: index,
    address,
    symbol: getDetectedSymbol(result),
    finalScore: toNumber(result.finalScore),
    finalConfidence: result.finalConfidence || "risky",
    detectedMarketCapUsd: getDetectedMarketCap(result),
    detectedLiquidityUsd: getDetectedLiquidity(result),
    netFlow24hUsd: toNumber(netflow.net_flow_24h_usd),
    netFlow7dUsd: toNumber(netflow.net_flow_7d_usd),
    flowIntelligenceNetFlowUsd: toNumber(flow.netFlowUsd),
    deepDexBuyValueUsd: toNumber(dexTrades.buyValueUsd),
    deepDexSellValueUsd: toNumber(dexTrades.sellValueUsd),
    smartMoneyBuyCount: toNumber(discovery.buyCount),
    warnings: normalizeWarnings(result.warnings)
  };
}

function collectRadarDetections(radarRuns, chain) {
  const detections = [];

  for (const run of radarRuns) {
    if (run.chain !== chain || !Array.isArray(run.results)) {
      continue;
    }

    run.results.forEach((result, index) => {
      const detection = getDetectedRecord(run, result, index);
      if (detection.address && SOLANA_ADDRESS_PATTERN.test(detection.address)) {
        detections.push(detection);
      }
    });
  }

  return detections;
}

function getReviewWindow(option) {
  const now = Date.now();

  if (option === "all") {
    return {
      label: "全履歴",
      filter: () => true
    };
  }

  if (option === "24h") {
    return {
      label: "直近24時間",
      filter: (detection) => now - new Date(detection.detectedAt).getTime() <= 24 * 60 * 60 * 1000
    };
  }

  if (option === "7d") {
    return {
      label: "直近7日",
      filter: (detection) => now - new Date(detection.detectedAt).getTime() <= 7 * 24 * 60 * 60 * 1000
    };
  }

  return {
    label: `直近${REVIEW_LIMIT}シグナル`,
    filter: () => true,
    limit: REVIEW_LIMIT
  };
}

function selectReviewDetections(detections, { option, mature } = {}) {
  const now = Date.now();
  const window = getReviewWindow(option);
  const sorted = [...detections].sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
  const windowFiltered = sorted.filter(window.filter);
  const matureMs = mature ? MATURE_DURATIONS[mature] : null;
  const matureFiltered = matureMs
    ? windowFiltered.filter((detection) => now - new Date(detection.detectedAt).getTime() >= matureMs)
    : windowFiltered;
  const finalDetections = window.limit ? matureFiltered.slice(0, window.limit) : matureFiltered;

  return {
    label: window.label,
    matureCondition: mature || null,
    matureMatchedCount: mature ? matureFiltered.length : null,
    matureExcludedTooNewCount: mature ? windowFiltered.length - matureFiltered.length : null,
    detections: finalDetections
  };
}

function groupDetectionsByToken(detections) {
  const byAddress = new Map();

  for (const detection of detections) {
    const key = detection.address;
    if (!byAddress.has(key)) {
      byAddress.set(key, []);
    }
    byAddress.get(key).push(detection);
  }

  return [...byAddress.entries()].map(([address, tokenDetections]) => {
    const sorted = [...tokenDetections].sort((a, b) => new Date(a.detectedAt) - new Date(b.detectedAt));
    const highestScore = sorted.reduce((max, detection) => Math.max(max, detection.finalScore), 0);
    return {
      address,
      first: sorted[0],
      latest: sorted[sorted.length - 1],
      highestScore,
      appearanceCount: sorted.length
    };
  });
}

async function loadOhlcvPerformance(detection, currentInfo, shouldLoad) {
  const timeframe = "1h";

  if (!shouldLoad) {
    return {
      status: "skipped"
    };
  }

  try {
    const rows = await getSolanaTokenOhlcv({
      tokenAddress: detection.address,
      timeframe
    });
    const detectedAtMs = new Date(detection.detectedAt).getTime();
    const detectedCandleStartMs = getTimeframeStart(detectedAtMs, timeframe);
    const candles = rows
      .map((row) => ({
        intervalStart: row.interval_start,
        intervalStartMs: parseNansenTime(row.interval_start),
        baselineMarketCapUsd: getMarketCapOpenOrClose(row.market_cap),
        marketCapHighUsd: getMarketCapHigh(row.market_cap),
        baselinePriceUsd: getOhlcOpenOrClose(row),
        priceHighUsd: getOhlcHigh(row),
        priceCloseUsd: getOhlcClose(row)
      }))
      .filter(
        (row) =>
          Number.isFinite(row.intervalStartMs) &&
          row.intervalStartMs >= detectedCandleStartMs &&
          (row.marketCapHighUsd > 0 || row.priceHighUsd > 0)
      )
      .sort((a, b) => a.intervalStartMs - b.intervalStartMs);

    if (candles.length === 0) {
      return {
        status: "waiting",
        candleCount: 0
      };
    }

    const detectedMarketCapUsd = toNumber(detection.detectedMarketCapUsd);
    const baselineMarketCapUsd = detectedMarketCapUsd > 0 ? detectedMarketCapUsd : candles[0].baselineMarketCapUsd;
    const marketCapCandles = candles.filter((row) => row.marketCapHighUsd > 0);
    const priceCandles = candles.filter((row) => row.priceHighUsd > 0);
    const maxCandle = marketCapCandles.reduce(
      (best, row) => (row.marketCapHighUsd > best.marketCapHighUsd ? row : best),
      marketCapCandles[0] || null
    );
    const currentMarketCapUsd = toNumber(currentInfo.marketCapUsd);
    const maxMarketCapFromOhlcv = maxCandle?.marketCapHighUsd || 0;
    const currentIsMax = currentMarketCapUsd > maxMarketCapFromOhlcv;
    const maxMarketCapUsd = currentIsMax ? currentMarketCapUsd : maxMarketCapFromOhlcv;
    const canCalculateMarketCapGain = baselineMarketCapUsd > 0 && maxMarketCapUsd > 0;
    const priceBaselineCandle = priceCandles.find((row) => row.baselinePriceUsd > 0);
    const baselinePriceUsd = priceBaselineCandle?.baselinePriceUsd || 0;
    const maxPriceCandle = priceCandles.reduce(
      (best, row) => (row.priceHighUsd > best.priceHighUsd ? row : best),
      priceCandles[0] || null
    );
    const latestPriceCandle = [...priceCandles].reverse().find((row) => row.priceCloseUsd > 0);
    const maxPriceUsd = maxPriceCandle?.priceHighUsd || 0;
    const canCalculatePriceGain = baselinePriceUsd > 0 && maxPriceUsd > 0;

    if (!canCalculateMarketCapGain && !canCalculatePriceGain) {
      return {
        status: "not_evaluable",
        candleCount: candles.length
      };
    }

    return {
      status: "ready",
      candleCount: candles.length,
      baselineMarketCapUsd,
      usedOhlcvBaseline: detectedMarketCapUsd <= 0,
      maxMarketCapUsd,
      maxGainPct: canCalculateMarketCapGain ? (maxMarketCapUsd - baselineMarketCapUsd) / baselineMarketCapUsd : null,
      maxReachedAt: currentIsMax ? "current" : maxCandle ? new Date(maxCandle.intervalStartMs).toISOString() : null,
      marketCapEvaluable: canCalculateMarketCapGain,
      baselinePriceUsd,
      latestPriceUsd: latestPriceCandle?.priceCloseUsd || 0,
      maxPriceUsd,
      maxPriceGainPct: canCalculatePriceGain ? (maxPriceUsd - baselinePriceUsd) / baselinePriceUsd : null,
      maxPriceReachedAt: maxPriceCandle ? new Date(maxPriceCandle.intervalStartMs).toISOString() : null,
      priceEvaluable: canCalculatePriceGain
    };
  } catch (error) {
    console.error("Failed to load token OHLCV for review:", detection.address, error);
    return {
      status: "waiting",
      candleCount: 0
    };
  }
}

async function loadCurrentTokenInfo(address) {
  try {
    const rawInfo = await getTokenInfo({
      chain: "solana",
      token: address
    });
    const details = rawInfo.token_details || {};
    const metrics = rawInfo.spot_metrics || {};

    return {
      ok: true,
      symbol: rawInfo.symbol || "",
      name: rawInfo.name || "",
      marketCapUsd: toNumber(details.market_cap_usd),
      liquidityUsd: toNumber(metrics.liquidity_usd),
      holderCount: toNumber(metrics.total_holders)
    };
  } catch (error) {
    console.error("Failed to load token info for review:", address, error);
    return {
      ok: false,
      symbol: "",
      name: "",
      marketCapUsd: 0,
      liquidityUsd: 0,
      holderCount: 0
    };
  }
}

function compareMarketCap(detection, currentInfo) {
  const detectedMarketCapUsd = toNumber(detection.detectedMarketCapUsd);
  const currentMarketCapUsd = toNumber(currentInfo.marketCapUsd);

  if (detectedMarketCapUsd <= 0 || currentMarketCapUsd <= 0) {
    return {
      evaluable: false,
      changeRate: null
    };
  }

  return {
    evaluable: true,
    changeRate: (currentMarketCapUsd - detectedMarketCapUsd) / detectedMarketCapUsd
  };
}

function countWarningHeavy(items) {
  return items
    .filter((item) => item.warningCount > 0)
    .sort((a, b) => b.warningCount - a.warningCount || a.changeRate - b.changeRate)
    .slice(0, 3);
}

function getTopMovers(items, direction) {
  const evaluable = items.filter((item) => item.evaluable);
  const sorted = evaluable.sort((a, b) =>
    direction === "up" ? b.changeRate - a.changeRate : a.changeRate - b.changeRate
  );

  return sorted.slice(0, 3);
}

function getTopPriceGainers(items) {
  return items
    .filter((item) => item.ohlcvPerformance.priceEvaluable)
    .sort((a, b) => b.ohlcvPerformance.maxPriceGainPct - a.ohlcvPerformance.maxPriceGainPct)
    .slice(0, 5);
}

async function reviewSolanaRadarSignals({ option = "default", mature = null } = {}) {
  const radarRuns = await readRadarResults();
  const detections = collectRadarDetections(radarRuns, "solana");
  const selection = selectReviewDetections(detections, { option, mature });
  const tokens = groupDetectionsByToken(selection.detections);
  const reviewed = [];
  const shouldLoadOhlcv = Boolean(mature);

  for (const token of tokens) {
    const currentInfo = await loadCurrentTokenInfo(token.address);
    const firstDetection = token.first;
    const latestDetection = token.latest;
    const comparison = compareMarketCap(firstDetection, currentInfo);
    const ohlcvPerformance = await loadOhlcvPerformance(firstDetection, currentInfo, shouldLoadOhlcv);

    reviewed.push({
      address: token.address,
      symbol: currentInfo.symbol || latestDetection.symbol || firstDetection.symbol,
      name: currentInfo.name,
      detectedAt: firstDetection.detectedAt,
      firstDetectedAt: token.first.detectedAt,
      latestDetectedAt: token.latest.detectedAt,
      detectedAgeMs: Date.now() - new Date(token.first.detectedAt).getTime(),
      appearanceCount: token.appearanceCount,
      finalScore: latestDetection.finalScore,
      highestFinalScore: token.highestScore,
      finalConfidence: latestDetection.finalConfidence,
      detectedMarketCapUsd: firstDetection.detectedMarketCapUsd,
      currentMarketCapUsd: currentInfo.marketCapUsd,
      detectedLiquidityUsd: firstDetection.detectedLiquidityUsd,
      currentLiquidityUsd: currentInfo.liquidityUsd,
      currentHolderCount: currentInfo.holderCount,
      netFlow24hUsd: firstDetection.netFlow24hUsd,
      netFlow7dUsd: firstDetection.netFlow7dUsd,
      flowIntelligenceNetFlowUsd: firstDetection.flowIntelligenceNetFlowUsd,
      deepDexBuyValueUsd: firstDetection.deepDexBuyValueUsd,
      deepDexSellValueUsd: firstDetection.deepDexSellValueUsd,
      smartMoneyBuyCount: firstDetection.smartMoneyBuyCount,
      warnings: firstDetection.warnings,
      warningCount: firstDetection.warnings.length,
      evaluable: comparison.evaluable,
      changeRate: comparison.changeRate,
      ohlcvPerformance
    });
  }

  const evaluableCount = reviewed.filter((item) => item.evaluable).length;
  const pendingCount = reviewed.length - evaluableCount;
  const ohlcvSuccessCount = reviewed.filter((item) =>
    ["ready", "waiting", "not_evaluable"].includes(item.ohlcvPerformance.status)
  ).length;
  const ohlcvReadyCount = reviewed.filter((item) => item.ohlcvPerformance.status === "ready").length;
  const ohlcvWaitingCount = reviewed.filter((item) => item.ohlcvPerformance.status === "waiting").length;

  return {
    stats: {
      totalSignalCount: detections.length,
      reviewedSignalCount: selection.detections.length,
      reviewWindow: selection.label,
      matureCondition: selection.matureCondition,
      matureMatchedCount: selection.matureMatchedCount,
      matureExcludedTooNewCount: selection.matureExcludedTooNewCount,
      ohlcvCheckedCount: shouldLoadOhlcv ? reviewed.length : 0,
      ohlcvSuccessCount: shouldLoadOhlcv ? ohlcvSuccessCount : 0,
      ohlcvReadyCount: shouldLoadOhlcv ? ohlcvReadyCount : 0,
      ohlcvWaitingCount: shouldLoadOhlcv ? ohlcvWaitingCount : 0,
      tokenCount: reviewed.length,
      evaluableCount,
      pendingCount,
      confidenceCounts: getConfidenceCounts(reviewed)
    },
    topGainers: getTopMovers(reviewed, "up"),
    topLosers: getTopMovers(reviewed, "down"),
    topPriceGainers: getTopPriceGainers(reviewed),
    repeatedTokens: reviewed
      .filter((item) => item.appearanceCount > 1)
      .sort((a, b) => b.appearanceCount - a.appearanceCount)
      .slice(0, 3),
    warningHeavy: countWarningHeavy(reviewed),
    results: reviewed.sort((a, b) => {
      const aConfidence = CONFIDENCE_LEVELS.indexOf(a.finalConfidence);
      const bConfidence = CONFIDENCE_LEVELS.indexOf(b.finalConfidence);
      return bConfidence - aConfidence || b.finalScore - a.finalScore;
    })
  };
}

module.exports = {
  reviewSolanaRadarSignals
};
