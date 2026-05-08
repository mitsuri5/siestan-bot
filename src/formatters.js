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

function formatSignedUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return NO_DATA;
  }

  const formatted = new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    notation: Math.abs(number) >= 1000000 ? "compact" : "standard",
    style: "currency"
  }).format(Math.abs(number));

  return `${number > 0 ? "+" : "-"}${formatted}`;
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

function formatTokenPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return NO_DATA;
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: number < 0.01 ? 8 : 6,
    style: "currency"
  }).format(number);
}

function formatChangeRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "評価保留";
  }

  return formatSignedPercent(number);
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

function formatDeepJudgement(analysis, netflow, dexTrades) {
  const confidence = analysis.confidence;
  const netFlow24h = Number(netflow.net_flow_24h_usd);
  const netFlow7d = Number(netflow.net_flow_7d_usd);
  const buyValue = Number(dexTrades.buyValueUsd);
  const sellValue = Number(dexTrades.sellValueUsd);
  const warnings = analysis.warnings || [];
  const signals = [];

  if (confidence === "high") {
    signals.push("深掘りでも強めですにゃ");
  } else if (confidence === "low" || confidence === "risky") {
    signals.push("深掘りでは慎重寄りですにゃ");
  } else {
    signals.push("深掘りでは要監視ですにゃ");
  }

  if (Number.isFinite(netFlow24h) && Number.isFinite(netFlow7d) && netFlow24h > 0 && netFlow7d > 0) {
    signals.push("Smart Moneyフローは強めですにゃ");
  } else if (Number.isFinite(netFlow7d) && netFlow7d < 0) {
    signals.push("流入継続は未確認ですにゃ");
  }

  if (Number.isFinite(buyValue) && Number.isFinite(sellValue) && sellValue > buyValue) {
    signals.push("直近DEX売買は売り優勢ですにゃ");
  }

  if (warnings.some((warning) => String(warning).includes("netflow上位には未検出"))) {
    signals.push("Smart Money netflow上位には未検出ですにゃ");
  }

  return signals.slice(0, 3).join("。");
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

function formatHolders(holderCount, smartMoneyHolderCount) {
  const holders = formatNumber(holderCount);
  const smartMoneyHolders = Number(smartMoneyHolderCount);

  if (holders === NO_DATA) {
    return NO_DATA;
  }

  if (Number.isFinite(smartMoneyHolders) && smartMoneyHolders > 0) {
    return `${holders}（SM ${formatTradeCount(smartMoneyHolders)}）`;
  }

  return holders;
}

function formatBuyerQuality(buyerQuality = {}, gates = {}) {
  const checkedCount = Number(buyerQuality.checkedCount || 0);
  const attemptedCount = Number(buyerQuality.attemptedCount || 0);
  const goodCount = Number(buyerQuality.goodCount || 0);
  const averageWinRate = Number(buyerQuality.averageWinRate);
  const totalRealizedPnlUsd = Number(buyerQuality.totalRealizedPnlUsd);

  return [
    `90D良好SM: ${formatTradeCount(goodCount)}/${formatTradeCount(attemptedCount || checkedCount)}`,
    `平均Win Rate: ${Number.isFinite(averageWinRate) && averageWinRate > 0 ? formatPercent(averageWinRate) : NO_DATA}`,
    `90D realized PnL: ${Number.isFinite(totalRealizedPnlUsd) && totalRealizedPnlUsd !== 0 ? formatSignedUsd(totalRealizedPnlUsd) : NO_DATA}`,
    `判定: ${formatGate(gates.g2BuyerQuality)}`
  ].join("\n");
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

function createTokenCardComponents(address) {
  if (!address) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`deep:solana:${address}`)
        .setLabel("🔎 Deep分析")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setLabel("📊 Dexscreener")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://dexscreener.com/solana/${address}`)
    )
  ];
}

function createTokenCheckComponents({ chain = "solana", tokenAddress }) {
  if (!tokenAddress) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`watch:${chain}:${tokenAddress}`)
        .setLabel("⭐ Watch")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deep:${chain}:${tokenAddress}`)
        .setLabel("Deep分析")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setLabel("Dexscreener")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://dexscreener.com/${chain}/${tokenAddress}`)
    )
  ];
}

function createWatchlistComponents(items) {
  const buttons = items.slice(0, 5).map((item) =>
    new ButtonBuilder()
      .setCustomId(`watchremove:${item.chain || "solana"}:${item.tokenAddress}`)
      .setLabel(`Remove ${(item.symbol || item.currentSymbol || shortenAddress(item.tokenAddress)).slice(0, 60)}`)
      .setStyle(ButtonStyle.Danger)
  );

  return buttons.length > 0 ? [new ActionRowBuilder().addComponents(...buttons)] : [];
}

function addInlineField(embed, name, value) {
  embed.addFields({
    name,
    value: truncate(String(value ?? NO_DATA), 250),
    inline: true
  });
}

function getTokenImageUrl(...sources) {
  for (const source of sources) {
    const url =
      source?.image_url ||
      source?.imageUrl ||
      source?.image ||
      source?.logo_url ||
      source?.logoUrl ||
      source?.logo ||
      source?.icon_url ||
      source?.iconUrl ||
      source?.icon ||
      source?.token_image ||
      source?.tokenImage;

    if (typeof url === "string" && /^https?:\/\//.test(url)) {
      return url;
    }
  }

  return null;
}

function createTokenCardEmbed({
  address,
  chain = "solana",
  color = 0x6ec6ff,
  confidence,
  deepScore,
  holderCount,
  imageSources = [],
  liquidityUsd,
  maxPriceGain,
  marketCapUsd,
  mode = "signal",
  name,
  rank,
  score,
  smartMoneyHolderCount,
  smartMoneyBuyCount,
  smartMoneyBuyUsd,
  smartMoneySellCount,
  smartMoneySellUsd,
  symbol,
  tokenAgeDays,
  warnings
}) {
  const titleSymbol = symbol || UNKNOWN_SYMBOL;
  const titleName = name && name !== titleSymbol ? ` | ${name}` : "";
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${rank ? `${rank}. ` : ""}${titleSymbol}${titleName}`.slice(0, 256))
    .setDescription(
      [
        `Chain: \`${chain}\` | Age: \`${tokenAgeDays ? `${formatNumber(tokenAgeDays)}d` : NO_DATA}\``,
        `CA: \`${address || NO_DATA}\``
      ].join("\n")
    )
    .setTimestamp(new Date());

  const imageUrl = getTokenImageUrl(...imageSources);
  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }

  if (mode === "review") {
    addInlineField(embed, "📈 最大価格上昇率", maxPriceGain || "評価保留");
    addInlineField(embed, "⭐ 最高Final", `${score ?? NO_DATA}/100`);
    addInlineField(embed, "🧭 Confidence", formatConfidence(confidence));
    addInlineField(embed, "💧 Liquidity", formatUsd(liquidityUsd));
    addInlineField(embed, "💰 MCAP", formatUsd(marketCapUsd));
    addInlineField(embed, "👥 Holders", formatHolders(holderCount, smartMoneyHolderCount));
    addInlineField(embed, "📊 Chart", `[Dexscreener](https://dexscreener.com/solana/${address})`);
    addInlineField(embed, "🔎 Deep", "ボタンから実行");
  } else {
    addInlineField(embed, "⭐ Score", `${score ?? NO_DATA}/100`);
    addInlineField(embed, "🧭 Confidence", formatConfidence(confidence));
    addInlineField(embed, "💧 Liquidity", formatUsd(liquidityUsd));
    addInlineField(embed, "💰 MCAP", formatUsd(marketCapUsd));
    addInlineField(embed, "👥 Holders", formatHolders(holderCount, smartMoneyHolderCount));
    addInlineField(embed, "💸 SM売買金額", `買い ${formatTradeUsd(smartMoneyBuyUsd)} / 売り ${formatTradeUsd(smartMoneySellUsd)}`);
    addInlineField(embed, "🔁 SM売買件数", `買い ${formatTradeCount(smartMoneyBuyCount)} / 売り ${formatTradeCount(smartMoneySellCount)}`);
    addInlineField(embed, "📊 Chart", `[Dexscreener](https://dexscreener.com/solana/${address})`);
    addInlineField(embed, "🔎 Deep", "ボタンから実行");
  }

  const warningText = formatList(warnings?.slice(0, 2), NO_WARNINGS);
  embed.addFields({
    name: "注意点",
    value: truncate(warningText, 500),
    inline: false
  });

  return embed;
}

