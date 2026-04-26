# siestan-bot

Node.js と discord.js を使った Discord Bot です。

Discord で `!ping` と送ると、Bot が次のように返信します。

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
DISCORD_BOT_TOKEN=ここに本物のDiscord Bot Tokenを入れる
NANSEN_API_KEY=ここに本物のNansen API Keyを入れる
```

本物の Token や API Key はコードや README に書かないでください。

Nansen CLI を使う場合は、別途 Nansen CLI をインストールしてログインしてください。

```bash
npm install -g nansen-cli
nansen --version
```

現時点の `!scan solana` と `!deep solana TOKEN_ADDRESS` は Nansen CLI を使います。`NANSEN_API_KEY` は、将来 REST API に切り替える場合に使うための設定です。

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
| `!sleep` | 「むにゃ... 監視はしえすたんに任せて、お昼寝してていいですにゃ。」と返信します。 |
| `!nansen-test` | Node.js から Nansen CLI の `nansen --version` を実行し、接続できているかを Embed で表示します。 |
| `!scan solana` | Nansen CLI の Smart Money netflow を使って、Solana 上の流入候補をスキャンし、簡易スコア付きで上位3件を表示します。投資助言ではありません。 |
| `!deep solana TOKEN_ADDRESS` | 候補トークンを Flow Intelligence、Token Holders、DEX Trades で深掘りし、4-Gate形式の分析を表示します。投資助言ではありません。 |

## スキャン結果の保存

`!scan solana` の結果は `data/signals.json` に保存されます。

`data/signals.json` はローカルの実行結果なので Git にはコミットしません。`data/.gitkeep` だけを置いて、`data` フォルダ自体は Git 管理できるようにしています。
