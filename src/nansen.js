const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function getNansenCommand(commandText) {
  if (process.platform === "win32") {
    return {
      file: "cmd.exe",
      args: ["/d", "/s", "/c", commandText]
    };
  }

  const parts = commandText.split(" ");
  return {
    file: parts[0],
    args: parts.slice(1)
  };
}

async function runNansenCommand(commandText) {
  const { file, args } = getNansenCommand(commandText);
  const { stdout } = await execFileAsync(file, args, {
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });

  return stdout.trim();
}

async function getNansenVersion() {
  return runNansenCommand("nansen --version");
}

async function getSolanaSmartMoneyNetflow() {
  const output = await runNansenCommand(
    "nansen research smart-money netflow --chain solana --limit 25"
  );
  const parsed = JSON.parse(output);

  if (!parsed.success) {
    throw new Error("Nansen CLI returned an unsuccessful response.");
  }

  return parsed.data?.data ?? [];
}

module.exports = {
  getNansenVersion,
  getSolanaSmartMoneyNetflow
};