function createDiscoveryEmbeds(discoveries) {
  const stats = discoveries.stats || {};
  const overview = new EmbedBuilder()
    .setColor(0x6ec6ff)
    .setTitle("しえすたん G0 Discovery")
    .setDescription("Smart Moneyが直近で買っている候補ですにゃ。投資助言ではないにゃ。")
    .addFields({
      name: "スキャン概要",
      value: [
        `データ取得元: ${stats.sourceLabel || "CLI"}`,
        `取得モード: ${stats.mode || "limit"}`,
        `目標トークン数: ${stats.targetTokens ? formatTradeCount(stats.targetTokens) : "なし"}`,
        `取得したSM取引数: ${formatTradeCount(stats.actualRowCount ?? stats.dexTradeCount ?? 0)}`,
        `集計後トークン数: ${formatTradeCount(stats.uniqueTokenCount ?? stats.g0CandidateCount ?? discoveries.length)}`,
        `Token Info補完件数: ${formatTradeCount(stats.tokenInfoEnrichedCount ?? 0)}`,
        `G0候補: ${formatTradeCount(stats.g0CandidateCount ?? discoveries.length)}`,
        `SM買い2件以上: ${formatTradeCount(stats.buyCountAtLeast2 ?? 0)} / 3件以上: ${formatTradeCount(stats.buyCountAtLeast3 ?? 0)}`,
        `MCAP取得あり: ${formatTradeCount(stats.withMarketCap ?? 0)} / 流動性取得あり: ${formatTradeCount(stats.withLiquidity ?? 0)}`,
        `表示件数: ${formatTradeCount(stats.displayedCount ?? discoveries.length)}`,
        `実行時間: ${formatDuration(stats.durationMs)}`,
        `取得状態: ${stats.partialFailure ? "一部取得失敗" : "正常"}`,
        `target到達: ${stats.targetTokens ? (stats.targetReached ? "はい" : "いいえ") : "対象外"}`
      ].join("\n")
    })
    .setTimestamp(new Date());

  if (discoveries.length === 0) {
    overview.addFields({
      name: "候補なし",
      value: "買いが確認できる候補は見つかりませんでしたにゃ。"
    });
    return [overview];
  }

  const cards = discoveries.slice(0, 5).map((discovery, index) =>
    createTokenCardEmbed({
      address: discovery.address,
      chain: "solana",
      color: 0x6ec6ff,
      confidence: discovery.confidence,
      holderCount: discovery.holderCount,
      imageSources: [discovery],
      liquidityUsd: discovery.liquidityUsd,
      marketCapUsd: discovery.marketCapUsd,
      name: discovery.name,
      rank: index + 1,
      score: discovery.score,
      smartMoneyHolderCount: discovery.smartMoneyHolderCount,
      smartMoneyBuyCount: discovery.buyCount,
      smartMoneyBuyUsd: discovery.buyValueUsd,
      smartMoneySellCount: discovery.sellCount,
      smartMoneySellUsd: discovery.sellValueUsd,
      symbol: discovery.symbol,
      warnings: discovery.warnings
    })
  );

  return [overview, ...cards];
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
      `取得モード: ${stats.mode || "limit"}`,
      `目標トークン数: ${stats.targetTokens ? formatTradeCount(stats.targetTokens) : "なし"}`,
      `取得したSM取引数: ${formatTradeCount(stats.actualRowCount ?? stats.dexTradeCount ?? 0)}`,
      `集計後トークン数: ${formatTradeCount(stats.uniqueTokenCount ?? stats.g0CandidateCount ?? discoveries.length)}`,
      `Token Info補完件数: ${formatTradeCount(stats.tokenInfoEnrichedCount ?? 0)}`,
      `G0候補: ${formatTradeCount(stats.g0CandidateCount ?? discoveries.length)}`,
      `SM買い2件以上: ${formatTradeCount(stats.buyCountAtLeast2 ?? 0)}`,
      `SM買い3件以上: ${formatTradeCount(stats.buyCountAtLeast3 ?? 0)}`,
      `MCAP取得あり: ${formatTradeCount(stats.withMarketCap ?? 0)}`,
      `流動性取得あり: ${formatTradeCount(stats.withLiquidity ?? 0)}`,
      `表示件数: ${formatTradeCount(stats.displayedCount ?? discoveries.length)}`,
      `実行時間: ${formatDuration(stats.durationMs)}`,
      `取得状態: ${stats.partialFailure ? "一部取得失敗" : "正常"}`,
      `target到達: ${stats.targetTokens ? (stats.targetReached ? "はい" : "いいえ") : "対象外"}`
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
  const holders = analysis.holders || {};
  const dexTrades = analysis.dexTrades || {};
  const gates = analysis.gates || {};
  const symbol = tokenInfo.symbol || netflow.token_symbol || UNKNOWN_SYMBOL;
  const marketCapUsd = tokenInfo.marketCapUsd || netflow.market_cap_usd;
  const sellDominant = Number(dexTrades.sellValueUsd) > Number(dexTrades.buyValueUsd);

  const embed = new EmbedBuilder()
    .setColor(0xffd166)
    .setTitle(`しえすたん Deep Radar | ${symbol}`.slice(0, 256))
    .setDescription(
      [
        "追加データで深掘りした診断結果ですにゃ。投資助言ではないにゃ。",
        `Chain: \`${analysis.chain || "solana"}\``,
        `CA: \`${analysis.tokenAddress || NO_DATA}\``
      ].join("\n")
    )
    .setTimestamp(new Date());

  const imageUrl = getTokenImageUrl(tokenInfo);
  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }

  addInlineField(embed, "🧪 Deep判定", `${analysis.score ?? NO_DATA}/100｜${formatConfidence(analysis.confidence)}`);
  embed.addFields({
    name: "しえすたん判定",
    value: truncate(formatDeepJudgement(analysis, netflow, dexTrades), 500),
    inline: false
  });
  addInlineField(
    embed,
    "🌊 SM Flow",
    `24h: ${formatSignedUsd(netflow.net_flow_24h_usd)} / 7d: ${formatSignedUsd(netflow.net_flow_7d_usd)} / 30d: ${formatSignedUsd(netflow.net_flow_30d_usd)}`
  );
  addInlineField(
    embed,
    "💸 Deep DEX売買",
    `買い ${formatTradeUsd(dexTrades.buyValueUsd)} / 売り ${formatTradeUsd(dexTrades.sellValueUsd)}${sellDominant ? " / 売り優勢" : ""}`
  );
  addInlineField(
    embed,
    "🚦 Deepチェック",
    `資金流入: ${formatGate(gates.g1FlowSignal)} / 買い手の質: ${formatGate(gates.g2BuyerQuality)} / ホルダー状況: ${formatGate(gates.g3HolderConviction)} / リスク確認: ${formatGate(gates.g4RiskCheck)}`
  );
  addInlineField(embed, "💧 Liquidity", formatUsd(tokenInfo.liquidityUsd));
  addInlineField(embed, "💰 MCAP", formatUsd(marketCapUsd));
  addInlineField(embed, "👥 Holders", formatHolders(tokenInfo.holderCount, holders.smartMoneyHolderCount));
  addInlineField(embed, "📊 Chart", `[Dexscreener](https://dexscreener.com/solana/${analysis.tokenAddress})`);

  embed.addFields(
    {
      name: "注意点",
      value: truncate(formatList(analysis.warnings?.slice(0, 2), NO_WARNINGS), 500),
      inline: false
    },
    {
      name: "良い点",
      value: truncate(formatList(analysis.good?.slice(0, 2)), 500),
      inline: false
    }
  );

  return embed;
}

