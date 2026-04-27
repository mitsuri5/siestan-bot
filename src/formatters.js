const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

const NO_DATA = "取得なし";
const NO_WARNINGS = "大きな注意点なし";
const UNKNOWN_SYMBOL = "シンボル未取得";

function formatUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return NO_DATA;
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    notation: Math.abs(number) >= 1000000 ? "compact" : "standard",
    style: "currency"
  }).format(number);
}

function formatTradeUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return NO_DATA;
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    notation: Math.abs(number) >= 1000000 ? "compact" : "standard",
    style: "currency"
  }).format(number);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return NO_DATA;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(number);
}

function formatTradeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return NO_DATA;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(number);
}

function formatDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return NO_DATA;
  }

  return `${(number / 1000).toFixed(1)}秒`;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return NO_DATA;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    style: "percent"
  }).format(number);
}

function formatSignedPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return NO_DATA;
  }

  const sign = number > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent"
  }).format(number)}`;
}

function formatDateTime(value) {
  if (!value) {
    return NO_DATA;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return NO_DATA;
  }

  return date.toLocaleString("ja-JP", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatElapsed(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return NO_DATA;
  }

  const totalMinutes = Math.floor(number / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}日${hours}時間`;
  }

  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }

  return `${minutes}分`;
}

function formatList(items, fallback = NO_DATA) {
  if (!items || items.length === 0) {
    return fallback;
  }

  return items.slice(0, 3).join(", ");
}

function shortenAddress(address) {
  if (!address || address.length <= 14) {
    return address || NO_DATA;
  }

  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function truncate(value, maxLength = 1000) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function formatGate(passed) {
  return passed ? "通過" : "要監視";
}

function formatConfidence(confidence) {
  const labels = {
    high: "high（高め）",
    medium: "medium（中くらい）",
    low: "low（低め）",
    risky: "risky（かなり慎重）"
  };

  return labels[confidence] || NO_DATA;
}

function getDiscoveryButtonLabel(discovery, index) {
  const symbolOrAddress = discovery.symbol || shortenAddress(discovery.address);
  return `${index + 1}位 ${symbolOrAddress}`.slice(0, 80);
}

function createDiscoveryComponents(discoveries) {
  return discoveries.slice(0, 3).map((discovery, index) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`deep:solana:${discovery.address}`)
        .setLabel(getDiscoveryButtonLabel(discovery, index))
        .setStyle(ButtonStyle.Primary)
    )
  );
}

function createDiscoveryEmbed(discoveries) {
  const stats = discoveries.stats || {};
  const embed = new EmbedBuilder()
    .setColor(0x6ec6ff)
    .setTitle("しえすたん G0 Discovery")
    .setDescription(
      "Smart Money DEX Tradesから見つけたEarly Signal Radarの候補ですにゃ。投資助言ではないにゃ。"
    )
    .setTimestamp(new Date());

  embed.addFields({
    name: "スキャン概要",
    value: [
      `データ取得元: ${stats.sourceLabel || "CLI"}`,
      `Smart Money DEX Trades取得件数: ${formatTradeCount(stats.dexTradeCount ?? 0)}`,
      `G0候補: ${formatTradeCount(stats.g0CandidateCount ?? discoveries.length)}`,
      `SM買い2件以上: ${formatTradeCount(stats.buyCountAtLeast2 ?? 0)}`,
      `SM買い3件以上: ${formatTradeCount(stats.buyCountAtLeast3 ?? 0)}`,
      `MCAP取得あり: ${formatTradeCount(stats.withMarketCap ?? 0)}`,
      `流動性取得あり: ${formatTradeCount(stats.withLiquidity ?? 0)}`,
      `表示件数: ${formatTradeCount(stats.displayedCount ?? discoveries.length)}`,
      `実行時間: ${formatDuration(stats.durationMs)}`
    ].join("\n")
  });

  if (discoveries.length === 0) {
    embed.addFields({
      name: "候補なし",
      value: "買いが確認できる候補は見つかりませんでしたにゃ。"
    });
    return embed;
  }

  for (const discovery of discoveries.slice(0, 3)) {
    const symbol = discovery.symbol || UNKNOWN_SYMBOL;
    const notes = formatList(discovery.notes);
    const warnings = formatList(discovery.warnings, NO_WARNINGS);

    embed.addFields({
      name: "━━━━━━━━━━━━━━━━━━━━",
      value: truncate(
        [
          `**${symbol}**`,
          `Score **${discovery.score}/100**｜Confidence **${formatConfidence(discovery.confidence)}**`,
          "",
          "**SM売買金額**",
          `買い: **${formatTradeUsd(discovery.buyValueUsd)}**｜売り: **${formatTradeUsd(discovery.sellValueUsd)}**`,
          "",
          "**SM売買件数**",
          `買い: ${formatTradeCount(discovery.buyCount)}｜売り: ${formatTradeCount(discovery.sellCount)}`,
          "",
          "**基本情報**",
          `MCAP: **${formatUsd(discovery.marketCapUsd)}**`,
          `流動性: **${formatUsd(discovery.liquidityUsd)}**`,
          `Holders: **${formatNumber(discovery.holderCount)}**`,
          `Address: ${shortenAddress(discovery.address)}`,
          `チャート: [Dexscreener](https://dexscreener.com/solana/${discovery.address})`,
          "",
          "**しえすたんメモ**",
          notes,
          "",
          "⚠️ **注意点**",
          warnings,
          "",
          "**深掘り**",
          `\`!deep solana ${discovery.address}\``
        ].join("\n"),
        1024
      )
    });
  }

  return embed;
}

