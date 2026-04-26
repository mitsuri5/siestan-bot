require("dotenv").config();

const { Client, EmbedBuilder, GatewayIntentBits } = require("discord.js");

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

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
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
        { name: "!sleep", value: "お昼寝したいときのひとことを返します。" }
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
  }
});

client.login(token);
