const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function getNansenCommand(args) {
  if (process.platform === "win32") {
    return {
      file: "cmd.exe",
      args: ["/d", "/s", "/c", "nansen", ...args]
    };
  }

  return {
    file: "nansen",
    args
  };
}

function parseJsonOutput(output) {
  return JSON.parse(output);
}

async function runNansen(args) {
  const { file, args: commandArgs } = getNansenCommand(args);
  const { stdout } = await execFileAsync(file, commandArgs, {
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true
  });

  return stdout.trim();
}

async function runNansenJson(args) {
  const output = await runNansen(args);
  const parsed = parseJsonOutput(output);

  if (parsed.success === false) {
    throw new Error("Nansen CLI returned an unsuccessful response.");
  }

  return parsed;
}

function extractRows(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.data?.data)) {
    return response.data.data;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  return [];
}

function attachMeta(rows, meta) {
  Object.defineProperty(rows, "_meta", {
    enumerable: false,
    value: meta
  });

  return rows;
}

async function getNansenVersion() {
  return runNansen(["--version"]);
}

async function getSolanaSmartMoneyNetflow() {
  const parsed = await runNansenJson([
    "research",
    "smart-money",
    "netflow",
    "--chain",
    "solana",
    "--limit",
    "25"
  ]);

  return extractRows(parsed);
}

async function getSolanaSmartMoneyDexTrades() {
  const parsed = await runNansenJson([
    "research",
    "smart-money",
    "dex-trades",
    "--chain",
    "solana"
  ]);

  const rows = extractRows(parsed);
  return attachMeta(rows, {
    source: "cli",
    pagination: parsed.data?.pagination,
    rowCount: rows.length
  });
}

async function fetchSolanaSmartMoneyDexTradesRestPage({ page, perPage }) {
  const apiKey = process.env.NANSEN_API_KEY;

  if (!apiKey) {
    throw new Error("NANSEN_API_KEY is not set.");
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this Node.js runtime.");
  }

  const response = await fetch("https://api.nansen.ai/api/v1/smart-money/dex-trades", {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
      "X-Client-Type": "siestan-bot"
    },
    body: JSON.stringify({
      chains: ["solana"],
      filters: {},
      order_by: null,
      pagination: {
        page,
        per_page: perPage
      }
    })
  });

  if (!response.ok) {
    let message = `Nansen REST API request failed with status ${response.status}.`;
    try {
      const errorBody = await response.json();
      const detail = errorBody?.message || errorBody?.detail || errorBody?.error;
      if (detail) {
        message = `${message} ${detail}`;
      }
    } catch (_error) {
      // Keep the sanitized status-only error if the response is not JSON.
    }

    throw new Error(message);
  }

  const parsed = await response.json();
  const rows = extractRows(parsed);
  return attachMeta(rows, {
    source: "rest",
    pagination: parsed.pagination || parsed.data?.pagination,
    rowCount: rows.length
  });
}

async function getSolanaSmartMoneyDexTradesRest({ limit = 200, perPage = 100 } = {}) {
  const rows = [];
  const pageErrors = [];
  let lastPagination = null;
  const requestedLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const pageSize = Math.min(Math.max(Number(perPage) || 100, 1), 100);
  const maxPages = Math.ceil(requestedLimit / pageSize);

  for (let page = 1; page <= maxPages; page += 1) {
    try {
      const pageRows = await fetchSolanaSmartMoneyDexTradesRestPage({ page, perPage: pageSize });
      const pagination = pageRows._meta?.pagination || {};
      lastPagination = pagination;
      rows.push(...pageRows);

      if (pagination.is_last_page || rows.length >= requestedLimit) {
        break;
      }
    } catch (error) {
      pageErrors.push({ page, message: error.message });
      break;
    }
  }

  const limitedRows = rows.slice(0, requestedLimit);
  return attachMeta(limitedRows, {
    source: "rest",
    pagination: lastPagination,
    requestedLimit,
    actualRowCount: limitedRows.length,
    pageErrors,
    partialFailure: pageErrors.length > 0,
    rowCount: limitedRows.length
  });
}

async function getTokenFlowIntelligence({ chain, token }) {
  const parsed = await runNansenJson([
    "research",
    "token",
    "flow-intelligence",
    "--chain",
    chain,
    "--token",
    token,
    "--timeframe",
    "1d"
  ]);

  return extractRows(parsed);
}

async function getTokenInfo({ chain, token }) {
  const parsed = await runNansenJson([
    "research",
    "token",
    "info",
    "--chain",
    chain,
    "--token",
    token,
    "--timeframe",
    "1d"
  ]);

  return parsed.data?.data ?? parsed.data ?? {};
}

async function getTokenHolders({ chain, token }) {
  const parsed = await runNansenJson([
    "research",
    "token",
    "holders",
    "--chain",
    chain,
    "--token",
    token
  ]);

  return extractRows(parsed);
}

async function getTokenDexTrades({ chain, token }) {
  const parsed = await runNansenJson([
    "research",
    "token",
    "dex-trades",
    "--chain",
    chain,
    "--token",
    token,
    "--days",
    "1"
  ]);

  return extractRows(parsed);
}

async function getSolanaTokenOhlcv({ tokenAddress, timeframe = "1h" }) {
  const parsed = await runNansenJson([
    "research",
    "token",
    "ohlcv",
    "--chain",
    "solana",
    "--token",
    tokenAddress,
    "--timeframe",
    timeframe
  ]);

  return extractRows(parsed);
}

module.exports = {
  getNansenVersion,
  getSolanaTokenOhlcv,
  getSolanaSmartMoneyDexTrades,
  fetchSolanaSmartMoneyDexTradesRestPage,
  getSolanaSmartMoneyDexTradesRest,
  getSolanaSmartMoneyNetflow,
  getTokenFlowIntelligence,
  getTokenHolders,
  getTokenDexTrades,
  getTokenInfo
};