function createDeepAnalysisDetailEmbed(analysis) {
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
            `ホルダー数: ${formatHolders(tokenInfo.holderCount, analysis.holders.smartMoneyHolderCount)}`
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
            `Smart Money系ホルダー: ${formatNumber(analysis.holders.smartMoneyHolderCount)}`,
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
      `取得モード: ${stats.mode || "limit"}`,
      `目標トークン数: ${stats.targetTokens ? formatTradeCount(stats.targetTokens) : "なし"}`,
      `取得したSM取引数: ${formatTradeCount(stats.actualRowCount ?? stats.dexTradeCount ?? 0)}`,
      `集計後トークン数: ${formatTradeCount(stats.uniqueTokenCount ?? stats.g0CandidateCount ?? 0)}`,
      `Token Info補完件数: ${formatTradeCount(stats.tokenInfoEnrichedCount ?? 0)}`,
      `G0候補: ${formatTradeCount(stats.g0CandidateCount ?? 0)}`,
      `SM買い2件以上: ${formatTradeCount(stats.buyCountAtLeast2 ?? 0)} / 3件以上: ${formatTradeCount(stats.buyCountAtLeast3 ?? 0)}`,
      `MCAP取得あり: ${formatTradeCount(stats.withMarketCap ?? 0)} / 流動性取得あり: ${formatTradeCount(stats.withLiquidity ?? 0)}`,
      `Deep分析: ${formatTradeCount(stats.deepAnalyzedCount ?? 0)}`,
      `内訳: high ${formatTradeCount(confidenceCounts.high ?? 0)} / medium ${formatTradeCount(confidenceCounts.medium ?? 0)} / low ${formatTradeCount(confidenceCounts.low ?? 0)} / risky ${formatTradeCount(confidenceCounts.risky ?? 0)}`,
      `表示件数: ${formatTradeCount(stats.displayedCount ?? results.length)}`,
      `実行時間: ${formatDuration(stats.durationMs)}`,
      `取得状態: ${stats.partialFailure ? "一部取得失敗" : "正常"}`,
      `target到達: ${stats.targetTokens ? (stats.targetReached ? "はい" : "いいえ") : "対象外"}`
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

function createRadarEmbeds(results, stats = {}) {
  const confidenceCounts = stats.confidenceCounts || {};
  const hasMediumOrHigher = stats.hasMediumOrHigher !== false;
  const hasOnlyRisky = Boolean(stats.hasOnlyRisky);
  const overview = new EmbedBuilder()
    .setColor(0xf2a65a)
    .setTitle(hasOnlyRisky ? "しえすたん Alpha Radar | 参考候補" : "しえすたん Alpha Radar")
    .setDescription(
      hasMediumOrHigher
        ? "G0 DiscoveryからDeep分析まで通した統合レーダーですにゃ。投資助言ではないにゃ。"
        : "今回は medium 以上の候補はありませんでしたにゃ。参考候補として risky / low を表示しているにゃ。投資助言ではないにゃ。"
    )
    .addFields({
      name: "スキャン概要",
      value: [
        `データ取得元: ${stats.sourceLabel || "CLI"}`,
        `取得モード: ${stats.mode || "limit"}`,
        `目標トークン数: ${stats.targetTokens ? formatTradeCount(stats.targetTokens) : "なし"}`,
        `取得したSM取引数: ${formatTradeCount(stats.actualRowCount ?? stats.dexTradeCount ?? 0)}`,
        `集計後トークン数: ${formatTradeCount(stats.uniqueTokenCount ?? stats.g0CandidateCount ?? 0)}`,
        `Token Info補完件数: ${formatTradeCount(stats.tokenInfoEnrichedCount ?? 0)}`,
        `G0候補: ${formatTradeCount(stats.g0CandidateCount ?? 0)}`,
        `Deep分析: ${formatTradeCount(stats.deepAnalyzedCount ?? 0)}`,
        `内訳: high ${formatTradeCount(confidenceCounts.high ?? 0)} / medium ${formatTradeCount(confidenceCounts.medium ?? 0)} / low ${formatTradeCount(confidenceCounts.low ?? 0)} / risky ${formatTradeCount(confidenceCounts.risky ?? 0)}`,
        `表示件数: ${formatTradeCount(stats.displayedCount ?? results.length)}`,
        `実行時間: ${formatDuration(stats.durationMs)}`,
        `取得状態: ${stats.partialFailure ? "一部取得失敗" : "正常"}`,
        `target到達: ${stats.targetTokens ? (stats.targetReached ? "はい" : "いいえ") : "対象外"}`
      ].join("\n")
    })
    .setTimestamp(new Date());

  if (results.length === 0) {
    overview.addFields({
      name: "候補なし",
      value: "今回のRadarでは表示できる候補が見つかりませんでしたにゃ。"
    });
    return [overview];
  }

  const cards = results.slice(0, 5).map((result, index) => {
    const discovery = result.discovery || {};
    const analysis = result.analysis || {};
    const tokenInfo = analysis.tokenInfo || {};
    const dexTrades = analysis.dexTrades || {};
    const tokenName = tokenInfo.name || discovery.name;
    const symbol = tokenInfo.symbol || discovery.symbol;

    return createTokenCardEmbed({
      address: result.address,
      chain: analysis.chain || "solana",
      color: 0xf2a65a,
      confidence: result.finalConfidence,
      deepScore: analysis.score,
      holderCount: tokenInfo.holderCount || discovery.holderCount,
      imageSources: [tokenInfo, discovery],
      liquidityUsd: tokenInfo.liquidityUsd || discovery.liquidityUsd,
      marketCapUsd: tokenInfo.marketCapUsd || discovery.marketCapUsd,
      name: tokenName,
      rank: index + 1,
      score: result.finalScore,
      smartMoneyHolderCount: analysis.holders?.smartMoneyHolderCount || discovery.smartMoneyHolderCount,
      smartMoneyBuyCount: discovery.buyCount,
      smartMoneyBuyUsd: dexTrades.buyValueUsd ?? discovery.buyValueUsd,
      smartMoneySellCount: discovery.sellCount,
      smartMoneySellUsd: dexTrades.sellValueUsd ?? discovery.sellValueUsd,
      symbol,
      warnings: result.warnings
    });
  });

  return [overview, ...cards];
}

function createEliteEmbeds(results, stats = {}) {
  const overview = new EmbedBuilder()
    .setColor(0xd9b8ff)
    .setTitle("しえすたん Elite SM Radar")
    .setDescription("90D成績が良いSmart Moneyが多く買っている候補ですにゃ。投資助言ではないにゃ。")
    .addFields({
      name: "スキャン概要",
      value: [
        `評価したSMウォレット数: ${formatTradeCount(stats.evaluatedWalletCount ?? 0)}`,
        `Profiler確認成功: ${formatTradeCount(stats.profilerEvaluatedCount ?? 0)}`,
        `Elite SMに選ばれた数: ${formatTradeCount(stats.eliteWalletCount ?? 0)} / ${formatTradeCount(stats.requestedTopWallets ?? 50)}`,
        `集計後トークン数: ${formatTradeCount(stats.tokenCount ?? 0)}`,
        `Token Info補完件数: ${formatTradeCount(stats.tokenInfoEnrichedCount ?? 0)}`,
        `表示件数: ${formatTradeCount(stats.displayedCount ?? results.length)}`,
        `取得SM取引数: ${formatTradeCount(stats.dexTradeCount ?? 0)}`,
        `キャッシュ利用数: ${formatTradeCount(stats.cacheHitCount ?? 0)}`,
        `Profiler失敗数: ${formatTradeCount(stats.profilerFailedCount ?? 0)}`,
        `実行時間: ${formatDuration(stats.durationMs)}`,
        `取得状態: ${stats.partialFailure ? "一部取得失敗（途中結果）" : "正常"}`,
        `停止理由: ${stats.stopReason || "なし"}`
      ].join("\n")
    })
    .setTimestamp(new Date());

  if (results.length === 0) {
    overview.addFields({
      name: "候補なし",
      value: "Elite SMの買い候補は見つかりませんでしたにゃ。"
    });
    return [overview];
  }

  const cards = results.slice(0, 5).map((token, index) => {
    const titleSymbol = token.symbol || UNKNOWN_SYMBOL;
    const titleName = token.name && token.name !== titleSymbol ? ` | ${token.name}` : "";
    const embed = new EmbedBuilder()
      .setColor(0xd9b8ff)
      .setTitle(`${index + 1}位 ${titleSymbol}${titleName}`.slice(0, 256))
      .setDescription([
        "Chain: `solana`",
        `CA: \`${token.address || NO_DATA}\``
      ].join("\n"))
      .setTimestamp(new Date());

    const imageUrl = getTokenImageUrl(token);
    if (imageUrl) {
      embed.setThumbnail(imageUrl);
    }

    addInlineField(embed, "🧠 Elite SM買い人数", `${formatTradeCount(token.eliteBuyerCount)} / ${formatTradeCount(stats.eliteWalletCount ?? 0)}`);
    addInlineField(embed, "💸 Elite SM売買金額", `買い ${formatTradeUsd(token.eliteBuyValueUsd)} / 売り ${formatTradeUsd(token.eliteSellValueUsd)}`);
    addInlineField(embed, "📈 Elite SMネット買い", formatSignedUsd(token.eliteNetBuyValueUsd));
    addInlineField(embed, "🧪 買い手の質", `平均Win Rate ${formatPercent(token.averageWinRate)} / 平均90D PnL ${formatSignedUsd(token.averageRealizedPnlUsd)}`);
    addInlineField(embed, "💧 Liquidity", formatUsd(token.liquidityUsd));
    addInlineField(embed, "💰 MCAP", formatUsd(token.marketCapUsd));
    addInlineField(embed, "👥 Holders", formatHolders(token.holderCount));
    addInlineField(embed, "📈 Chart", `[Dexscreener](https://dexscreener.com/solana/${token.address})`);
    addInlineField(embed, "🧪 Deep", "ボタンから実行");

    embed.addFields({
      name: "注意点",
      value: truncate(formatList(token.warnings?.slice(0, 2), NO_WARNINGS), 500),
      inline: false
    });

    return embed;
  });

  return [overview, ...cards];
}

function createTokenCheckEmbed(analysis) {
  const tokenInfo = analysis.tokenInfo || {};
  const dexTrades = analysis.dexTrades || {};
  const flow = analysis.flow || {};
  const holders = analysis.holders || {};
  const buyerQuality = analysis.buyerQuality || {};
  const netflow = analysis.netflowToken || {};
  const symbol = tokenInfo.symbol || UNKNOWN_SYMBOL;
  const titleName = tokenInfo.name && tokenInfo.name !== symbol ? ` | ${tokenInfo.name}` : "";
  const embed = new EmbedBuilder()
    .setColor(0xf7c948)
    .setTitle(`しえすたん Watch Radar | ${symbol}${titleName}`.slice(0, 256))
    .setDescription([
      `Chain: \`${analysis.chain || "solana"}\``,
      `CA: \`${analysis.tokenAddress || NO_DATA}\``,
      `Watch中: ${formatTradeCount(analysis.watchCount || 0)}人`
    ].join("\n"))
    .setTimestamp(new Date());

  const imageUrl = getTokenImageUrl(tokenInfo);
  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }

  addInlineField(embed, "観察スコア", `${analysis.score ?? NO_DATA}/100`);
  addInlineField(embed, "Price", tokenInfo.priceUsd > 0 ? formatTokenPrice(tokenInfo.priceUsd) : NO_DATA);
  addInlineField(embed, "MCAP", formatUsd(tokenInfo.marketCapUsd));
  addInlineField(embed, "Liquidity", formatUsd(tokenInfo.liquidityUsd));
  addInlineField(embed, "Holders", formatHolders(tokenInfo.holderCount, holders.smartMoneyHolderCount));
  addInlineField(
    embed,
    "Smart Money Netflow",
    [
      `24h ${formatSignedUsd(netflow.net_flow_24h_usd)}`,
      `7d ${formatSignedUsd(netflow.net_flow_7d_usd)}`,
      `traders ${formatTradeCount(netflow.trader_count || 0)}`
    ].join(" / ")
  );
  addInlineField(
    embed,
    "SM DEX Trades",
    [
      `買い ${formatTradeCount(dexTrades.buyCount || 0)} / ${formatTradeUsd(dexTrades.buyValueUsd)}`,
      `売り ${formatTradeCount(dexTrades.sellCount || 0)} / ${formatTradeUsd(dexTrades.sellValueUsd)}`
    ].join("\n")
  );
  addInlineField(
    embed,
    "Flow Intelligence",
    [
      `Net ${formatSignedUsd(flow.netFlowUsd)}`,
      `Wallets ${formatTradeCount(flow.walletCount || 0)}`,
      `Labels ${formatList(flow.labels, NO_DATA)}`
    ].join("\n")
  );
  addInlineField(
    embed,
    "Holder概要",
    [
      `上位 ${formatTradeCount(holders.rowCount || 0)}件`,
      `SM系 ${formatTradeCount(holders.smartMoneyHolderCount || 0)}`,
      `Value ${formatUsd(holders.totalValueUsd)}`
    ].join("\n")
  );
  embed.addFields({
    name: "90D Buyer Quality",
    value: truncate(
      [
        `確認: ${formatTradeCount(buyerQuality.checkedCount || 0)} / ${formatTradeCount(buyerQuality.attemptedCount || 0)}`,
        `良好: ${formatTradeCount(buyerQuality.goodCount || 0)}`,
        `平均Win Rate: ${buyerQuality.averageWinRate ? formatPercent(buyerQuality.averageWinRate) : NO_DATA}`,
        `Realized PnL合計: ${formatSignedUsd(buyerQuality.totalRealizedPnlUsd)}`
      ].join("\n"),
      500
    ),
    inline: false
  });
  embed.addFields({
    name: "リスク注意点",
    value: truncate(formatList(analysis.warnings, NO_WARNINGS), 700),
    inline: false
  });

  return embed;
}