function createEarlySignalEmbed(signals) {
  const embed = new EmbedBuilder()
    .setColor(0x7bd88f)
    .setTitle("しえすたん Early Signal Radar")
    .setDescription(
      "Nansen CLIから取得したSmart Moneyの流入候補ですにゃ。投資助言ではないにゃ。"
    )
    .setTimestamp(new Date());

  const topSignals = signals.slice(0, 3);

  if (topSignals.length === 0) {
    embed.addFields({
      name: "候補なし",
      value: "今回のスキャンでは表示できる候補がありませんでしたにゃ。"
    });
    return embed;
  }

  for (const signal of topSignals) {
    const symbol = signal.token_symbol || UNKNOWN_SYMBOL;
    const sectors = formatList(signal.token_sectors);
    const reasons = formatList(signal.reasons);
    const warnings = formatList(signal.warnings, NO_WARNINGS);

    embed.addFields({
      name: `${symbol} | スコア ${signal.score}/100`,
      value: [
        `時価総額: ${formatUsd(signal.market_cap_usd)}`,
        `24時間フロー: ${formatUsd(signal.net_flow_24h_usd)}`,
        `7日フロー: ${formatUsd(signal.net_flow_7d_usd)}`,
        `トレーダー数: ${formatNumber(signal.trader_count)}`,
        `トークン年齢: ${formatNumber(signal.token_age_days)}日`,
        `セクター: ${sectors}`,
        `良い点: ${reasons}`,
        `注意点: ${warnings}`
      ].join("\n")
    });
  }

  return embed;
}

