require("dotenv").config();

const { Client, EmbedBuilder, Events, GatewayIntentBits, SlashCommandBuilder } = require("discord.js");
const { analyzeSolanaTokenDeep, isValidSolanaAddress } = require("./src/deepAnalysis");
const { discoverSolanaCandidates } = require("./src/discovery");
const {
  createDeepAnalysisDetailEmbed,
  createDeepAnalysisEmbed,
  createDiscoveryEmbeds,
  createEarlySignalEmbed,
  createEliteEmbeds,
  createRadarEmbeds,
  createReviewEmbed,
  createTokenCardComponents,
  createTokenCheckComponents,
  createTokenCheckEmbed,
  createWatchlistComponents,
  createWatchlistEmbeds
} = require("./src/formatters");
const { getNansenVersion, getSolanaSmartMoneyNetflow } = require("./src/nansen");
const { runSolanaEliteRadar } = require("./src/elite");
const { runSolanaRadar } = require("./src/radar");
const { reviewSolanaRadarSignals } = require("./src/review");
const { scoreTokens } = require("./src/scoring");
const {
  addWatchlistItem,
  getUserWatchlist,
  getWatchCount,
  removeWatchlistItem,
  saveDiscoveryResult,
  saveRadarResult,
  saveScanResult
} = require("./src/storage");
const { analyzeWatchToken, buildWatchlistView, extractSolanaTokenAddress } = require("./src/watchRadar");

const token = process.env.DISCORD_BOT_TOKEN;
let eliteRadarRunning = false;

const slashCommands = [
  new SlashCommandBuilder()
    .setName("watchlist")
    .setDescription("Show your Watchlist privately.")
    .toJSON()
];

if (!token) {
  console.error("DISCORD_BOT_TOKEN is not set. Please create a .env file.");
  process.exit(1);
}

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

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
    mature: null,
    detail: false,
    stats: false,
    top: 5
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

    if (arg === "--detail") {
      options.detail = true;
      continue;
    }

    if (arg === "--stats") {
      options.stats = true;
      continue;
    }

    if (arg === "--top") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 20) {
        return null;
      }
      options.top = value;
      index += 1;
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

function parseWideOptions(parts) {
  const options = {
    limit: 200,
    targetTokens: null,
    wide: false
  };
  const args = parts.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--wide") {
      options.wide = true;
      continue;
    }

    if (arg === "--limit" && options.wide) {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 500) {
        return null;
      }
      options.limit = value;
      index += 1;
      continue;
    }

    if (arg === "--target-tokens" && options.wide) {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 700) {
        return null;
      }
      options.targetTokens = value;
      index += 1;
      continue;
    }

    return null;
  }

  return options;
}

function parseEliteOptions(parts) {
  const options = {
    topWallets: 10
  };
  const args = parts.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--top-wallets") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 50) {
        return null;
      }
      options.topWallets = value;
      index += 1;
      continue;
    }

    return null;
  }

  return options;
}

async function sendOverviewAndTokenCards(message, reply, embeds, addresses) {
  const [overview, ...cards] = embeds;

  await reply.edit({
    components: [],
    content: "",
    embeds: overview ? [overview] : []
  });

  for (let index = 0; index < cards.length; index += 1) {
    const address = addresses[index];
    await message.channel.send({
      components: createTokenCardComponents(address),
      embeds: [cards[index]]
    });
  }
}

async function sendUserWatchlist(user, source) {
  const items = await getUserWatchlist(user.id);
  const viewItems = await buildWatchlistView(items);
  const payload = {
    components: createWatchlistComponents(viewItems),
    embeds: createWatchlistEmbeds(viewItems, user)
  };

  if (source?.isButton?.()) {
    await source.reply({
      ...payload,
      ephemeral: source.inGuild()
    });
    return;
  }

  if (source?.isChatInputCommand?.()) {
    if (source.deferred || source.replied) {
      await source.editReply(payload);
    } else {
      await source.reply({
        ...payload,
        ephemeral: true
      });
    }
    return;
  }

  await user.send(payload);
}

