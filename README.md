# siestan-bot

Node.js と discord.js を使った Discord Bot です。

Discord で `!ping` と送ると、Bot が次のように返します。

```text
しえすたん起動中ですにゃ。Pong!
```

## 必要なもの

- Node.js
- Discord Bot の Token
- Nansen CLI
- Nansen API Key

## セットアップ

依存パッケージをインストールします。

```bash
npm install
```

`.env.example` を参考にして、`.env` ファイルを作ります。

```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
NANSEN_API_KEY=your_nansen_api_key_here
```

本物の Discord Bot Token や Nansen API Key は、コードや README に書かないでください。
Bot は `.env` から `DISCORD_BOT_TOKEN` と `NANSEN_API_KEY` を読み込みます。API Key の値はログに出さない方針です。

Nansen CLI を使う場合は、別途 Nansen CLI をインストールしてログインしてください。

```bash
npm install -g nansen-cli
nansen --version
nansen login --human
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

## コマンド

| コマンド | 説明 |
| --- | --- |
| `!ping` | Bot が起動中か確認します。 |
| `!help` | 使えるコマンド一覧を Discord の Embed で表示します。 |
| `!about` | しえすたんが、Nansen のオンチェーンデータを使ってアルトや Smart Money の動きを見守る Bot であることを説明します。 |
| `!sleep` | お昼寝したいときのかわいい返事を返します。 |
| `!nansen-test` | Node.js から Nansen CLI の `nansen --version` を実行し、接続できているかを Embed で表示します。 |
| `!discover solana` | Nansen CLI の Smart Money DEX Trades から、Solana 上で Smart Money が直近で買っている候補を発見します。投資助言ではありません。 |
| `!discover solana --wide` | Nansen REST API で Smart Money DEX Trades を200件取得し、広めの母数から候補を発見します。投資助言ではありません。 |
| `!radar solana` | CLI版の G0 Discovery 上位候補を Deep 分析まで通し、統合スコア付きの Early Signal 候補を表示します。投資助言ではありません。 |
| `!radar solana --wide` | REST API wide版のG0 Discoveryを200件の母数で実行し、上位5件だけをDeep分析に通します。投資助言ではありません。 |
| `!scan solana` | Nansen CLI の Smart Money netflow を使って、Solana 上の流入候補をスキャンし、簡易スコア付きで上位3件を表示します。投資助言ではありません。 |
| `!deep solana TOKEN_ADDRESS` | 候補トークンを Flow Intelligence、Token Holders、DEX Trades で深掘りし、4-Gate 形式の分析を表示します。投資助言ではありません。 |

## 外部通信

このBotは、コマンドに応じて次の外部サービスへ通信します。

- Nansen CLI: `!nansen-test`、通常版の `!discover solana`、`!radar solana`、`!scan solana`、`!deep solana TOKEN_ADDRESS`
- Nansen REST API: `!discover solana --wide`、`!radar solana --wide`
- Dexscreener: Discord Embed 内にチャート確認用リンクを表示します。リンクを開いたときにブラウザから Dexscreener へアクセスします。

Nansen REST API wide mode では、次のエンドポイントを使います。

```text
POST https://api.nansen.ai/api/v1/smart-money/dex-trades
```

`NANSEN_API_KEY` は `.env` から読み込み、コードに直書きしません。API Key の値は console に出さないでください。

## 保存されるデータ

スキャンや分析の結果はローカルの `data` フォルダに保存されます。

- `!discover solana` / `!discover solana --wide` の結果: `data/discoveries.json`
- `!radar solana` / `!radar solana --wide` の結果: `data/radar.json`
- `!scan solana` の結果: `data/signals.json`

これらはローカルの実行結果なので Git にはコミットしません。
`data/.gitkeep` だけを置いて、`data` フォルダ自体は Git 管理できるようにしています。

## 注意

しえすたんBotが表示する内容は、オンチェーンデータに基づいた調査補助情報です。
トークンの購入、売却、保有をすすめるものではありません。
最終判断は、必ず自分で調べたうえで行ってください。
