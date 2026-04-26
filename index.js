require("dotenv").config();

const { execFile } = require("child_process");
const { promisify } = require("util");
const { Client, EmbedBuilder, Events, GatewayIntentBits } = require("discord.js");

const execFileAsync = promisify(execFile);
const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("DISCORD_BOT_TOKEN is not set. Please create a .env file.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function getNansenVersionCommand() {
  if (process.platform === "win32") {
    return {
      file: "cmd.exe",
      args: ["/d", "/s", "/c", "nansen --version"]
    };
  }

  return {
    file: "nansen",
    args: ["--version"]
  };
}

async function getNansenVersion() {
  const { file, args } = getNansenVersionCommand();
  const { stdout } = await execFileAsync(file, args, {
    windowsHide: true
  });

  return stdout.trim();
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) {
    return;
  }

  if (message.content === "!ping") {
    await message.reply("しえすたん起動中ですにゃ。Pong!");
    return;
  }

  if (message.content === "!help") {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x8fd3ff)
      .setTitle("しえすたん コマンド一覧")
      .setDescription("使えるコマンドですにゃ。")
      .addFields(
        { name: "!ping", value: "Bot が起動中か確認します。" },
        { name: "!help", value: "使えるコマンド一覧を表示します。" },
        { name: "!about", value: "しえすたんについて説明します。" },
        { name: "!sleep", value: "お昼寝したいときのひとことを返します。" },
        { name: "!nansen-test", value: "Nansen CLI との接続を確認します。" }
      );

    await message.reply({ embeds: [helpEmbed] });
    return;
  }

  if (message.content === "!about") {
    const aboutEmbed = new EmbedBuilder()
      .setColor(0xffc1da)
      .setTitle("しえすたんについて")
      .setDescription(
        "しえすたんは、Nansenのオンチェーンデータを使って、アルトやSmart Moneyの動きを見守るBotですにゃ。"
      );

    await message.reply({ embeds: [aboutEmbed] });
    return;
  }

  if (message.content === "!sleep") {
    await message.reply(
      "むにゃ... 監視はしえすたんに任せて、お昼寝してていいですにゃ。"
    );
    return;
  }

  if (message.content === "!nansen-test") {
    try {
      const version = await getNansenVersion();
      const nansenEmbed = new EmbedBuilder()
        .setColor(0x7bd88f)
        .setTitle("Nansen CLI 接続確認")
        .setDescription("しえすたん、Nansen CLIに接続できていますにゃ。")
        .addFields({ name: "Version", value: version || "unknown" });

      await message.reply({ embeds: [nansenEmbed] });
    } catch (error) {
      console.error("Failed to check Nansen CLI connection:", error);
      await message.reply("Nansen CLIの接続確認に失敗しましたにゃ。");
    }
  }
});

client.login(token);
