# しえすたん Bot

## 概要

しえすたんは、Nansen API / CLIを使ってDiscord上でSolanaトークンを分析できるコミュニティ向けBotです。

主な目的:

- 気になるトークンをNansenデータでチェックする
- Watchlistに追加してあとから価格変化を追う
- Smart MoneyやElite Smart Moneyの動きを分析する

投資助言ではなく、リサーチ補助ツールです。

## Demo / Main Flow

1. `/check` でToken AddressまたはDexscreener URLを入力
2. しえすたんがNansenデータでToken Checkカードを表示
3. `⭐ Watch` ボタンで自分のWatchlistに追加
4. `/watchlist` でWatch開始後の変化率を確認
5. 必要なら `/deep` で深掘り分析

## 主な機能

### Watch Radar

- `/check` でトークンを分析
- `⭐ Watch` ボタンで自分だけのWatchlistに追加
- `/watchlist` でWatch開始後の価格変化を確認
- 同じトークンを何人がWatchしているか表示

### Token Check

- MCAP、Liquidity、Holdersを表示
- Smart Money FlowやDEX売買を確認
- リスク注意点と観察スコアを表示

### Deep Radar

- `/deep` で1トークンを深掘り分析
- Smart Money Flow、Holder状況、買い手の質、リスクを確認

### Alpha Radar

- `/discover` でSmart Moneyが触っている候補を探索
- `/radar` で候補をまとめて分析

### Signal Review

- `/review` で過去に検出したトークンの上昇率を確認
- `/review stats: true` で全体成績を表示

### Elite SM Radar

- `/elite` で直近90日成績が良いSmart Moneyが買っている候補を確認

## まず使うコマンド

```txt
/check chain: solana token_or_url: TOKEN_ADDRESS_OR_DEXSCREENER_URL

/watchlist

/deep chain: solana token: TOKEN_ADDRESS

/review chain: solana period: all top: 20

/elite chain: solana top_wallets: 10
```

## Slash Commands

- `/help`
- `/check`
- `/watchlist`
- `/deep`
- `/discover`
- `/radar`
- `/review`
- `/elite`
- `/scan`
- `/nansen-test`
- `/ping`

旧形式の `!` コマンドも一部互換で残しています。

## Nansen Integration

しえすたんは主に以下のNansenデータを使います。

- Smart Money DEX Trades
- Smart Money Netflow
- Flow Intelligence
- Token Info
- Holders
- Profiler 90D PnL Summary

これにより、以下を確認します。

- Smart Moneyが買っているか
- 資金流入があるか
- 買い手の質が高いか
- ホルダー状況に偏りがないか
- 流動性や売り圧に注意点がないか

## Setup

```powershell
git clone https://github.com/mitsuri5/siestan-bot.git
cd siestan-bot
npm install
```

Create `.env` and set the required environment variables.

* `DISCORD_BOT_TOKEN`
* `NANSEN_API_KEY`

Start the bot.

```powershell
npm start
```

## Data and Privacy

Watchlistや分析キャッシュはローカルの `data/` 配下に保存されます。API Keyや秘密情報は保存しません。
`.env`、API Key、ユーザーごとのWatchlist、分析キャッシュはコミットしません。

## Disclaimer

- このBotは投資助言ではありません
- 表示されるスコアや分析結果はリサーチ補助です
- 低MCAPトークンは価格変動が非常に大きいです
- Smart Moneyが買っていても上がる保証はありません
- API障害やデータ欠損が起きることがあります

## Roadmap

* Discordに貼られたCA / Dexscreener URLの自動検知
* コミュニティ全体のWatch人気ランキング
* Watch開始後の最大上昇率
* シミュレーター機能
