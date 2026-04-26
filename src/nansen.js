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
    maxBuffer: 1024 * 1024 * 5,
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

module.exports = {
  getNansenVersion,
  getSolanaSmartMoneyNetflow,
  getTokenFlowIntelligence,
  getTokenHolders,
  getTokenDexTrades,
  getTokenInfo
};
