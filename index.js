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

const solanaOption = (option) =>
  option
    .setName("chain")
    .setDescription("分析するチェーンを選びます")
    .setRequired(true)
    .addChoices({ name: "solana", value: "solana" });

const wideModeOption = (option) =>
  option
    .setName("mode")
    .setDescription("通常スキャンか広範囲スキャンを選びます")
    .setRequired(false)
    .addChoices({ name: "normal", value: "normal" }, { name: "wide", value: "wide" });

const radarModeOption = (option) =>
  option
    .setName("mode")
    .setDescription("通常分析か広範囲分析を選びます")
    .setRequired(false)
    .addChoices({ name: "normal", value: "normal" }, { name: "wide", value: "wide" });

const wideLimitOption = (option) =>
  option
    .setName("limit")
    .setDescription("取得するSmart Money取引数を指定します")
    .setRequired(false)
    .setMinValue(1)
    .setMaxValue(500);

const targetTokensOption = (option) =>
  option
    .setName("target_tokens")
    .setDescription("目標にする集計後トークン数を指定します")
    .setRequired(false)
    .setMinValue(1)
    .setMaxValue(700);

const slashCommands = [
  new SlashCommandBuilder().setName("ping").setDescription("Botが動いているか確認します").toJSON(),
  new SlashCommandBuilder().setName("help").setDescription("使えるコマンド一覧を表示します").toJSON(),
  new SlashCommandBuilder().setName("about").setDescription("しえすたんBotの概要を表示します").toJSON(),
  new SlashCommandBuilder().setName("sleep").setDescription("しえすたんのお昼寝メッセージを表示します").toJSON(),
  new SlashCommandBuilder().setName("nansen-test").setDescription("Nansen CLI/APIの接続確認をします").toJSON(),
  new SlashCommandBuilder()
    .setName("scan")
    .setDescription("Smart Moneyの資金流入をざっくり確認します")
    .addStringOption(solanaOption)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("discover")
    .setDescription("Smart Moneyが直近で触っているトークン候補を探します")
    .addStringOption(solanaOption)
    .addStringOption(wideModeOption)
    .addIntegerOption(wideLimitOption)
    .addIntegerOption(targetTokensOption)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("radar")
    .setDescription("候補トークンをまとめて分析し、注目度をランキング表示します")
    .addStringOption(solanaOption)
    .addStringOption(radarModeOption)
    .addIntegerOption(wideLimitOption)
    .addIntegerOption(targetTokensOption)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("deep")
    .setDescription("指定したトークンをNansenデータで深掘り分析します")
    .addStringOption(solanaOption)
    .addStringOption((option) =>
      option
        .setName("token")
        .setDescription("深掘りしたいToken Addressを入力します")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("review")
    .setDescription("過去に検出したトークンの上昇率ランキングを確認します")
    .addStringOption(solanaOption)
    .addStringOption((option) =>
      option
        .setName("period")
        .setDescription("確認する過去シグナルの期間を選びます")
        .setRequired(false)
        .addChoices(
          { name: "recent", value: "recent" },
          { name: "all", value: "all" },
          { name: "24h", value: "24h" },
          { name: "7d", value: "7d" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("mature")
        .setDescription("検出から一定時間たったものだけに絞ります")
        .setRequired(false)
        .addChoices(
          { name: "none", value: "none" },
          { name: "1h", value: "1h" },
          { name: "4h", value: "4h" },
          { name: "24h", value: "24h" },
          { name: "7d", value: "7d" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("top")
        .setDescription("表示するランキング件数を指定します")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    )
    .addBooleanOption((option) =>
      option
        .setName("detail")
        .setDescription("詳しい集計や対象外理由も表示します")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("stats")
        .setDescription("ランキングではなく全体成績だけ表示します")
        .setRequired(false)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("elite")
    .setDescription("直近90日で成績の良いSmart Moneyが買うトークンを探します")
    .addStringOption(solanaOption)
    .addIntegerOption((option) =>
      option
        .setName("top_wallets")
        .setDescription("評価するElite Smart Moneyの人数を指定します")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("check")
    .setDescription("気になるSolanaトークンをNansenでチェックします")
    .addStringOption(solanaOption)
    .addStringOption((option) =>
      option
        .setName("token_or_url")
        .setDescription("Token AddressまたはDexscreener URLを入力します")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("watchlist")
    .setDescription("自分だけのWatchlistを表示します")
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

function createAboutEmbed() {
  return new EmbedBuilder()
    .setColor(0xffc1da)
    .setTitle("しえすたんについて")
    .setDescription(
      "しえすたんは、Nansenのオンチェーンデータを使って、アラートやSmart Moneyの動きを見守るBotですにゃ。"
    );
}

function createWideOptionsFromInteraction(interaction) {
  const mode = interaction.options.getString("mode") || "normal";

  if (mode !== "wide") {
    return {
      limit: 200,
      targetTokens: null,
      wide: false
    };
  }

  return {
    limit: interaction.options.getInteger("limit") || 200,
    targetTokens: interaction.options.getInteger("target_tokens") || null,
    wide: true
  };
}

function createReviewOptionsFromInteraction(interaction) {
  const period = interaction.options.getString("period") || "recent";
  const mature = interaction.options.getString("mature") || "none";

  return {
    option: period === "recent" ? "default" : period,
    mature: mature === "none" ? null : mature,
    detail: interaction.options.getBoolean("detail") || false,
    stats: interaction.options.getBoolean("stats") || false,
    top: interaction.options.getInteger("top") || 5
  };
}

function createEliteOptionsFromInteraction(interaction) {
  return {
    topWallets: interaction.options.getInteger("top_wallets") || 10
  };
}

function createInteractionReplyEditor(interaction) {
  return {
    edit: (payload) => interaction.editReply(payload)
  };
}

async function sendOverviewAndTokenCards(message, reply, embeds, addresses) {
  await sendOverviewAndTokenCardsToChannel(message.channel, reply, embeds, addresses);
}

async function sendOverviewAndTokenCardsToChannel(channel, reply, embeds, addresses) {
  const [overview, ...cards] = embeds;

  await reply.edit({
    components: [],
    content: "",
    embeds: overview ? [overview] : []
  });

  if (!channel) {
    return;
  }

  for (let index = 0; index < cards.length; index += 1) {
    const address = addresses[index];
    await channel.send({
      components: createTokenCardComponents(address),
      embeds: [cards[index]]
    });
  }
}

async function createNansenTestPayload() {
  const version = await getNansenVersion();
  const nansenEmbed = new EmbedBuilder()
    .setColor(0x7bd88f)
    .setTitle("Nansen CLI 接続確認")
    .setDescription("しえすたんはNansen CLIに接続できていますにゃ。")
    .addFields({ name: "Version", value: version || "unknown" });

  return { embeds: [nansenEmbed] };
}

async function runDiscoverCommand({ channel, reply, wideOptions }) {
  const useWide = wideOptions.wide;
  const source = useWide ? "rest" : "cli";
  const discoveries = await discoverSolanaCandidates({
    dexTradeLimit: wideOptions.limit,
    source,
    targetTokens: wideOptions.targetTokens
  });

  await saveDiscoveryResult({
    chain: "solana",
    discoveries
  });

  await sendOverviewAndTokenCardsToChannel(
    channel,
    reply,
    createDiscoveryEmbeds(discoveries),
    discoveries.slice(0, 5).map((discovery) => discovery.address)
  );
}

async function runRadarCommand({ channel, reply, wideOptions }) {
  const useWide = wideOptions.wide;
  const source = useWide ? "rest" : "cli";
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

  await sendOverviewAndTokenCardsToChannel(
    channel,
    reply,
    createRadarEmbeds(radar.results, radar.stats),
    radar.results.slice(0, 5).map((result) => result.address)
  );
}

async function runEliteCommand({ channel, reply, eliteOptions }) {
  if (eliteRadarRunning) {
    await reply.edit("Elite SM Radarは別の分析が実行中ですにゃ。少し待ってから再実行してください。");
    return;
  }

  eliteRadarRunning = true;
  try {
    const elite = await runSolanaEliteRadar(eliteOptions);
    await sendOverviewAndTokenCardsToChannel(
      channel,
      reply,
      createEliteEmbeds(elite.results, elite.stats),
      elite.results.slice(0, 5).map((result) => result.address)
    );
  } finally {
    eliteRadarRunning = false;
  }
}

async function runReviewCommand({ channel, reply, reviewOptions }) {
  const review = await reviewSolanaRadarSignals(reviewOptions);
  const embed = createReviewEmbed(review, { detail: reviewOptions.detail, stats: reviewOptions.stats });
  const embeds = Array.isArray(embed) ? embed : [embed];

  if (reviewOptions.detail || reviewOptions.stats || embeds.length <= 1) {
    await reply.edit({
      components: [],
      content: "",
      embeds
    });
    return;
  }

  await sendOverviewAndTokenCardsToChannel(
    channel,
    reply,
    embeds,
    (review.topPriceGainers || []).slice(0, reviewOptions.top).map((item) => item.address)
  );
}

async function runScanCommand(reply) {
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
}

function createHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0x8fd3ff)
    .setTitle("しえすたん 使い方ガイド")
    .setDescription(
      [
        "気になるトークンをNansenでチェックして、Watchlistであとから追えるBotですにゃ。",
        "",
        "**まず使うならこの3つですにゃ**",
        "",
        "**/check**",
        "気になるトークンを調べる",
        "",
        "**⭐ /watchlist**",
        "自分がWatchしたトークンを見る",
        "",
        "**/review**",
        "過去に見つけたトークンの成績を見る"
      ].join("\n")
    )
    .addFields(
      {
        name: "🔎 トークンを調べる",
        value: [
          "**/check**",
          "SolanaのToken AddressかDexscreener URLを入れると、MCAP、流動性、Smart Money、リスクをまとめて確認できます。",
          "",
          "例:",
          "`/check chain: solana token_or_url: TOKEN_ADDRESS`"
        ].join("\n")
      },
      {
        name: "⭐ Watchlist",
        value: [
          "`/check` の結果にある ⭐ Watch ボタンを押すと、自分だけのWatchlistに追加できます。",
          "",
          "**/watchlist**",
          "Watch開始からの価格変化を確認できます。"
        ].join("\n")
      },
      {
        name: "📊 もっと詳しく分析する",
        value: [
          "**/deep**",
          "1つのトークンを深掘り分析します。",
          "",
          "**/radar**",
          "Smart Moneyが触っている候補をまとめて分析します。",
          "",
          "**/elite**",
          "直近90日で成績の良いSmart Moneyが買う候補を探します。"
        ].join("\n")
      },
      {
        name: "🧾 振り返る",
        value: [
          "**/review**",
          "過去に検出したトークンが、その後どれくらい上がったか確認します。",
          "",
          "`/review period: all top: 20`",
          "全履歴から上位20件を見る",
          "",
          "`/review stats: true`",
          "全体成績だけを見る"
        ].join("\n")
      },
      {
        name: "⚙️ 上級者向け",
        value: [
          "**/discover**",
          "Smart Moneyが直近で触っている候補を探します。",
          "",
          "**/scan**",
          "Smart Moneyのnetflowを確認します。",
          "",
          "**/nansen-test**",
          "Nansen CLI/APIの接続確認をします。"
        ].join("\n")
      },
      {
        name: "補足: 旧コマンド",
        value: [
          "`/` の代わりに `!` でも使えます。",
          "",
          "例:",
          "`!check solana TOKEN_ADDRESS`",
          "`!watchlist`",
          "`!radar solana --wide`"
        ].join("\n")
      }
    )
    .setFooter({ text: "投資助言ではありません。" });
}

async function createTokenCheckPayload({ chain = "solana", tokenAddress }) {
  const watchCount = await getWatchCount({ chain, tokenAddress });
  const analysis = await analyzeWatchToken({
    chain,
    tokenAddress,
    watchCount
  });

  return {
    content: "",
    components: createTokenCheckComponents({ chain, tokenAddress }),
    embeds: [createTokenCheckEmbed(analysis)]
  };
}

async function createDeepAnalysisPayload({ tokenAddress, detail = false }) {
  const analysis = await analyzeSolanaTokenDeep(tokenAddress);
  return {
    content: "",
    embeds: [detail ? createDeepAnalysisDetailEmbed(analysis) : createDeepAnalysisEmbed(analysis)]
  };
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
  const failures = [];

  for (const commandData of slashCommands) {
    try {
      const existingCommand = commands.find((command) => command.name === commandData.name);
      if (existingCommand) {
        await existingCommand.edit(commandData);
        console.log(`Updated slash command: /${commandData.name}`);
      } else {
        await readyClient.application.commands.create(commandData);
        console.log(`Created slash command: /${commandData.name}`);
      }
    } catch (error) {
      failures.push(commandData.name);
      console.error(`Failed to register slash command /${commandData.name}:`, {
        code: error.code,
        status: error.status,
        message: error.message,
        method: error.method,
        url: error.url,
        requestBody: error.requestBody
      });
    }
  }

  if (failures.length > 0) {
    throw new Error(`Failed to register ${failures.length} slash command(s): ${failures.map((name) => `/${name}`).join(", ")}`);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    await registerSlashCommands(readyClient);
    console.log("Registered slash commands.");
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    try {
      if (interaction.commandName === "watchlist") {
        await interaction.deferReply({ ephemeral: true });
        await sendUserWatchlist(interaction.user, interaction);
        return;
      }

      if (interaction.commandName === "ping") {
        await interaction.reply("しえすたん起動中ですにゃ。Pong!");
        return;
      }

      if (interaction.commandName === "help") {
        await interaction.reply({ embeds: [createHelpEmbed()] });
        return;
      }

      if (interaction.commandName === "about") {
        await interaction.reply({ embeds: [createAboutEmbed()] });
        return;
      }

      if (interaction.commandName === "sleep") {
        await interaction.reply("むにゃ... 監視はしえすたんに任せて、お昼寝してていいですにゃ。");
        return;
      }

      if (interaction.commandName === "nansen-test") {
        await interaction.deferReply();
        await interaction.editReply(await createNansenTestPayload());
        return;
      }

      if (interaction.commandName === "scan") {
        const chain = interaction.options.getString("chain", true);
        if (chain !== "solana") {
          await interaction.reply({ content: "今は `solana` のみ対応していますにゃ。", ephemeral: true });
          return;
        }

        await interaction.deferReply();
        const reply = createInteractionReplyEditor(interaction);
        await reply.edit("SolanaのSmart Money流入候補をスキャン中ですにゃ...");
        await runScanCommand(reply);
        return;
      }

      if (interaction.commandName === "discover") {
        const chain = interaction.options.getString("chain", true);
        if (chain !== "solana") {
          await interaction.reply({ content: "今は `solana` のみ対応していますにゃ。", ephemeral: true });
          return;
        }

        const wideOptions = createWideOptionsFromInteraction(interaction);
        await interaction.deferReply();
        const reply = createInteractionReplyEditor(interaction);
        await reply.edit(
          wideOptions.wide
            ? "SolanaのG0 Discovery wideをREST APIで実行中ですにゃ..."
            : "SolanaのG0 Discoveryを実行中ですにゃ..."
        );
        await runDiscoverCommand({ channel: interaction.channel, reply, wideOptions });
        return;
      }

      if (interaction.commandName === "radar") {
        const chain = interaction.options.getString("chain", true);
        if (chain !== "solana") {
          await interaction.reply({ content: "今は `solana` のみ対応していますにゃ。", ephemeral: true });
          return;
        }

        const wideOptions = createWideOptionsFromInteraction(interaction);
        await interaction.deferReply();
        const reply = createInteractionReplyEditor(interaction);
        await reply.edit(
          wideOptions.wide
            ? "SolanaのAlpha Radar wideをREST APIで実行中ですにゃ..."
            : "SolanaのAlpha Radarを実行中ですにゃ..."
        );
        await runRadarCommand({ channel: interaction.channel, reply, wideOptions });
        return;
      }

      if (interaction.commandName === "review") {
        const chain = interaction.options.getString("chain", true);
        if (chain !== "solana") {
          await interaction.reply({ content: "今は `solana` のみ対応していますにゃ。", ephemeral: true });
          return;
        }

        const reviewOptions = createReviewOptionsFromInteraction(interaction);
        await interaction.deferReply();
        const reply = createInteractionReplyEditor(interaction);
        await reply.edit("過去のAlpha Radarシグナルを答え合わせ中ですにゃ...");
        await runReviewCommand({ channel: interaction.channel, reply, reviewOptions });
        return;
      }

      if (interaction.commandName === "elite") {
        const chain = interaction.options.getString("chain", true);
        if (chain !== "solana") {
          await interaction.reply({ content: "今は `solana` のみ対応していますにゃ。", ephemeral: true });
          return;
        }

        await interaction.deferReply();
        const reply = createInteractionReplyEditor(interaction);
        await reply.edit("分析中ですにゃ");
        await runEliteCommand({
          channel: interaction.channel,
          reply,
          eliteOptions: createEliteOptionsFromInteraction(interaction)
        });
        return;
      }

      if (interaction.commandName === "check") {
        const chain = interaction.options.getString("chain", true);
        const tokenInput = interaction.options.getString("token_or_url", true);

        if (chain !== "solana") {
          await interaction.reply({
            content: "今は `solana` のみ対応していますにゃ。",
            ephemeral: true
          });
          return;
        }

        const tokenAddress = extractSolanaTokenAddress(tokenInput);
        if (!tokenAddress) {
          await interaction.reply({
            content: "SolanaのトークンアドレスかDexscreener URLを確認してくださいにゃ。",
            ephemeral: true
          });
          return;
        }

        await interaction.deferReply();
        await interaction.editReply(await createTokenCheckPayload({ chain, tokenAddress }));
        return;
      }

      if (interaction.commandName === "deep") {
        const chain = interaction.options.getString("chain", true);
        const tokenAddress = interaction.options.getString("token", true);

        if (chain !== "solana") {
          await interaction.reply({
            content: "今は `solana` のみ対応していますにゃ。",
            ephemeral: true
          });
          return;
        }

        if (!isValidSolanaAddress(tokenAddress)) {
          await interaction.reply({
            content: "Solanaのトークンアドレス形式を確認してくださいにゃ。",
            ephemeral: true
          });
          return;
        }

        await interaction.deferReply();
        await interaction.editReply(await createDeepAnalysisPayload({ tokenAddress, detail: false }));
        return;
      }
    } catch (error) {
      console.error(`Failed to handle /${interaction.commandName} command:`, error);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("処理に失敗しましたにゃ。少し待ってからもう一度試してください。");
        } else {
          await interaction.reply({
            content: "処理に失敗しましたにゃ。少し待ってからもう一度試してください。",
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error("Failed to send slash command error reply:", replyError);
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
    await message.reply({ embeds: [createHelpEmbed()] });
    return;
  }

  if (message.content === "!about") {
    await message.reply({ embeds: [createAboutEmbed()] });
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
      await message.reply(await createNansenTestPayload());
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
      await reply.edit(await createTokenCheckPayload({ chain: "solana", tokenAddress }));
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
    const reply = await message.reply(
      wideOptions.wide
        ? "SolanaのG0 Discovery wideをREST APIで実行中ですにゃ..."
        : "SolanaのG0 Discoveryを実行中ですにゃ..."
    );

    try {
      await runDiscoverCommand({ channel: message.channel, reply, wideOptions });
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

    const reply = await message.reply("分析中ですにゃ。Elite SM Radarで90D成績の良いSmart Moneyを確認しています...");

    try {
      await runEliteCommand({ channel: message.channel, reply, eliteOptions });
    } catch (error) {
      console.error("Failed to run Solana elite radar:", error);
      await reply.edit("Elite SM Radarに失敗しましたにゃ。");
    }
    return;
  }

  if (parts[0] === "!radar" && parts[1] === "solana") {
    const wideOptions = parseWideOptions(parts);
    if (!wideOptions) {
      await message.reply("使い方: `!radar solana --wide --limit 500` または `!radar solana --wide --target-tokens 700`");
      return;
    }
    const reply = await message.reply(
      wideOptions.wide
        ? "SolanaのAlpha Radar wideをREST APIで実行中ですにゃ..."
        : "SolanaのAlpha Radarを実行中ですにゃ..."
    );

    try {
      await runRadarCommand({ channel: message.channel, reply, wideOptions });
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
      await runReviewCommand({ channel: message.channel, reply, reviewOptions });
    } catch (error) {
      console.error("Failed to review Solana radar signals:", error);
      await reply.edit("Signal Reviewに失敗しましたにゃ。");
    }
    return;
  }

  if (message.content === "!scan solana") {
    const reply = await message.reply("SolanaのSmart Money流入候補をスキャン中ですにゃ...");

    try {
      await runScanCommand(reply);
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
      await reply.edit(await createDeepAnalysisPayload({ tokenAddress, detail: useDetail }));
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
