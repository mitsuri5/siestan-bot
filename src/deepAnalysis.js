const {
  getSolanaSmartMoneyNetflow,
  getTokenDexTrades,
  getTokenFlowIntelligence,
  getTokenHolders,
  getTokenInfo
} = require("./nansen");

const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidSolanaAddress(address) {
  return SOLANA_ADDRESS_PATTERN.test(address);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function findNetflowToken(rows, tokenAddress) {
  const normalizedAddress = tokenAddress.toLowerCase();
  return rows.find((row) => {
    const rowAddress = String(row.token_address || row.address || "").toLowerCase();
    return rowAddress === normalizedAddress;
  });
}

async function readOptional(label, loader) {
  try {
    return {
      ok: true,
      data: await loader()
    };
  } catch (error) {
    console.error(`Failed to load ${label}:`, error);
    return {
      ok: false,
      data: [],
      error: label
    };
  }
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
    holderCount: toNumber(metrics.total_holders),
    volumeUsd: toNumber(metrics.volume_total_usd),
    uniqueBuyers: toNumber(metrics.unique_buyers),
    uniqueSellers: toNumber(metrics.unique_sellers)
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
    rowCount: rows.length,
    labels: collectValues(rows, ["label", "entity_label", "wallet_label"]).slice(0, 3),
    netFlowUsd: totals.netFlowUsd,
    walletCount: totals.walletCount
  };
}

function summarizeHolders(rows) {
  const totalValueUsd = rows.reduce((sum, row) => sum + toNumber(row.value_usd), 0);
  const totalOwnership = rows.reduce((sum, row) => sum + toNumber(row.ownership_percentage), 0);

  return {
    rowCount: rows.length,
    labels: collectValues(rows, ["address_label", "label", "entity_label", "wallet_label"]).slice(0, 3),
    smartMoneyHolderCount: countSmartMoneyHolders(rows),
    totalValueUsd,
    totalOwnership
  };
}