function createWatchlistEmbeds(items, user) {
  const title = user?.username ? `${user.username} のWatchlist` : "Your Watchlist";
  const embed = new EmbedBuilder()
    .setColor(0xf7c948)
    .setTitle(title)
    .setDescription("追加時からの変化率です。価格が取れない場合はMCAPで評価します。")
    .setTimestamp(new Date());

  if (items.length === 0) {
    embed.addFields({
      name: "Watchlistは空です",
      value: "`!check solana TOKEN_ADDRESS` から ⭐ Watch を押すと追加できます。"
    });
    return [embed];
  }

  for (const item of items.slice(0, 10)) {
    const symbol = item.currentSymbol || item.symbol || UNKNOWN_SYMBOL;
    const name = item.currentName || item.name || "";
    const addedAt = new Date(item.addedAt || 0).getTime();
    const basisLabel = item.basis === "price" ? "価格" : item.basis === "marketCap" ? "MCAP" : "評価";
    const addedLine = item.basis === "price"
      ? `追加時価格: ${formatTokenPrice(item.addedPriceUsd)}`
      : `追加時MCAP: ${formatUsd(item.addedMarketCapUsd)}`;
    const currentLine = item.basis === "price"
      ? `現在価格: ${formatTokenPrice(item.currentPriceUsd)}`
      : item.basis === "marketCap"
        ? `現在MCAP: ${formatUsd(item.currentMarketCapUsd)}`
        : "現在値: 評価保留";

    embed.addFields({
      name: `${symbol}${name && name !== symbol ? ` | ${name}` : ""}`.slice(0, 256),
      value: truncate(
        [
          `CA: \`${item.tokenAddress}\``,
          addedLine,
          currentLine,
          `${basisLabel}変化率: ${formatChangeRate(item.changeRate)}`,
          `Watch開始: ${Number.isFinite(addedAt) ? formatElapsed(Date.now() - addedAt) : NO_DATA}`,
          `Chart: https://dexscreener.com/${item.chain || "solana"}/${item.tokenAddress}`
        ].join("\n"),
        1024
      ),
      inline: false
    });
  }

  if (items.length > 10) {
    embed.addFields({
      name: "表示上限",
      value: `先頭10件のみ表示しています。合計 ${formatTradeCount(items.length)} 件です。`
    });
  }

  return [embed];
}

