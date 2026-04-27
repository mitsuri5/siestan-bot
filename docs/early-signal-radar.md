# Early Signal Radar

## 最終目標

しえすたんBotを、Nansen のオンチェーンデータを使って Smart Money とアルトコイン周辺の初期シグナルを検知する Discord Bot に拡張する。

最終的には、4時間ごとに Solana などの対象チェーンをスキャンし、Smart Money の買い、netflow、Flow Intelligence、Holder 情報、DEX Trades、Token Info を組み合わせて、調査候補だけを Discord に分かりやすく表示する。

このBotは投資判断を自動化するものではない。早めに調査候補を見つけるためのレーダーとして扱う。

## MVP機能

- `!nansen-test` で Nansen CLI との接続を確認する
- `!discover solana` で Smart Money DEX Trades から候補トークンを発見する
- `!scan solana` で Smart Money netflow の上位候補を取得し、簡易スコアを付ける
- `!deep solana TOKEN_ADDRESS` で候補トークンを追加データで深掘りする
- `!radar solana` で G0 Discovery から Deep 分析まで通し、統合候補を表示する
- 結果を Discord Embed で表示する
- 実行結果を `data/*.json` に保存する
- エラー詳細は Discord に出しすぎず、`console.error` に出す

## 将来の4時間定期スキャン構成

将来的には、次の処理を4時間ごとに実行する。

1. 対象チェーンを決める
2. G0 Discovery で Smart Money が直近で買っている候補を取得する
3. 候補を重複排除し、買い優勢、一定の流動性、低すぎない時価総額などで絞る
4. 上位候補に Deep Radar を実行する
5. 4-Gate の通過状況とスコアを計算する
6. Alpha Radar で最終候補を3件程度に絞る
7. Discord に通知する
8. 実行結果、エラー、取得件数、API使用量の目安を保存する

最初は Node.js プロセス内のスケジューラでもよい。運用が重くなったら、外部 cron、GitHub Actions、VPS のタスクスケジューラ、キュー付きワーカーなどを検討する。

## 4-Gate設計

### G0 Discovery

目的は、Smart Money が直近で買っている候補を発見すること。

利用データ:

- `nansen research smart-money dex-trades --chain solana`
- 必要に応じて `nansen research token info`

見るポイント:

- `token_bought_address` を中心に、買われたトークン候補を抽出する
- `token_sold_address` も集計し、売り優勢かどうかを見る
- 同じトークンを重複排除する
- 買い件数、売り件数、買い金額、売り金額を集計する
- Token Info で symbol、name、market cap、liquidity、holders を補完する
- 買いがない売りだけの候補はメイン表示から除外する

### G1 Flow Signal

目的は、Smart Money や関連ウォレットのフローがプラス方向かを見ること。

利用データ:

- Smart Money Netflow
- Flow Intelligence

見るポイント:

- 24h netflow がプラスか
- 7d netflow もプラスか
- Flow Intelligence の推定ネットフローがプラスか
- Smart Money netflow 上位に対象トークンが出ているか
- 上位未検出の場合は即除外せず、confidence を下げる

### G2 Buyer Quality

目的は、買っているウォレットの質と広がりを見ること。

見るポイント:

- trader_count が十分にあるか
- Flow Intelligence の関連ウォレット数があるか
- DEX Trades の行数やウォレット数に広がりがあるか
- 単一ウォレットだけの大口買いに偏っていないか

### G3 Holder Conviction

目的は、ホルダーの状態を確認すること。

利用データ:

- Token Holders
- Token Info

見るポイント:

- holder 数が少なすぎないか
- 上位ホルダーの保有額や保有比率が極端すぎないか
- holder データが取れているか
- holders が少ない場合は early ではあるが、リスクとして扱う

### G4 Risk Check

目的は、初期候補として危険すぎるものを下げること。

見るポイント:

- market cap が小さすぎないか
- market cap が大きすぎて初期候補として遅すぎないか
- liquidity が低すぎないか
- token age が若すぎないか
- 30d netflow が大きくマイナスではないか
- DEX Trades で売り金額が買い金額を大きく上回っていないか

## 保存するシグナル項目

- 検知日時
- チェーン
- トークン名
- シンボル
- トークンアドレス
- Dexscreener URL
- G0 Discovery score
- Deep score
- final score
- confidence
- market cap
- liquidity
- holders
- 24h netflow
- 7d netflow
- 30d netflow
- Flow Intelligence 推定ネットフロー
- DEX 買い件数
- DEX 売り件数
- DEX 買い金額
- DEX 売り金額
- Gate 通過状況
- 良い点
- 注意点
- 最終更新日時

## スコアリング案

### Early Signal Scan

`!scan solana` の簡易スコアは100点満点。

- 24h netflow がプラスなら最大25点
- 7d netflow がプラスなら最大20点
- 24h netflow / market cap の比率が高いなら最大20点
- trader_count が5以上なら最大10点
- market cap が低すぎず高すぎないなら最大15点
- token_age_days が若すぎないなら最大10点

### Deep Radar

Deep Radar は、複数データの整合性を見て100点満点で評価する。

- G1 Flow Signal
- G2 Buyer Quality
- G3 Holder Conviction
- G4 Risk Check

Smart Money netflow 上位に未検出の場合、Deep Score の上限を下げる。DEX Trades で売り金額が買い金額を大きく上回る場合も減点する。

confidence は次の4段階。

- high
- medium
- low
- risky

netflow 上位未検出、DEX売り優勢、Token Info不足などがある場合は confidence を下げる。

### Alpha Radar

`!radar solana` は G0 Discovery と Deep Radar を統合する。

- finalScore = G0 Discovery score 40% + Deep score 60%
- Deep confidence が high なら少し加点
- Deep confidence が risky なら大きめに減点
- DEX売り優勢なら減点
- Token Info が取れていない候補は confidence を下げる
- Smart Money netflow 上位未検出だけでは除外しないが、confidence を下げる

## false positiveを減らすための注意点

- 価格急騰後だけに反応しない
- 流動性が薄すぎるトークンを高評価しない
- 単一ウォレットの大口移動だけで強いシグナル扱いしない
- CEX 入出金、ブリッジ、内部移動を買いシグナルと誤認しない
- ステーブルコイン、ラップドトークン、大型銘柄の通常フローを過大評価しない
- 短時間で連続通知しないようにクールダウンを入れる
- スコアの根拠と注意点を Discord に必ず表示する

## APIクレジット節約方針

- 最初に軽い G0 Discovery を実行する
- Token Info の補完は上位候補に限定する
- Deep 分析は上位候補だけに実行する
- `!radar solana` は G0 上位5件だけを Deep 分析に回す
- 低スコア候補に高コストな追加分析を実行しない
- 取得結果を `data/*.json` に保存し、将来的にはキャッシュも検討する
- 手動コマンドには必要に応じてレート制限を入れる
- 失敗時のリトライ回数を制限する

## Discord表示方針

Discord 通知は、短く見やすい Embed を基本にする。

- タイトルにレーダー名、シンボル、スコアを入れる
- 説明文には「投資助言ではないにゃ」を入れる
- 上位候補だけを表示する
- 数字は `$18M`、`$367K` のように読みやすく丸める
- 良い点と注意点を両方表示する
- Dexscreener は Markdown リンクで表示する
- Deep 分析に進めるように `!deep solana TOKEN_ADDRESS` を表示する
- G0 Discovery では Deep分析ボタンも表示する
- エラーや内部ログは Discord に出しすぎない

## 投資助言ではない注意書き

しえすたんBotが表示する内容は、オンチェーンデータに基づく調査補助情報であり、投資助言ではない。

通知されたトークンの購入、売却、保有を推奨するものではない。最終的な判断は、ユーザー自身の調査と責任で行う。