function summarizeDexTrades(rows) {
  const summary = rows.reduce(
    (acc, row) => {
      const action = String(row.action || "").toUpperCase();
      const valueUsd = toNumber(row.estimated_value_usd);

      if (action === "BUY") {
        acc.buyCount += 1;
        acc.buyValueUsd += valueUsd;
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
    rowCount: rows.length,
    wallets: collectValues(rows, ["trader_address_label", "wallet", "address", "trader_address"]).slice(0, 3),
    ...summary
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

function getHolderAddress(row) {
  return row.address || row.wallet_address || row.holder_address || row.owner_address || row.wallet;
}

function isSmartMoneyHolder(row) {
  const labelText = [
    row.address_label,
    row.label,
    row.entity_label,
    row.wallet_label,
    row.smart_money_label,
    row.nansen_label,
    ...(Array.isArray(row.labels) ? row.labels : []),
    ...(Array.isArray(row.wallet_labels) ? row.wallet_labels : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return ["smart money", "smart trader", "fund", "whale"].some((label) => labelText.includes(label));
}

function countSmartMoneyHolders(rows) {
  const wallets = new Set();

  for (const row of rows) {
    if (!isSmartMoneyHolder(row)) {
      continue;
    }

    const address = getHolderAddress(row);
    if (address) {
      wallets.add(String(address).toLowerCase());
    }
  }

  return wallets.size;
}

function getConfidence(score, shouldDowngrade) {
  const levels = ["risky", "low", "medium", "high"];
  let index = 0;

  if (score >= 80) {
    index = 3;
  } else if (score >= 60) {
    index = 2;
  } else if (score >= 40) {
    index = 1;
  }

  if (shouldDowngrade) {
    index = Math.max(index - 1, 0);
  }

  return levels[index];
}

function scoreDeepAnalysis({ netflowToken, tokenInfo, flow, holders, dexTrades }) {
  const good = [];
  const warnings = [];
  const gates = {
    g1FlowSignal: false,
    g2BuyerQuality: false,
    g3HolderConviction: false,
    g4RiskCheck: false
  };
  let score = 0;

  const netFlow24h = toNumber(netflowToken?.net_flow_24h_usd);
  const netFlow7d = toNumber(netflowToken?.net_flow_7d_usd);
  const netFlow30d = toNumber(netflowToken?.net_flow_30d_usd);
  const traderCount = toNumber(netflowToken?.trader_count);
  const marketCap = toNumber(netflowToken?.market_cap_usd) || tokenInfo.marketCapUsd;
  const tokenAgeDays = toNumber(netflowToken?.token_age_days);
  const hasNetflowTopHit = Boolean(netflowToken);
  const buyValue = toNumber(dexTrades.buyValueUsd);
  const sellValue = toNumber(dexTrades.sellValueUsd);
  const sellBuyRatio = buyValue > 0 ? sellValue / buyValue : sellValue > 0 ? Infinity : 0;
  const isDexSellDominant = sellBuyRatio >= 2;
  const isDexStrongSellDominant = sellBuyRatio >= 5;

  if (netFlow24h > 0 && netFlow7d > 0) {
    gates.g1FlowSignal = true;
    score += 30;
    good.push("24時間と7日間のSmart Moneyフローがどちらもプラスですにゃ");
  } else if (netFlow24h > 0) {
    score += 15;
    good.push("24時間のSmart Moneyフローはプラスですにゃ");
    warnings.push("7日間のフローでは、まだ流入継続を確認できていないにゃ");
  } else if (flow.netFlowUsd > 0) {
    gates.g1FlowSignal = true;
    score += 20;
    good.push("Flow Intelligenceではプラスの流入が確認できますにゃ");
  } else {
    warnings.push("Smart Moneyフローが明確なプラスではありませんにゃ");
  }

  if (traderCount >= 5 || flow.walletCount >= 5 || dexTrades.rowCount >= 5) {
    gates.g2BuyerQuality = true;
    score += 25;
    good.push("買い手や取引データに一定の広がりがありますにゃ");
  } else {
    warnings.push("買い手の質を判断するデータがまだ薄いにゃ");
  }

  if (tokenInfo.holderCount >= 100 || holders.rowCount >= 10) {
    gates.g3HolderConviction = true;
    score += 25;
    good.push("ホルダー情報が取れていて、保有状況を確認しやすいにゃ");
  } else if (holders.rowCount > 0) {
    score += 10;
    warnings.push("ホルダーデータはありますが、件数が少なめですにゃ");
  } else {
    warnings.push("ホルダーデータが取得なし、または空でしたにゃ");
  }

  if (marketCap >= 1000000 && marketCap <= 500000000 && tokenInfo.liquidityUsd >= 50000 && netFlow30d > -100000) {
    gates.g4RiskCheck = true;
    score += 20;
    good.push("時価総額、流動性、30日フローの基本リスクは許容範囲ですにゃ");
  } else {
    if (marketCap > 0 && marketCap < 1000000) {
      warnings.push("時価総額が小さく、値動きや流動性リスクが大きいかもしれないにゃ");
    }
    if (marketCap > 500000000) {
      warnings.push("時価総額が大きめで、初期シグナルとしては遅い可能性がありますにゃ");
    }
    if (tokenInfo.liquidityUsd > 0 && tokenInfo.liquidityUsd < 50000) {
      warnings.push("流動性が薄めなので、大きな売買で価格が動きやすいにゃ");
    }
    if (tokenAgeDays > 0 && tokenAgeDays < 14) {
      warnings.push("トークンがかなり若く、データが安定していない可能性がありますにゃ");
    }
    if (netFlow30d < -100000) {
      warnings.push("30日フローが大きくマイナスで、中期の売り圧に注意ですにゃ");
    }
  }

  if (!hasNetflowTopHit) {
    score = Math.min(score, 75);
  }

  if (isDexStrongSellDominant) {
    score -= 25;
    warnings.push("直近DEX取引では売り金額が買い金額を大きく上回っていますにゃ");
  } else if (isDexSellDominant) {
    score -= 12;
    warnings.push("直近DEX取引では売り金額が買い金額を上回っていますにゃ");
  }

  const finalScore = Math.max(Math.min(Math.round(score), 100), 0);
  const confidence = getConfidence(finalScore, !hasNetflowTopHit || isDexStrongSellDominant);

  return {
    score: finalScore,
    confidence,
    gates,
    good,
    warnings,
    hasNetflowTopHit,
    dexSellBuyRatio: sellBuyRatio
  };
}

async function analyzeSolanaTokenDeep(tokenAddress) {
  const chain = "solana";
  const [netflowResult, tokenInfoResult, flowResult, holdersResult, dexTradesResult] = await Promise.all([
    readOptional("Smart Money netflow", () => getSolanaSmartMoneyNetflow()),
    readOptional("Token Info", () => getTokenInfo({ chain, token: tokenAddress })),
    readOptional("Flow Intelligence", () => getTokenFlowIntelligence({ chain, token: tokenAddress })),
    readOptional("Token Holders", () => getTokenHolders({ chain, token: tokenAddress })),
    readOptional("DEX Trades", () => getTokenDexTrades({ chain, token: tokenAddress }))
  ]);

  const netflowToken = findNetflowToken(netflowResult.data, tokenAddress);
  const tokenInfo = summarizeTokenInfo(tokenInfoResult.data || {});
  const flow = summarizeFlowIntelligence(flowResult.data);
  const holders = summarizeHolders(holdersResult.data);
  const dexTrades = summarizeDexTrades(dexTradesResult.data);
  const scoring = scoreDeepAnalysis({
    netflowToken,
    tokenInfo,
    flow,
    holders,
    dexTrades
  });

  if (!netflowToken) {
    scoring.warnings.push("Smart Money netflow上位には未検出ですにゃ");
  }

  for (const result of [netflowResult, tokenInfoResult, flowResult, holdersResult, dexTradesResult]) {
    if (!result.ok) {
      scoring.warnings.push(`${result.error} のデータ取得に失敗しましたにゃ`);
    }
  }

  return {
    tokenAddress,
    chain,
    tokenInfo,
    netflowToken,
    flow,
    holders,
    dexTrades,
    ...scoring
  };
}

module.exports = {
  analyzeSolanaTokenDeep,
  isValidSolanaAddress
};