function formatReviewToken(item) {
  const symbol = item.symbol || UNKNOWN_SYMBOL;
  const change = item.evaluable ? formatSignedPercent(item.changeRate) : "評価保留";
  const ohlcv = item.ohlcvPerformance || { status: "skipped" };
  let ohlcvLines = ["検出後最大MCAP: matureレビューで確認", "検出後最大上昇率: matureレビューで確認", "最大到達: matureレビューで確認"];

  if (ohlcv.status === "not_evaluable") {
    ohlcvLines = ["検出後最大MCAP: 評価保留", "検出後最大上昇率: 評価保留", "最大到達: 評価保留"];
  } else if (ohlcv.status === "waiting") {
    ohlcvLines = ["検出後最大MCAP: OHLCV蓄積待ち", "検出後最大上昇率: OHLCV蓄積待ち", "最大到達: OHLCV蓄積待ち"];
  } else if (ohlcv.status === "ready") {
    ohlcvLines = [
      `検出後最大MCAP: ${formatUsd(ohlcv.maxMarketCapUsd)}`,
      `検出後最大上昇率: **${formatSignedPercent(ohlcv.maxGainPct)}**`,
      `上昇率基準MCAP: ${formatUsd(ohlcv.baselineMarketCapUsd)}${ohlcv.usedOhlcvBaseline ? "（OHLCV初回）" : "（検出時）"}`,
      `最大到達: ${ohlcv.maxReachedAt === "current" ? "現在値" : formatDateTime(ohlcv.maxReachedAt)}`
    ];
  }

  return [
    `**${symbol}**`,
    `検出時MCAP: ${formatUsd(item.detectedMarketCapUsd)}｜現在MCAP: ${formatUsd(item.currentMarketCapUsd)}`,
    `変化率: **${change}**｜最新Confidence: ${formatConfidence(item.finalConfidence)}`,
    ...ohlcvLines,
    `最高Final Score: **${item.highestFinalScore ?? item.finalScore}/100**`,
    `再出現: ${formatTradeCount(item.appearanceCount)}回`,
    `初回: ${formatDateTime(item.firstDetectedAt)}`,
    `最新: ${formatDateTime(item.latestDetectedAt)}`,
    `検出から: ${formatElapsed(item.detectedAgeMs)}`,
    `注意点: ${formatList(item.warnings, NO_WARNINGS)}`
  ].join("\n");
}

