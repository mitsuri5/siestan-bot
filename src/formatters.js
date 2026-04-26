const { EmbedBuilder } = require("discord.js");

function formatUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "n/a";
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
  if (!Number.isFinite(number)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(number);
}

function formatList(items, fallback) {
  if (!items || items.length === 0) {
    return fallback;
  }

  return items.slice(0, 3).join(", ");
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
      value: "今回のスキャンでは表示できる候補がありませんでした。"
    });
    return embed;
  }

  for (const signal of topSignals) {
    const symbol = signal.token_symbol || "UNKNOWN";
    const sectors = formatList(signal.token_sectors, "n/a");
    const reasons = formatList(signal.reasons, "n/a");
    const warnings = formatList(signal.warnings, "none");

    embed.addFields({
      name: `${symbol} | Score ${signal.score}/100`,
      value: [
        `Market Cap: ${formatUsd(signal.market_cap_usd)}`,
        `24h Netflow: ${formatUsd(signal.net_flow_24h_usd)}`,
        `7d Netflow: ${formatUsd(signal.net_flow_7d_usd)}`,
        `Traders: ${formatNumber(signal.trader_count)}`,
        `Age: ${formatNumber(signal.token_age_days)} days`,
        `Sectors: ${sectors}`,
        `Reasons: ${reasons}`,
        `Warnings: ${warnings}`
      ].join("\n")
    });
  }

  return embed;
}

module.exports = {
  createEarlySignalEmbed
};
