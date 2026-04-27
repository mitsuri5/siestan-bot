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
  const embed = new EmbedBuilder()
    .setColor(0x6ec6ff)
    .setTitle("しえすたん G0 Discovery")
    .setDescription(
      "Smart Money DEX Tradesから見つけたEarly Signal Radarの候補ですにゃ。投資助言ではないにゃ。"
    )
    .setTimestamp(new Date());

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
          "**売買**",
          `買い: **${formatTradeUsd(discovery.buyValueUsd)}**｜売り: **${formatTradeUsd(discovery.sellValueUsd)}**`,
          `買い件数: ${formatTradeCount(discovery.buyCount)}｜売り件数: ${formatTradeCount(discovery.sellCount)}`,
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
      `G0候補: ${formatTradeCount(stats.g0CandidateCount ?? 0)}`,
      `Deep分析: ${formatTradeCount(stats.deepAnalyzedCount ?? 0)}`,
      `内訳: high ${formatTradeCount(confidenceCounts.high ?? 0)} / medium ${formatTradeCount(confidenceCounts.medium ?? 0)} / low ${formatTradeCount(confidenceCounts.low ?? 0)} / risky ${formatTradeCount(confidenceCounts.risky ?? 0)}`,
      `表示件数: ${formatTradeCount(stats.displayedCount ?? results.length)}`
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
          "**DEX売買**",
          `買い: **${formatTradeUsd(dexTrades.buyValueUsd ?? discovery.buyValueUsd)}**｜売り: **${formatTradeUsd(dexTrades.sellValueUsd ?? discovery.sellValueUsd)}**`,
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

module.exports = {
  createDeepAnalysisEmbed,
  createDiscoveryComponents,
  createDiscoveryEmbed,
  createEarlySignalEmbed,
  createRadarEmbed
};
