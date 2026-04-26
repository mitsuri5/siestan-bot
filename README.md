# siestan-bot

Node.js と discord.js を使った最小構成の Discord Bot です。

Discord で `!ping` と送ると、Bot が次のように返信します。

```text
しえすたん起動中ですにゃ。Pong!
```

## 必要なもの

- Node.js
- Discord Bot の Token
- Nansen CLI

## セットアップ

依存パッケージをインストールします。

```bash
npm install
```

`.env.example` を参考にして、`.env` ファイルを作ります。

```env
DISCORD_BOT_TOKEN=ここに本物のBot Tokenを入れる
```

本物の Token はコードや README に書かないでください。

Nansen CLI を使う場合は、別途 Nansen CLI をインストールしてログインしてください。

```bash
npm install -g nansen-cli
nansen --version
```

## Discord Developer Portal 側の設定

Discord Developer Portal で Bot を作成し、Bot の設定画面で次を有効にしてください。

- Message Content Intent

Bot をサーバーへ招待するときは、最低限次の権限が必要です。

- View Channels
- Send Messages
- Read Message History

## 起動

```bash
npm start
```

起動に成功すると、ターミナルに次のようなログが出ます。

```text
Logged in as BotName#0000
```

Discord のチャンネルで `!ping` と送って、返信が返るか確認してください。

## コマンド

| コマンド | 説明 |
| --- | --- |
| `!ping` | Bot が起動中か確認します。 |
| `!help` | 使えるコマンド一覧を Discord の Embed で表示します。 |
| `!about` | しえすたんが、Nansen のオンチェーンデータを使ってアルトや Smart Money の動きを見守る Bot であることを説明します。 |
| `!sleep` | 「むにゃ... 監視はしえすたんに任せて、お昼寝してていいですにゃ。」と返信します。 |
| `!nansen-test` | Node.js から Nansen CLI の `nansen --version` を実行し、接続できているかを Embed で表示します。 |