function createDeepAnalysisEmbed(analysis) {
  const tokenInfo = analysis.tokenInfo || {};
  const netflow = analysis.netflowToken || {};
  const gates = analysis.gates;
  const symbol = tokenInfo.symbol || netflow.token_symbol || UNKNOWN_SYMBOL;
  const tokenName = tokenInfo.name || NO_DATA;

  const embed = new EmbedBuilder()
    .setColor(0xffd166)
    .setTitle(`しえすたん Deep Radar | ${symbol}`)
    .setDescription("Nansen CLIの追加データで深掘りした調査補助ですにゃ。投資助言ではないにゃ。")
    .addFields(
      {
        name: "トークン情報",
        value: truncate(
          [
            `トークン名: ${tokenName}`,
            `シンボル: ${symbol}`,
            `アドレス: ${analysis.tokenAddress}`,
            `チェーン: ${analysis.chain}`,
            `チャート: [Dexscreener](https://dexscreener.com/solana/${analysis.tokenAddress})`,
            `時価総額: ${formatUsd(tokenInfo.marketCapUsd || netflow.market_cap_usd)}`,
            `流動性: ${formatUsd(tokenInfo.liquidityUsd)}`,
            `ホルダー数: ${formatNumber(tokenInfo.holderCount)}`
          ].join("\n")
        )
      },
      {
        name: "Smart Moneyフロー概要",
        value: truncate(
          [
            `24時間: ${formatUsd(netflow.net_flow_24h_usd)}`,
            `7日間: ${formatUsd(netflow.net_flow_7d_usd)}`,
            `30日間: ${formatUsd(netflow.net_flow_30d_usd)}`,
            `トレーダー数: ${formatNumber(netflow.trader_count)}`
          ].join("\n")
        )
      },
      {
        name: "Flow Intelligence概要",
        value: truncate(
          [
            `件数: ${formatNumber(analysis.flow.rowCount)}`,
            `推定ネットフロー: ${formatUsd(analysis.flow.netFlowUsd)}`,
            `関連ウォレット数: ${formatNumber(analysis.flow.walletCount)}`,
            `ラベル: ${formatList(analysis.flow.labels)}`
          ].join("\n")
        )
      },
      {
        name: "Holder概要",
        value: truncate(
          [
            `取得件数: ${formatNumber(analysis.holders.rowCount)}`,
            `上位ホルダー評価額合計: ${formatUsd(analysis.holders.totalValueUsd)}`,
            `上位ホルダー保有比率: ${formatPercent(analysis.holders.totalOwnership)}`,
            `主なラベル: ${formatList(analysis.holders.labels)}`
          ].join("\n")
        )
      },
      {
        name: "DEX Trades概要",
        value: truncate(
          [
            `取得件数: ${formatNumber(analysis.dexTrades.rowCount)}`,
            `買い件数: ${formatNumber(analysis.dexTrades.buyCount)}`,
            `売り件数: ${formatNumber(analysis.dexTrades.sellCount)}`,
            `買い金額: ${formatUsd(analysis.dexTrades.buyValueUsd)}`,
            `売り金額: ${formatUsd(analysis.dexTrades.sellValueUsd)}`
          ].join("\n")
        )
      },
      {
        name: "Gate判定",
        value: truncate(
          [
            `G1 Flow Signal: ${formatGate(gates.g1FlowSignal)}`,
            `G2 Buyer Quality: ${formatGate(gates.g2BuyerQuality)}`,
            `G3 Holder Conviction: ${formatGate(gates.g3HolderConviction)}`,
            `G4 Risk Check: ${formatGate(gates.g4RiskCheck)}`
          ].join("\n")
        )
      },
      {
        name: "Deepスコア",
        value: `${analysis.score}/100`
      },
      {
        name: "Confidence",
        value: formatConfidence(analysis.confidence)
      },
      {
        name: "良い点",
        value: truncate(formatList(analysis.good))
      },
      {
        name: "注意点",
        value: truncate(formatList(analysis.warnings, NO_WARNINGS))
      }
    )
    .setTimestamp(new Date());

  return embed;
}

