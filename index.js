require("dotenv").config();

const { Client, EmbedBuilder, Events, GatewayIntentBits } = require("discord.js");
const { analyzeSolanaTokenDeep, isValidSolanaAddress } = require("./src/deepAnalysis");
const { discoverSolanaCandidates } = require("./src/discovery");
const {
  createDeepAnalysisEmbed,
  createDiscoveryComponents,
  createDiscoveryEmbed,
  createEarlySignalEmbed
} = require("./src/formatters");
const { getNansenVersion, getSolanaSmartMoneyNetflow } = require("./src/nansen");
const { scoreTokens } = require("./src/scoring");
const { saveDiscoveryResult, saveScanResult } = require("./src/storage");

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

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) {
    return;
  }

  const [action, chain, tokenAddress] = interaction.customId.split(":");

  if (action !== "deep" || chain !== "solana" || !isValidSolanaAddress(tokenAddress)) {
    await interaction.reply({
      content: "このボタンの内容を確認できませんでしたにゃ。",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  try {
    const analysis = await analyzeSolanaTokenDeep(tokenAddress);
    await interaction.editReply({
      embeds: [createDeepAnalysisEmbed(analysis)]
    });
  } catch (error) {
    console.error("Failed to run deep Solana token analysis from button:", error);
    await interaction.editReply("深掘り分析に失敗しましたにゃ。");
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) {
    return;
  }

  const parts = message.content.trim().split(/\s+/);

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
        { name: "!nansen-test", value: "Nansen CLI との接続を確認します。" },
        { name: "!discover solana", value: "Smart Money DEX Tradesから候補を発見します。" },
        { name: "!scan solana", value: "SolanaのSmart Money流入候補を手動スキャンします。" },
        { name: "!deep solana TOKEN_ADDRESS", value: "候補トークンを追加データで深掘りします。" }
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
    return;
  }

  if (message.content === "!discover solana") {
    const reply = await message.reply("SolanaのG0 Discoveryを実行中ですにゃ...");

    try {
      const discoveries = await discoverSolanaCandidates();

      await saveDiscoveryResult({
        chain: "solana",
        discoveries
      });

      await reply.edit({
        components: createDiscoveryComponents(discoveries),
        content: "",
        embeds: [createDiscoveryEmbed(discoveries)]
      });
    } catch (error) {
      console.error("Failed to run Solana discovery:", error);
      await reply.edit("SolanaのG0 Discoveryに失敗しましたにゃ。");
    }
    return;
  }

  if (message.content === "!scan solana") {
    const reply = await message.reply("SolanaのSmart Money流入候補をスキャン中ですにゃ...");

    try {
      const tokens = await getSolanaSmartMoneyNetflow();
      const signals = scoreTokens(tokens);

      await saveScanResult({
        chain: "solana",
        signals
      });

      await reply.edit({
        content: "",
        embeds: [createEarlySignalEmbed(signals)]
      });
    } catch (error) {
      console.error("Failed to scan Solana Smart Money netflow:", error);
      await reply.edit("SolanaのSmart Moneyスキャンに失敗しましたにゃ。");
    }
    return;
  }

  if (parts[0] === "!deep") {
    if (parts[1] !== "solana" || !parts[2] || parts.length !== 3) {
      await message.reply("使い方: `!deep solana TOKEN_ADDRESS`");
      return;
    }

    const tokenAddress = parts[2];
    if (!isValidSolanaAddress(tokenAddress)) {
      await message.reply("Solanaのトークンアドレス形式を確認してくださいにゃ。");
      return;
    }

    const reply = await message.reply("候補トークンを深掘り分析中ですにゃ...");

    try {
      const analysis = await analyzeSolanaTokenDeep(tokenAddress);
      await reply.edit({
        content: "",
        embeds: [createDeepAnalysisEmbed(analysis)]
      });
    } catch (error) {
      console.error("Failed to run deep Solana token analysis:", error);
      await reply.edit("深掘り分析に失敗しましたにゃ。");
    }
  }
});

client.login(token);
