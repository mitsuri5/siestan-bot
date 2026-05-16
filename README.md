# しえすたん Bot

## 概要

しえすたんは、Discord上でSolanaトークンをNansen API / CLIを使って分析できるコミュニティ向けオンチェーン分析Botです。

もともとはSmart Moneyが触っているトークンを自動で探すRadarとして作られましたが、現在は以下の2つを主な目的にしています。

- Smart MoneyやNansenデータを使ってトークン候補を分析する
- コミュニティメンバーが見つけたトークンをWatchlistで追跡する

投資助言ではなく、リサーチ補助ツールです。

## 主な機能

### Watch Radar

- 気になるToken AddressまたはDexscreener URLを `/check` で分析
- Nansenデータを使ってMCAP、Liquidity、Holders、Smart Money Flowなどを確認
- `⭐ Watch` ボタンで自分だけのWatchlistに追加
- `/watchlist` でWatch開始後の価格変化を確認
- 同じトークンを何人がWatchしているか表示

### Token Check

- `/check` でトークンをチェック
- リスク、観察スコア、Smart Money情報をカード表示
- Deep分析やDexscreenerへのボタン付き

### Alpha Radar

- `/discover` でSmart Moneyが直近で触っている候補を探索
- `/radar` で候補をまとめて分析
- `wide`、`limit`、`target_tokens` 相当のスラッシュオプションに対応

### Deep Radar

- `/deep` で1つのトークンを深掘り分析
- Smart Money Flow、DEX売買、Holder状況、買い手の質などを表示

### Signal Review

- `/review` で過去に検出したトークンの上昇率ランキングを確認
- `/review stats: true` で全体成績だけ表示
- `/review detail: true` で詳細な集計を表示

### Elite SM Radar

- `/elite` で直近90日成績が良いSmart Moneyウォレットを選別
- そのElite SMが多く買っているトークンを集計

## まず使うコマンド

### トークンを調べる

```txt
/check chain: solana token_or_url: TOKEN_ADDRESS
```

または

```txt
/check chain: solana token_or_url: DEXSCREENER_URL
```

### 自分のWatchlistを見る

```txt
/watchlist
```

### 1つのトークンを深掘りする

```txt
/deep chain: solana token: TOKEN_ADDRESS
```

### 過去シグナルの成績を見る

```txt
/review chain: solana period: all top: 20
```

## Slash Commands

以下のスラッシュコマンドに対応しています。

- `/ping`
- `/help`
- `/about`
- `/sleep`
- `/nansen-test`
- `/scan`
- `/discover`
- `/radar`
- `/deep`
- `/review`
- `/elite`
- `/check`
- `/watchlist`

旧形式の `!` コマンドも一部互換で残しています。

例:

```txt
!check solana TOKEN_ADDRESS
!radar solana --wide --limit 500
!review solana --all --top 20
```

## Watch Radarの使い方

1. Discordで `/check` を実行
2. Token Address または Dexscreener URL を入力
3. しえすたんがNansenデータでToken Checkカードを表示
4. `⭐ Watch` ボタンを押す
5. `/watchlist` で自分だけのWatchlistを確認

Watchlistには以下のような情報が保存されます。

- `userId`
- `chain`
- `tokenAddress`
- `symbol`
- `name`
- `addedAt`
- `addedPriceUsd`
- `addedMarketCapUsd`
- `addedLiquidityUsd`

`data/watchlist.json` に保存されますが、このファイルは `.gitignore` に入れてコミットしません。

## Nansenを使った分析

しえすたんは主に以下のNansenデータを使います。

- Smart Money DEX Trades
- Smart Money Netflow
- Flow Intelligence
- Token Info
- Holders
- Profiler 90D PnL Summary

目的は、単に価格だけを見るのではなく、以下を確認することです。

- Smart Moneyが買っているか
- 資金流入があるか
- 買い手の質が高いか
- ホルダー状況に問題がないか
- 流動性や売り圧に注意点がないか

Nansen CLIは通常のスキャンや深掘り分析で使います。Nansen REST APIはwide modeのSmart Money DEX Trades取得などで使います。

## Smart Money 90D Buyer Quality

買っているSmart Moneyウォレット自体が直近90日で強いかを確認します。

主に以下を見ます。

- realized PnL
- realized PnL percent
- win rate
- traded token count
- traded times
- wallet labels

結果はDeep分析やElite SM Radarに反映されます。

## データ保存

以下のようなローカルデータを使います。

```txt
data/watchlist.json
data/sm90d-cache.json
data/radar.json
data/discoveries.json
data/signals.json
```

注意:

- `data/watchlist.json` はユーザーのWatchlist保存用
- `data/sm90d-cache.json` は90D Profiler結果のキャッシュ用
- `data/radar.json` はAlpha Radarの保存結果
- `data/discoveries.json` はDiscoveryの保存結果
- `data/signals.json` はSmart Money netflowスキャンの保存結果
- これらのローカルデータはコミットしない
- API Keyや秘密情報は保存しない

## セットアップ

### 1. 依存関係をインストール

```powershell
git clone REPOSITORY_URL
cd siestan-bot
npm install
```

### 2. Discord Botを準備

Discord Developer PortalでBotを作成し、以下を有効にします。

- Message Content Intent

Botをサーバーへ招待するときは、最低限以下の権限が必要です。

- View Channels
- Send Messages
- Read Message History
- Use Slash Commands

### 3. 環境変数を設定

`.env.example` を参考に `.env` を作成し、Discord Bot TokenとNansen API Keyを設定します。

実際のTokenやAPI KeyはREADME、コード、ログ、Issue、Pull Requestに書かないでください。

### 4. Nansen CLIを準備

Nansen CLIを使う場合は、別途インストールしてログインします。

```powershell
npm install -g nansen-cli
nansen --version
nansen login --human
```

### 5. Botを起動

```powershell
npm start
```

起動に成功すると、ターミナルにDiscord Botとしてログインしたことが表示されます。

## 開発時の確認

構文チェック:

```powershell
node --check index.js
node --check src/formatters.js
node --check src/review.js
node --check src/radar.js
node --check src/discovery.js
node --check src/nansen.js
node --check src/storage.js
node --check src/deepAnalysis.js
node --check src/elite.js
node --check src/watchRadar.js
node --check src/scoring.js
```

READMEだけを変更した場合、通常はNode.jsの構文チェックは不要ですが、コード変更を含む場合は上記を確認します。

## 注意事項

- このBotは投資助言ではありません
- 表示されるスコアや分析結果はリサーチ補助です
- 低MCAPトークンは価格変動が非常に大きいです
- Smart Moneyが買っていても上がる保証はありません
- API障害やデータ欠損が起きることがあります

## セキュリティ

- `.env` はコミットしない
- API Keyをログに出さない
- `data/watchlist.json` や `data/sm90d-cache.json` はコミットしない
- `data/signals.json`、`data/discoveries.json`、`data/radar.json` はコミットしない
- `C:\Users\tweet\.nansen\config.json` は触らない

## 今後追加したい機能

- Discordに貼られたCAやDexscreener URLの自動検知
- コミュニティ全体のWatch人気ランキング
- Watch開始後の最大上昇率
- ユーザー別Watch成績
- ナラティブメモ保存
- チャンネル別トークン人気
- シミュレーター機能
- Exit Logic検証