function createRadarEmbed(results, stats = {}) {
  const confidenceCounts = stats.confidenceCounts || {};
  const hasMediumOrHigher = stats.hasMediumOrHigher !== false;
  const hasOnlyRisky = Boolean(stats.hasOnlyRisky);
  const cautionText = hasMediumOrHigher
    ? ""
    : "\n\n今回は medium 以上の候補はありませんでしたにゃ。参考候補として risky / low を表示しているにゃ。";
  const embed = new EmbedBuilder()
    .setColor(0xf2a65a)
    .setTitle(hasOnlyRisky ? "しえすたん Alpha Radar | 参考候補" : "しえすたん Alpha Radar")
    .setDescription(
      `G0 DiscoveryからDeep分析まで通した統合レーダーですにゃ。投資助言ではないにゃ。${cautionText}`
    )
    .setTimestamp(new Date());

  embed.addFields({
    name: "スキャン概要",
    value: [
      `データ取得元: ${stats.sourceLabel || "CLI"}`,
      `Smart Money DEX Trades取得件数: ${formatTradeCount(stats.dexTradeCount ?? 0)}`,
      `G0候補: ${formatTradeCount(stats.g0CandidateCount ?? 0)}`,
      `SM買い2件以上: ${formatTradeCount(stats.buyCountAtLeast2 ?? 0)} / 3件以上: ${formatTradeCount(stats.buyCountAtLeast3 ?? 0)}`,
      `MCAP取得あり: ${formatTradeCount(stats.withMarketCap ?? 0)} / 流動性取得あり: ${formatTradeCount(stats.withLiquidity ?? 0)}`,
      `Deep分析: ${formatTradeCount(stats.deepAnalyzedCount ?? 0)}`,
      `内訳: high ${formatTradeCount(confidenceCounts.high ?? 0)} / medium ${formatTradeCount(confidenceCounts.medium ?? 0)} / low ${formatTradeCount(confidenceCounts.low ?? 0)} / risky ${formatTradeCount(confidenceCounts.risky ?? 0)}`,
      `表示件数: ${formatTradeCount(stats.displayedCount ?? results.length)}`,
      `実行時間: ${formatDuration(stats.durationMs)}`
    ].join("\n")
  });

  if (results.length === 0) {
    embed.addFields({
      name: "候補なし",
      value: "今回のRadarでは表示できる候補が見つかりませんでしたにゃ。"
    });
    return embed;
  }

  results.slice(0, 3).forEach((result, index) => {
    const discovery = result.discovery || {};
    const analysis = result.analysis || {};
    const tokenInfo = analysis.tokenInfo || {};
    const netflow = analysis.netflowToken || {};
    const flow = analysis.flow || {};
    const dexTrades = analysis.dexTrades || {};
    const symbol = tokenInfo.symbol || discovery.symbol || UNKNOWN_SYMBOL;
    const g0Notes = formatList(result.g0Notes, NO_DATA);
    const deepNotes = formatList(result.deepNotes, NO_DATA);
    const warnings = formatList(result.warnings, NO_WARNINGS);

    embed.addFields({
      name: `${index + 1}位 ${symbol} | Final ${result.finalScore}/100${result.finalConfidence === "risky" ? " | 参考候補" : ""}`,
      value: truncate(
        [
          `Confidence **${formatConfidence(result.finalConfidence)}**`,
          `G0 Score: **${discovery.score ?? NO_DATA}/100**｜Deep Score: **${analysis.score ?? NO_DATA}/100**`,
          "",
          "**基本情報**",
          `MCAP: **${formatUsd(tokenInfo.marketCapUsd || discovery.marketCapUsd)}**`,
          `流動性: **${formatUsd(tokenInfo.liquidityUsd || discovery.liquidityUsd)}**`,
          `アドレス: ${shortenAddress(result.address)}`,
          `チャート: [Dexscreener](https://dexscreener.com/solana/${result.address})`,
          "",
          "**フロー**",
          `24h Netflow: ${formatUsd(netflow.net_flow_24h_usd)}`,
          `7d Netflow: ${formatUsd(netflow.net_flow_7d_usd)}`,
          `Flow Intelligence推定: ${formatUsd(flow.netFlowUsd)}`,
          "",
          "**Deep DEX売買**",
          `買い: **${formatTradeUsd(dexTrades.buyValueUsd ?? discovery.buyValueUsd)}**｜売り: **${formatTradeUsd(dexTrades.sellValueUsd ?? discovery.sellValueUsd)}**`,
          "",
          "**SM売買件数**",
          `買い: ${formatTradeCount(discovery.buyCount)}｜売り: ${formatTradeCount(discovery.sellCount)}`,
          "",
          "**G0メモ**",
          g0Notes,
          "",
          "**Deepメモ**",
          deepNotes,
          "",
          "⚠️ **注意点**",
          warnings,
          "",
          "**深掘り**",
          `\`!deep solana ${result.address}\``
        ].join("\n"),
        1024
      )
    });
  });

  return embed;
}

