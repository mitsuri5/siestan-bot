function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function scoreToken(token) {
  const netFlow24h = toNumber(token.net_flow_24h_usd);
  const netFlow7d = toNumber(token.net_flow_7d_usd);
  const netFlow30d = toNumber(token.net_flow_30d_usd);
  const marketCap = toNumber(token.market_cap_usd);
  const traderCount = toNumber(token.trader_count);
  const tokenAgeDays = toNumber(token.token_age_days);

  const reasons = [];
  const warnings = [];
  let score = 0;

  if (netFlow24h > 0) {
    score += clamp((netFlow24h / 100000) * 25, 1, 25);
    reasons.push("24h netflow is positive");
  }

  if (netFlow7d > 0) {
    score += clamp((netFlow7d / 250000) * 20, 1, 20);
    reasons.push("7d netflow is positive");
  }

  if (netFlow24h > 0 && marketCap > 0) {
    const flowToMarketCap = netFlow24h / marketCap;
    score += clamp((flowToMarketCap / 0.02) * 20, 0, 20);
    if (flowToMarketCap >= 0.005) {
      reasons.push("24h flow is meaningful vs market cap");
    }
  }

  if (traderCount >= 5) {
    score += clamp((traderCount / 30) * 10, 2, 10);
    reasons.push("Smart Money trader count is broad enough");
  }

  if (marketCap >= 1000000 && marketCap <= 500000000) {
    score += 15;
    reasons.push("market cap is in the MVP watch range");
  } else if (marketCap > 0) {
    score += 5;
  }

  if (tokenAgeDays >= 14) {
    score += clamp((tokenAgeDays / 60) * 10, 4, 10);
    reasons.push("token is not extremely new");
  }

  if (marketCap > 0 && marketCap < 1000000) {
    warnings.push("market cap is very small");
  }

  if (traderCount < 5) {
    warnings.push("trader count is low");
  }

  if (tokenAgeDays > 0 && tokenAgeDays < 14) {
    warnings.push("token is very young");
  }

  if (netFlow30d < -100000) {
    warnings.push("30d netflow is deeply negative");
  }

  if (netFlow24h > 0 && netFlow7d <= 0) {
    warnings.push("24h flow is strong but 7d flow is weak");
  }

  return {
    ...token,
    score: Math.round(clamp(score, 0, 100)),
    reasons,
    warnings
  };
}

function scoreTokens(tokens) {
  return tokens
    .map(scoreToken)
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  scoreTokens
};