function formatReviewOhlcvLines(ohlcv) {
  if (!ohlcv || ohlcv.status === "skipped") {
    return [
      "初回検出後の最大MCAP: matureレビューで確認",
      "初回検出後の最大MCAP上昇率: matureレビューで確認",
      "初回検出後の最大価格上昇率: matureレビューで確認"
    ];
  }

  if (ohlcv.status === "waiting") {
    return [
      "初回検出後の最大MCAP: OHLCV蓄積待ち",
      "初回検出後の最大MCAP上昇率: OHLCV蓄積待ち",
      "初回検出後の最大価格上昇率: OHLCV蓄積待ち"
    ];
  }

  if (ohlcv.status === "failed") {
    return [
      "初回検出後の最大MCAP: OHLCV取得失敗",
      "初回検出後の最大MCAP上昇率: OHLCV取得失敗",
      "初回検出後の最大価格上昇率: OHLCV取得失敗"
    ];
  }

  if (ohlcv.status === "not_evaluable") {
    return [
      "MCAP評価: 評価保留",
      "初回検出後の最大MCAP上昇率: 評価保留",
      "初回検出後の最大価格上昇率: 評価保留"
    ];
  }

  return [
    `初回検出後の最大MCAP: ${ohlcv.marketCapEvaluable ? formatUsd(ohlcv.maxMarketCapUsd) : "評価保留"}`,
    `初回検出後の最大MCAP上昇率: **${ohlcv.marketCapEvaluable ? formatSignedPercent(ohlcv.maxGainPct) : "評価保留"}**`,
    `上昇率基準MCAP: ${ohlcv.marketCapEvaluable ? formatUsd(ohlcv.baselineMarketCapUsd) : "評価保留"}${ohlcv.marketCapEvaluable ? (ohlcv.usedOhlcvBaseline ? "（OHLCV初回値）" : "（初回検出時）") : ""}`,
    `MCAP最大到達: ${ohlcv.marketCapEvaluable ? (ohlcv.maxReachedAt === "current" ? "現在値" : formatDateTime(ohlcv.maxReachedAt)) : "評価保留"}`,
    `初回検出後の最大価格上昇率: **${ohlcv.priceEvaluable ? `${formatSignedPercent(ohlcv.maxPriceGainPct)}（${ohlcv.priceTimeframe || "OHLCV"}）` : "評価保留"}**`,
    `上昇率基準価格: ${ohlcv.priceEvaluable ? `${formatTokenPrice(ohlcv.baselinePriceUsd)}（${ohlcv.priceBaselineLabel || "OHLCV初回値"}）` : "評価保留"}`,
    `最大価格: ${ohlcv.priceEvaluable ? formatTokenPrice(ohlcv.maxPriceUsd) : "評価保留"}`,
    `価格最大到達: ${ohlcv.priceEvaluable ? formatDateTime(ohlcv.maxPriceReachedAt) : "評価保留"}`
  ];
}

function formatReviewTokenDetail(item) {
  const symbol = item.symbol || UNKNOWN_SYMBOL;
  const change = item.evaluable ? formatSignedPercent(item.changeRate) : "評価保留";

  return [
    `**${symbol}**`,
    `初回検出時MCAP: ${formatUsd(item.detectedMarketCapUsd)}｜現在MCAP: ${formatUsd(item.currentMarketCapUsd)}`,
    `初回検出からの現在MCAP変化率: **${change}**｜最新Confidence: ${formatConfidence(item.finalConfidence)}`,
    ...formatReviewOhlcvLines(item.ohlcvPerformance),
    `最高Final Score: **${item.highestFinalScore ?? item.finalScore}/100**`,
    `再出現: ${formatTradeCount(item.appearanceCount)}回`,
    `初回: ${formatDateTime(item.firstDetectedAt)}`,
    `最新: ${formatDateTime(item.latestDetectedAt)}`,
    `初回検出から: ${formatElapsed(item.detectedAgeMs)}`,
    `注意点: ${formatList(item.warnings, NO_WARNINGS)}`
  ].join("\n");
}

function formatReviewTokenSummary(item) {
  const symbol = item.symbol || UNKNOWN_SYMBOL;
  const change = item.evaluable ? formatSignedPercent(item.changeRate) : "評価保留";
  const ohlcv = item.ohlcvPerformance || {};
  const priceGain = ohlcv.status === "failed"
    ? "OHLCV取得失敗"
    : ohlcv.priceEvaluable
      ? `${formatSignedPercent(ohlcv.maxPriceGainPct)}（${ohlcv.priceTimeframe || "OHLCV"}）`
      : "評価保留";

  return [
    `**${symbol}**`,
    `現在MCAP変化率: ${change}｜最大価格上昇率: ${priceGain}`,
    `再出現: ${formatTradeCount(item.appearanceCount)}回｜最新Confidence: ${formatConfidence(item.finalConfidence)}`
  ].join("\n");
}

function formatReviewList(items, fallback, seen = new Set()) {
  if (!items || items.length === 0) {
    return fallback;
  }

  return truncate(
    items
      .map((item) => {
        if (seen.has(item.address)) {
          return formatReviewTokenSummary(item);
        }

        seen.add(item.address);
        return formatReviewTokenDetail(item);
      })
      .join("\n\n"),
    1000
  );
}

function formatReasonCounts(counts) {
  const entries = Object.entries(counts || {});
  if (entries.length === 0) {
    return NO_DATA;
  }

  return entries.map(([reason, count]) => `${reason} ${formatTradeCount(count)}件`).join(" / ");
}

function formatRankingExcludedList(items) {
  if (!items || items.length === 0) {
    return "ランキング対象外の候補はありませんにゃ。";
  }

  return truncate(
    items
      .slice(0, 10)
      .map((item) => `${item.symbol || UNKNOWN_SYMBOL}: ${item.rankingExcludedReason || "理由不明"} / CA ${shortenAddress(item.address)}`)
      .join("\n"),
    1000
  );
}

function formatPerformanceStats(stats) {
  const performance = stats.performance || {};
  return [
    `対象トークン: ${formatTradeCount(performance.tokenCount ?? 0)}件`,
    `1.5倍以上: ${formatTradeCount(performance.gain1_5xCount ?? 0)}件`,
    `2倍以上: ${formatTradeCount(performance.gain2xCount ?? 0)}件`,
    `3倍以上: ${formatTradeCount(performance.gain3xCount ?? 0)}件`,
    `5倍以上: ${formatTradeCount(performance.gain5xCount ?? 0)}件`,
    `10倍以上: ${formatTradeCount(performance.gain10xCount ?? 0)}件`,
    `最大上昇率: ${performance.maxGainPct === null || performance.maxGainPct === undefined ? NO_DATA : formatSignedPercent(performance.maxGainPct)}`,
    `中央値: ${performance.medianGainPct === null || performance.medianGainPct === undefined ? NO_DATA : formatSignedPercent(performance.medianGainPct)}`,
    `平均: ${performance.averageGainPct === null || performance.averageGainPct === undefined ? NO_DATA : formatSignedPercent(performance.averageGainPct)}`,
    `計算不可: ${formatTradeCount(stats.rankingExcludedCount ?? 0)}件`
  ].join("\n");
}