async function registerSlashCommands(readyClient) {
  const commands = await readyClient.application.commands.fetch();
  const watchlistCommand = commands.find((command) => command.name === "watchlist");

  if (watchlistCommand) {
    await watchlistCommand.edit(slashCommands[0]);
    return;
  }

  await readyClient.application.commands.create(slashCommands[0]);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    await registerSlashCommands(readyClient);
    console.log("Registered /watchlist command.");
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName !== "watchlist") {
      return;
    }

    try {
      await interaction.deferReply({ ephemeral: true });
      await sendUserWatchlist(interaction.user, interaction);
    } catch (error) {
      console.error("Failed to handle /watchlist command:", error);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("Watchlistの表示に失敗しました。少し待ってからもう一度試してください。");
        } else {
          await interaction.reply({
            content: "Watchlistの表示に失敗しました。少し待ってからもう一度試してください。",
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error("Failed to send /watchlist error reply:", replyError);
      }
    }
    return;
  }

  if (!interaction.isButton()) {
    return;
  }

  try {
    const [action, chain, tokenAddress] = interaction.customId.split(":");
    const privateReply = interaction.inGuild();

    if (chain !== "solana" || !isValidSolanaAddress(tokenAddress)) {
      await interaction.reply({
        content: "このボタンの内容を確認できませんでしたにゃ。",
        ephemeral: privateReply
      });
      return;
    }

    if (action === "deep") {
      await interaction.deferReply();
      const analysis = await analyzeSolanaTokenDeep(tokenAddress);
      await interaction.editReply({
        embeds: [createDeepAnalysisEmbed(analysis)]
      });
      return;
    }

    if (action === "watch") {
      await interaction.deferReply({ ephemeral: privateReply });
      const watchCount = await getWatchCount({ chain, tokenAddress });
      const analysis = await analyzeWatchToken({ chain, tokenAddress, watchCount });
      const tokenInfo = analysis.tokenInfo || {};
      const saved = await addWatchlistItem({
        userId: interaction.user.id,
        chain,
        tokenAddress,
        symbol: tokenInfo.symbol || "",
        name: tokenInfo.name || "",
        addedAt: new Date().toISOString(),
        addedPriceUsd: tokenInfo.priceUsd || 0,
        addedMarketCapUsd: tokenInfo.marketCapUsd || 0,
        addedLiquidityUsd: tokenInfo.liquidityUsd || 0,
        sourceChannelId: interaction.channelId || "",
        sourceMessageId: interaction.message?.id || ""
      });

      await interaction.editReply(
        saved.alreadyWatched
          ? `すでにWatch中ですにゃ。Watch中: ${saved.watchCount}人`
          : `Watchlistに追加しましたにゃ。Watch中: ${saved.watchCount}人`
      );
      return;
    }

    if (action === "watchremove") {
      await interaction.deferReply({ ephemeral: privateReply });
      const removed = await removeWatchlistItem({
        userId: interaction.user.id,
        chain,
        tokenAddress
      });
      await interaction.editReply(
        removed.removed
          ? `Watchlistから削除しましたにゃ。Watch中: ${removed.watchCount}人`
          : "Watchlistに見つかりませんでしたにゃ。"
      );
      return;
    }

    await interaction.reply({
      content: "このボタンの内容を確認できませんでしたにゃ。",
      ephemeral: privateReply
    });
  } catch (error) {
    console.error("Failed to handle Discord button interaction:", error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("処理に失敗しましたにゃ。");
      } else {
        await interaction.reply({
          content: "処理に失敗しましたにゃ。",
          ephemeral: interaction.inGuild()
        });
      }
    } catch (replyError) {
      console.error("Failed to send button interaction error reply:", replyError);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
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
        { name: "!discover solana", value: "Smart Money DEX Tradesから候補を発見します。`--wide --limit 500` / `--wide --target-tokens 700` まで指定できます。" },
        { name: "!radar solana", value: "G0 DiscoveryからDeep分析まで通した統合レーダーを実行します。`--wide --limit 500` / `--wide --target-tokens 700` まで指定できます。" },
        { name: "!review solana", value: "過去のAlpha Radarシグナルを答え合わせします。`--top 10` / `--stats` / `--detail` / `--all` / `--24h` / `--7d` / `--mature 4h` も使えます。" },
        { name: "!scan solana", value: "SolanaのSmart Money流入候補を手動スキャンします。" },
        { name: "!deep solana TOKEN_ADDRESS", value: "候補トークンを追加データで深掘りします。`--detail` で詳細表示します。" }
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

  if (parts[0] === "!check" && parts[1] === "solana") {
    if (!parts[2] || parts.length !== 3) {
      await message.reply("使い方: `!check solana TOKEN_ADDRESS` または `!check solana DEXSCREENER_URL`");
      return;
    }

    const tokenAddress = extractSolanaTokenAddress(parts[2]);
    if (!tokenAddress) {
      await message.reply("SolanaのトークンアドレスかDexscreener URLを確認してくださいにゃ。");
      return;
    }

    const reply = await message.reply("分析中ですにゃ。Watch Radarでトークンを確認しています...");

    try {
      const watchCount = await getWatchCount({ chain: "solana", tokenAddress });
      const analysis = await analyzeWatchToken({
        chain: "solana",
        tokenAddress,
        watchCount
      });

      await reply.edit({
        content: "",
        components: createTokenCheckComponents({ chain: "solana", tokenAddress }),
        embeds: [createTokenCheckEmbed(analysis)]
      });
    } catch (error) {
      console.error("Failed to run Watch Radar token check:", error);
      await reply.edit("Watch Radarの確認に失敗しましたにゃ。");
    }
    return;
  }

  if (message.content === "!watchlist") {
    await message.reply("Watchlistは `/watchlist` で自分だけに見える表示として確認してください。");
    return;
  }

  if (parts[0] === "!discover" && parts[1] === "solana") {
    const wideOptions = parseWideOptions(parts);
    if (!wideOptions) {
      await message.reply("使い方: `!discover solana --wide --limit 500` または `!discover solana --wide --target-tokens 700`");
      return;
    }
    const useWide = wideOptions.wide;
    const source = useWide ? "rest" : "cli";
    const reply = await message.reply(
      useWide
        ? "SolanaのG0 Discovery wideをREST APIで実行中ですにゃ..."
        : "SolanaのG0 Discoveryを実行中ですにゃ..."
    );

    try {
      const discoveries = await discoverSolanaCandidates({
        dexTradeLimit: wideOptions.limit,
        source,
        targetTokens: wideOptions.targetTokens
      });

      await saveDiscoveryResult({
        chain: "solana",
        discoveries
      });

      await sendOverviewAndTokenCards(
        message,
        reply,
        createDiscoveryEmbeds(discoveries),
        discoveries.slice(0, 5).map((discovery) => discovery.address)
      );
    } catch (error) {
      console.error("Failed to run Solana discovery:", error);
      await reply.edit("SolanaのG0 Discoveryに失敗しましたにゃ。");
    }
    return;
  }

  if (parts[0] === "!elite" && parts[1] === "solana") {
    const eliteOptions = parseEliteOptions(parts);
    if (!eliteOptions) {
      await message.reply("使い方: `!elite solana --top-wallets 50`（top-walletsは1から50です）");
      return;
    }

    if (eliteRadarRunning) {
      await message.reply("Elite SM Radarは別の分析が実行中ですにゃ。少し待ってから再実行してください。");
      return;
    }

    eliteRadarRunning = true;
    const reply = await message.reply("分析中ですにゃ。Elite SM Radarで90D成績の良いSmart Moneyを確認しています...");

    try {
      const elite = await runSolanaEliteRadar(eliteOptions);
      await sendOverviewAndTokenCards(
        message,
        reply,
        createEliteEmbeds(elite.results, elite.stats),
        elite.results.slice(0, 5).map((result) => result.address)
      );
    } catch (error) {
      console.error("Failed to run Solana elite radar:", error);
      await reply.edit("Elite SM Radarに失敗しましたにゃ。");
    } finally {
      eliteRadarRunning = false;
    }
    return;
  }

  if (parts[0] === "!radar" && parts[1] === "solana") {
    const wideOptions = parseWideOptions(parts);
    if (!wideOptions) {
      await message.reply("使い方: `!radar solana --wide --limit 500` または `!radar solana --wide --target-tokens 700`");
      return;
    }
    const useWide = wideOptions.wide;
    const source = useWide ? "rest" : "cli";
    const reply = await message.reply(
      useWide
        ? "SolanaのAlpha Radar wideをREST APIで実行中ですにゃ..."
        : "SolanaのAlpha Radarを実行中ですにゃ..."
    );

    try {
      const radar = await runSolanaRadar({
        dexTradeLimit: wideOptions.limit,
        source,
        targetTokens: wideOptions.targetTokens
      });

      await saveRadarResult({
        chain: "solana",
        results: radar.results,
        stats: radar.stats
      });

      await sendOverviewAndTokenCards(
        message,
        reply,
        createRadarEmbeds(radar.results, radar.stats),
        radar.results.slice(0, 5).map((result) => result.address)
      );
    } catch (error) {
      console.error("Failed to run Solana radar:", error);
      await reply.edit("SolanaのAlpha Radarに失敗しましたにゃ。");
    }
    return;
  }

  if (parts[0] === "!review" && parts[1] === "solana") {
    const reviewOptions = parseReviewOptions(parts);
    if (!reviewOptions) {
      await message.reply("使い方: `!review solana --mature 4h --top 10`（topは1〜20）");
      return;
    }

    const reply = await message.reply("過去のAlpha Radarシグナルを答え合わせ中ですにゃ...");

    try {
      const review = await reviewSolanaRadarSignals(reviewOptions);
      const embed = createReviewEmbed(review, { detail: reviewOptions.detail, stats: reviewOptions.stats });
      const embeds = Array.isArray(embed) ? embed : [embed];

      try {
        if (reviewOptions.detail || reviewOptions.stats || embeds.length <= 1) {
          await reply.edit({
            components: [],
            content: "",
            embeds
          });
        } else {
          await sendOverviewAndTokenCards(
            message,
            reply,
            embeds,
            (review.topPriceGainers || []).slice(0, reviewOptions.top).map((item) => item.address)
          );
        }
      } catch (replyError) {
        console.error("Failed to send Solana review embed:", replyError);
        await reply.edit("Signal Reviewの表示が長すぎましたにゃ。`--detail`なし、または条件を絞ってもう一度試してくださいにゃ。");
      }
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
    const useDetail = parts[3] === "--detail";
    if (parts[1] !== "solana" || !parts[2] || (parts.length !== 3 && !(parts.length === 4 && useDetail))) {
      await message.reply("使い方: `!deep solana TOKEN_ADDRESS` または `!deep solana TOKEN_ADDRESS --detail`");
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
        embeds: [useDetail ? createDeepAnalysisDetailEmbed(analysis) : createDeepAnalysisEmbed(analysis)]
      });
    } catch (error) {
      console.error("Failed to run deep Solana token analysis:", error);
      await reply.edit("深掘り分析に失敗しましたにゃ。");
    }
  }
  } catch (error) {
    console.error("Unhandled Discord message handler error:", error);
    try {
      await message.reply("処理に失敗しましたにゃ。少し時間をおいて再実行してください。");
    } catch (replyError) {
      console.error("Failed to send message handler error reply:", replyError);
    }
  }
});

client.login(token);
