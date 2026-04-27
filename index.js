require("dotenv").config();

const { Client, EmbedBuilder, Events, GatewayIntentBits } = require("discord.js");
const { analyzeSolanaTokenDeep, isValidSolanaAddress } = require("./src/deepAnalysis");
const { discoverSolanaCandidates } = require("./src/discovery");
const {
  createDeepAnalysisEmbed,
  createDiscoveryComponents,
  createDiscoveryEmbed,
  createEarlySignalEmbed,
  createRadarEmbed,
  createReviewEmbed
} = require("./src/formatters");
const { getNansenVersion, getSolanaSmartMoneyNetflow } = require("./src/nansen");
const { runSolanaRadar } = require("./src/radar");
const { reviewSolanaRadarSignals } = require("./src/review");
const { scoreTokens } = require("./src/scoring");
const { saveDiscoveryResult, saveRadarResult, saveScanResult } = require("./src/storage");

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

function parseReviewOptions(parts) {
  const options = {
    option: "default",
    mature: null
  };
  const args = parts.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--all") {
      options.option = "all";
      continue;
    }

    if (arg === "--24h") {
      options.option = "24h";
      continue;
    }

    if (arg === "--7d") {
      options.option = "7d";
      continue;
    }

    if (arg === "--mature") {
      const value = args[index + 1];
      if (!["1h", "4h", "24h", "7d"].includes(value)) {
        return null;
      }
      options.mature = value;
      index += 1;
      continue;
    }

    return null;
  }

  return options;
}

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
        { name: "!discover solana", value: "Smart Money DEX Tradesから候補を発見します。`--wide` 付きならREST APIで200件取得します。" },
        { name: "!radar solana", value: "G0 DiscoveryからDeep分析まで通した統合レーダーを実行します。`--wide` 付きならREST APIで200件取得します。" },
        { name: "!review solana", value: "過去のAlpha Radarシグナルを答え合わせします。`--all` / `--24h` / `--7d` / `--mature 4h` も使えます。" },
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

  if (parts[0] === "!discover" && parts[1] === "solana" && (parts.length === 2 || parts[2] === "--wide")) {
    const useWide = parts[2] === "--wide";
    const source = useWide ? "rest" : "cli";
    const reply = await message.reply(
      useWide
        ? "SolanaのG0 Discovery wideをREST APIで実行中ですにゃ..."
        : "SolanaのG0 Discoveryを実行中ですにゃ..."
    );

    try {
      const discoveries = await discoverSolanaCandidates({ source });

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

  if (parts[0] === "!radar" && parts[1] === "solana" && (parts.length === 2 || parts[2] === "--wide")) {
    const useWide = parts[2] === "--wide";
    const source = useWide ? "rest" : "cli";
    const reply = await message.reply(
      useWide
        ? "SolanaのAlpha Radar wideをREST APIで実行中ですにゃ..."
        : "SolanaのAlpha Radarを実行中ですにゃ..."
    );

    try {
      const radar = await runSolanaRadar({ source });

      await saveRadarResult({
        chain: "solana",
        results: radar.results,
        stats: radar.stats
      });

      await reply.edit({
        content: "",
        embeds: [createRadarEmbed(radar.results, radar.stats)]
      });
    } catch (error) {
      console.error("Failed to run Solana radar:", error);
      await reply.edit("SolanaのAlpha Radarに失敗しましたにゃ。");
    }
    return;
  }

  if (parts[0] === "!review" && parts[1] === "solana") {
    const reviewOptions = parseReviewOptions(parts);
    if (!reviewOptions) {
      await message.reply("使い方: `!review solana --mature 4h`");
      return;
    }

    const reply = await message.reply("過去のAlpha Radarシグナルを答え合わせ中ですにゃ...");

    try {
      const review = await reviewSolanaRadarSignals(reviewOptions);

      await reply.edit({
        content: "",
        embeds: [createReviewEmbed(review)]
      });
    } catch (error) {
      console.error("Failed to review Solana radar signals:", error);
      await reply.edit("Signal Reviewに失敗しましたにゃ。");
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