function createReviewStatsEmbed(review) {
  const stats = review.stats || {};
  const embed = new EmbedBuilder()
    .setColor(0x95d5b2)
    .setTitle("しえすたん Signal Review | Stats")
    .setDescription("初回検出後の最大価格上昇率で集計した検出成績ですにゃ。投資助言ではないにゃ。")
    .addFields(
      {
        name: "集計条件",
        value: [
          `対象期間: ${stats.reviewWindow || NO_DATA}`,
          `mature条件: ${stats.matureCondition ? `検出から${stats.matureCondition}以上` : "なし"}`,
          `今回レビュー対象: ${formatTradeCount(stats.reviewedSignalCount ?? 0)}件`,
          `集約後トークン数: ${formatTradeCount(stats.tokenCount ?? 0)}件`
        ].join("\n")
      },
      {
        name: "しえすたん検出成績",
        value: formatPerformanceStats(stats)
      }
    )
    .setTimestamp(new Date());

  return embed;
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
      `OHLCV取得成功: ${stats.matureCondition ? `${formatTradeCount(stats.ohlcvSuccessCount ?? 0)} / ${formatTradeCount(stats.ohlcvCheckedCount ?? 0)}件` : "matureレビューで確認"}`,
      `最大上昇率計算可能: ${stats.matureCondition ? `${formatTradeCount(stats.ohlcvReadyCount ?? 0)}件` : "matureレビューで確認"}`,
      `OHLCV蓄積待ち: ${stats.matureCondition ? `${formatTradeCount(stats.ohlcvWaitingCount ?? 0)}件` : "matureレビューで確認"}`,
      `ランキング対象外: ${formatTradeCount(stats.rankingExcludedCount ?? 0)}件`,
      `対象外理由: ${formatReasonCounts(stats.rankingExcludedReasons)}`,
      "",
      "しえすたん検出成績",
      formatPerformanceStats(stats),
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

function createReviewEmbedClean(review) {
  const stats = review.stats || {};
  const confidenceCounts = stats.confidenceCounts || {};
  const seen = new Set();
  const embed = new EmbedBuilder()
    .setColor(0x95d5b2)
    .setTitle("しえすたん Signal Review")
    .setDescription("過去のAlpha Radarシグナルを初回検出基準で答え合わせしますにゃ。投資助言ではないにゃ。")
    .setTimestamp(new Date());

  embed.addFields({
    name: "レビュー概要",
    value: [
      `対象期間: ${stats.reviewWindow || NO_DATA}`,
      `mature条件: ${stats.matureCondition ? `検出から${stats.matureCondition}以上` : "なし"}`,
      `mature条件を満たした件数: ${stats.matureMatchedCount === null || stats.matureMatchedCount === undefined ? "対象外" : `${formatTradeCount(stats.matureMatchedCount)}件`}`,
      `新しすぎて除外: ${stats.matureExcludedTooNewCount === null || stats.matureExcludedTooNewCount === undefined ? "対象外" : `${formatTradeCount(stats.matureExcludedTooNewCount)}件`}`,
      `OHLCV取得成功: ${stats.matureCondition ? `${formatTradeCount(stats.ohlcvSuccessCount ?? 0)} / ${formatTradeCount(stats.ohlcvCheckedCount ?? 0)}件` : "matureレビューで確認"}`,
      `最大上昇率計算可能: ${stats.matureCondition ? `${formatTradeCount(stats.ohlcvReadyCount ?? 0)}件` : "matureレビューで確認"}`,
      `OHLCV蓄積待ち: ${stats.matureCondition ? `${formatTradeCount(stats.ohlcvWaitingCount ?? 0)}件` : "matureレビューで確認"}`,
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
      name: "現在MCAP変化率 上位",
      value: formatReviewList(review.topGainers, "評価できる上昇候補はまだありませんにゃ。", seen)
    },
    {
      name: "初回検出後の最大価格上昇率 上位",
      value: formatReviewList(review.topPriceGainers, "価格ベースで評価できる候補はまだありませんにゃ。", seen)
    },
    {
      name: "現在MCAP変化率 下位",
      value: formatReviewList(review.topLosers, "評価できる下落候補はまだありませんにゃ。", seen)
    },
    {
      name: "再出現した候補",
      value: formatReviewList(review.repeatedTokens, "同じトークンの再出現はまだありませんにゃ。", seen)
    },
    {
      name: "注意点が多い候補",
      value: formatReviewList(review.warningHeavy, "大きな注意点が多い候補はありませんにゃ。", seen)
    },
    {
      name: "ランキング対象外",
      value: formatRankingExcludedList(review.rankingExcluded)
    }
  );

  return embed;
}

function formatReviewBriefWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    return NO_WARNINGS;
  }

  return warnings.slice(0, 2).join(" / ");
}

function formatReviewRankingItem(item, index) {
  const symbol = item.symbol || UNKNOWN_SYMBOL;
  const ohlcv = item.ohlcvPerformance || {};
  const priceGain = ohlcv.status === "failed"
    ? "OHLCV取得失敗"
    : ohlcv.priceEvaluable
      ? `${formatSignedPercent(ohlcv.maxPriceGainPct)}（${ohlcv.priceTimeframe || "OHLCV"}）`
      : "評価保留";

  return [
    `最大価格上昇率: **${priceGain}**`,
    `最高Final: ${item.highestFinalScore ?? item.finalScore}/100｜Confidence: ${formatConfidence(item.finalConfidence)}`,
    `再出現: ${formatTradeCount(item.appearanceCount)}回｜初回検出から: ${formatElapsed(item.detectedAgeMs)}`,
    `チャート: [Dexscreener](https://dexscreener.com/solana/${item.address})`,
    `注意: ${formatReviewBriefWarnings(item.warnings)}`
  ].join("\n");
}

function createReviewSummaryEmbed(review) {
  const stats = review.stats || {};
  const ranked = (review.topPriceGainers || []).slice(0, stats.topLimit || 5);
  const embed = new EmbedBuilder()
    .setColor(0x95d5b2)
    .setTitle("しえすたん Signal Review")
    .setDescription("初回検出後の最大価格上昇率ランキングですにゃ。投資助言ではないにゃ。")
    .setTimestamp(new Date());

  embed.addFields({
    name: "レビュー概要",
    value: [
      `対象期間: ${stats.reviewWindow || NO_DATA}`,
      `今回レビュー対象: ${formatTradeCount(stats.reviewedSignalCount ?? 0)}件`,
      `集約後トークン数: ${formatTradeCount(stats.tokenCount ?? 0)}件`,
      `計算成功: ${formatTradeCount(stats.priceEvaluableCount ?? ranked.length)}件`,
      `表示件数: ${formatTradeCount(stats.displayedCount ?? ranked.length)}件`,
      `対象外件数: ${formatTradeCount(stats.rankingExcludedCount ?? 0)}件`
    ].join("\n")
  });

  if (ranked.length === 0) {
    embed.addFields({
      name: "ランキングなし",
      value: "価格ベースの最大上昇率を計算できる候補はまだありませんにゃ。"
    });
    return [embed];
  }

  const cards = ranked.map((item, index) => {
    const ohlcv = item.ohlcvPerformance || {};
    const maxPriceGain = ohlcv.status === "failed"
      ? "OHLCV取得失敗"
      : ohlcv.priceEvaluable
        ? `${formatSignedPercent(ohlcv.maxPriceGainPct)}（${ohlcv.priceTimeframe || "OHLCV"}）`
        : "評価保留";

    return createTokenCardEmbed({
      address: item.address,
      chain: "solana",
      color: 0x95d5b2,
      confidence: item.finalConfidence,
      holderCount: item.currentHolderCount,
      imageSources: [item],
      liquidityUsd: item.currentLiquidityUsd,
      marketCapUsd: item.currentMarketCapUsd || item.detectedMarketCapUsd,
      maxPriceGain,
      mode: "review",
      name: item.name,
      rank: index + 1,
      score: item.highestFinalScore ?? item.finalScore,
      smartMoneyHolderCount: item.smartMoneyHolderCount,
      symbol: item.symbol,
      warnings: item.warnings
    });
  });

  return [embed, ...cards];
}