function formatReviewToken(item) {
  const symbol = item.symbol || UNKNOWN_SYMBOL;
  const change = item.evaluable ? formatSignedPercent(item.changeRate) : "評価保留";

  return [
    `**${symbol}**`,
    `検出時MCAP: ${formatUsd(item.detectedMarketCapUsd)}｜現在MCAP: ${formatUsd(item.currentMarketCapUsd)}`,
    `変化率: **${change}**｜最新Confidence: ${formatConfidence(item.finalConfidence)}`,
    `最高Final Score: **${item.highestFinalScore ?? item.finalScore}/100**`,
    `再出現: ${formatTradeCount(item.appearanceCount)}回`,
    `初回: ${formatDateTime(item.firstDetectedAt)}`,
    `最新: ${formatDateTime(item.latestDetectedAt)}`,
    `検出から: ${formatElapsed(item.detectedAgeMs)}`,
    `注意点: ${formatList(item.warnings, NO_WARNINGS)}`
  ].join("\n");
}

function formatReviewList(items, fallback) {
  if (!items || items.length === 0) {
    return fallback;
  }

  return truncate(items.map(formatReviewToken).join("\n\n"), 1024);
}

function createReviewEmbed(review) {
  const stats = review.stats || {};
  const confidenceCounts = stats.confidenceCounts || {};
  const embed = new EmbedBuilder()
    .setColor(0x95d5b2)
    .setTitle("しえすたん Signal Review")
    .setDescription("過去のAlpha Radarシグナルを現在のToken Infoと比べる答え合わせですにゃ。投資助言ではないにゃ。")
    .setTimestamp(new Date());

  embed.addFields({
    name: "レビュー概要",
    value: [
      `対象期間: ${stats.reviewWindow || NO_DATA}`,
      `mature条件: ${stats.matureCondition ? `検出から${stats.matureCondition}以上` : "なし"}`,
      `mature条件を満たした件数: ${stats.matureMatchedCount === null || stats.matureMatchedCount === undefined ? "対象外" : `${formatTradeCount(stats.matureMatchedCount)}件`}`,
      `新しすぎて除外: ${stats.matureExcludedTooNewCount === null || stats.matureExcludedTooNewCount === undefined ? "対象外" : `${formatTradeCount(stats.matureExcludedTooNewCount)}件`}`,
      `保存済み総シグナル数: ${formatTradeCount(stats.totalSignalCount ?? 0)}件`,
      `今回レビュー対象: ${formatTradeCount(stats.reviewedSignalCount ?? 0)}件`,
      `集約後トークン数: ${formatTradeCount(stats.tokenCount ?? 0)}件`,
      `評価可能: ${formatTradeCount(stats.evaluableCount ?? 0)}件`,
      `評価保留: ${formatTradeCount(stats.pendingCount ?? 0)}件`,
      `内訳: high ${formatTradeCount(confidenceCounts.high ?? 0)} / medium ${formatTradeCount(confidenceCounts.medium ?? 0)} / low ${formatTradeCount(confidenceCounts.low ?? 0)} / risky ${formatTradeCount(confidenceCounts.risky ?? 0)}`
    ].join("\n")
  });

  if ((stats.tokenCount ?? 0) === 0) {
    embed.addFields({
      name: "レビュー対象なし",
      value: "まだ `!radar solana` の保存結果がないにゃ。先にAlpha Radarを実行してくださいにゃ。"
    });
    return embed;
  }

  embed.addFields(
    {
      name: "変化率上位",
      value: formatReviewList(review.topGainers, "評価できる上昇候補はまだありませんにゃ。")
    },
    {
      name: "変化率下位",
      value: formatReviewList(review.topLosers, "評価できる下落候補はまだありませんにゃ。")
    },
    {
      name: "再出現した候補",
      value: formatReviewList(review.repeatedTokens, "同じトークンの再出現はまだありませんにゃ。")
    },
    {
      name: "注意点が多い候補",
      value: formatReviewList(review.warningHeavy, "大きな注意点が多い候補はありませんにゃ。")
    }
  );

  return embed;
}

module.exports = {
  createDeepAnalysisEmbed,
  createDiscoveryComponents,
  createDiscoveryEmbed,
  createEarlySignalEmbed,
  createRadarEmbed,
  createReviewEmbed
};