function createReviewDetailEmbed(review) {
  const stats = review.stats || {};
  const confidenceCounts = stats.confidenceCounts || {};
  const seen = new Set();
  const embed = new EmbedBuilder()
    .setColor(0x95d5b2)
    .setTitle("しえすたん Signal Review | Detail")
    .setDescription("過去のAlpha Radarシグナルを初回検出基準で詳しく答え合わせしますにゃ。投資助言ではないにゃ。")
    .setTimestamp(new Date());

  embed.addFields({
    name: "レビュー概要",
    value: [
      `対象期間: ${stats.reviewWindow || NO_DATA}`,
      `mature条件: ${stats.matureCondition ? `検出から${stats.matureCondition}以上` : "なし"}`,
      `mature条件を満たした件数: ${stats.matureMatchedCount === null || stats.matureMatchedCount === undefined ? "対象外" : `${formatTradeCount(stats.matureMatchedCount)}件`}`,
      `新しすぎて除外: ${stats.matureExcludedTooNewCount === null || stats.matureExcludedTooNewCount === undefined ? "対象外" : `${formatTradeCount(stats.matureExcludedTooNewCount)}件`}`,
      `OHLCV取得成功: ${stats.matureCondition ? `${formatTradeCount(stats.ohlcvSuccessCount ?? 0)} / ${formatTradeCount(stats.ohlcvCheckedCount ?? 0)}件` : "matureレビューで確認"}`,
      `最大上昇率計算可能: ${stats.matureCondition ? `${formatTradeCount(stats.ohlcvReadyCount ?? 0)}件` : "matureレビューで確認"}`,
      `OHLCV蓄積待ち: ${stats.matureCondition ? `${formatTradeCount(stats.ohlcvWaitingCount ?? 0)}件` : "matureレビューで確認"}`,
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
      name: "現在MCAP変化率 上位",
      value: formatReviewList(review.topGainers, "評価できる上昇候補はまだありませんにゃ。", seen)
    },
    {
      name: "初回検出後の最大価格上昇率 上位",
      value: formatReviewList(review.topPriceGainers, "価格ベースで評価できる候補はまだありませんにゃ。", seen)
    },
    {
      name: "現在MCAP変化率 下位",
      value: formatReviewList(review.topLosers, "評価できる下落候補はまだありませんにゃ。", seen)
    },
    {
      name: "再出現した候補",
      value: formatReviewList(review.repeatedTokens, "同じトークンの再出現はまだありませんにゃ。", seen)
    },
    {
      name: "注意点が多い候補",
      value: formatReviewList(review.warningHeavy, "大きな注意点が多い候補はありませんにゃ。", seen)
    }
  );

  return embed;
}

function createReviewEmbedReadable(review, options = {}) {
  if (options.detail) {
    return createReviewDetailEmbed(review);
  }

  if (options.stats) {
    return createReviewStatsEmbed(review);
  }

  return createReviewSummaryEmbed(review);
}

function createDeepAnalysisEmbed(analysis) {
  const tokenInfo = analysis.tokenInfo || {};
  const netflow = analysis.netflowToken || {};
  const holders = analysis.holders || {};
  const dexTrades = analysis.dexTrades || {};
  const gates = analysis.gates || {};
  const symbol = tokenInfo.symbol || netflow.token_symbol || UNKNOWN_SYMBOL;
  const marketCapUsd = tokenInfo.marketCapUsd || netflow.market_cap_usd;
  const sellDominant = Number(dexTrades.sellValueUsd) > Number(dexTrades.buyValueUsd);

  const embed = new EmbedBuilder()
    .setColor(0xffd166)
    .setTitle(`しえすたん Deep Radar | ${symbol}`.slice(0, 256))
    .setDescription(
      [
        "追加データで深掘りした診断結果ですにゃ。投資助言ではないにゃ。",
        `Chain: \`${analysis.chain || "solana"}\``,
        `CA: \`${analysis.tokenAddress || NO_DATA}\``
      ].join("\n")
    )
    .setTimestamp(new Date());

  const imageUrl = getTokenImageUrl(tokenInfo);
  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }

  addInlineField(embed, "🧪 Deep判定", `${analysis.score ?? NO_DATA}/100｜${formatConfidence(analysis.confidence)}`);
  embed.addFields({
    name: "しえすたん判定",
    value: truncate(formatDeepJudgement(analysis, netflow, dexTrades), 500),
    inline: false
  });
  addInlineField(
    embed,
    "🌊 SM Flow",
    `24h: ${formatSignedUsd(netflow.net_flow_24h_usd)} / 7d: ${formatSignedUsd(netflow.net_flow_7d_usd)} / 30d: ${formatSignedUsd(netflow.net_flow_30d_usd)}`
  );
  addInlineField(
    embed,
    "💸 Deep DEX売買",
    `買い ${formatTradeUsd(dexTrades.buyValueUsd)} / 売り ${formatTradeUsd(dexTrades.sellValueUsd)}${sellDominant ? " / 売り優勢" : ""}`
  );
  embed.addFields({
    name: "🧠 買い手の質",
    value: truncate(formatBuyerQuality(analysis.buyerQuality, gates), 500),
    inline: false
  });
  addInlineField(
    embed,
    "🚦 Deepチェック",
    `資金流入: ${formatGate(gates.g1FlowSignal)} / 買い手の質: ${formatGate(gates.g2BuyerQuality)} / ホルダー状況: ${formatGate(gates.g3HolderConviction)} / リスク確認: ${formatGate(gates.g4RiskCheck)}`
  );
  addInlineField(embed, "💧 Liquidity", formatUsd(tokenInfo.liquidityUsd));
  addInlineField(embed, "💰 MCAP", formatUsd(marketCapUsd));
  addInlineField(embed, "👥 Holders", formatHolders(tokenInfo.holderCount, holders.smartMoneyHolderCount));
  addInlineField(embed, "📈 Chart", `[Dexscreener](https://dexscreener.com/solana/${analysis.tokenAddress})`);

  embed.addFields(
    {
      name: "注意点",
      value: truncate(formatList(analysis.warnings?.slice(0, 2), NO_WARNINGS), 500),
      inline: false
    },
    {
      name: "良い点",
      value: truncate(formatList(analysis.good?.slice(0, 2)), 500),
      inline: false
    }
  );

  return embed;
}

module.exports = {
  createDeepAnalysisDetailEmbed,
  createDeepAnalysisEmbed,
  createDiscoveryComponents,
  createDiscoveryEmbed,
  createDiscoveryEmbeds,
  createEarlySignalEmbed,
  createEliteEmbeds,
  createRadarEmbed,
  createRadarEmbeds,
  createReviewEmbed: createReviewEmbedReadable,
  createTokenCardComponents,
  createTokenCheckComponents,
  createTokenCheckEmbed,
  createWatchlistComponents,
  createWatchlistEmbeds
};
