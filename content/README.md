# content フォルダの使い方

このフォルダには「運用で触るファイル」をまとめています。基本的にここだけ編集すればOKです。
JSONは末尾カンマ不可なので注意してください。

## ファイル一覧

- `app-config.js`
  - UI/入力/検索/LLM/レート制限などの調整パラメータ集です。
  - 例: `MAX_KEYWORDS`（キーワード数上限）, `MAX_TEXT_CHARS`（文章検索の文字数上限）, `MATCH_PERCENT_MIN`（一致表示の閾値）

- `birthdata.json`
  - 366日分の誕生○○データです。
  - 更新後は embeddings を再生成してください（ローカル確認: `npm run embed` / 本番はビルド時に自動生成）。

- `meta.json`
  - アプリ名や見出し文、カテゴリ定義（表示名・順序など）を管理します。
  - 例: `appName`, `heroSubtitle`, `aiNotice`

- `embeddings.json`
  - 逆引き検索用の埋め込みデータです。
  - `npm run embed` で生成・更新します（本番はビルド時に自動生成 / 手動編集は不要）。

- `category-image-urls.json`
  - 背景画像のURL一覧です（カテゴリごと）。
  - `python scripts/import-category-images.py` を実行すると画像が取り込まれます。

- `category-images.json`
  - 取り込み済み画像の一覧です。
  - 通常は自動生成されるため、直接編集は不要です。

- `fake-facts.json`
  - 処理中の「嘘知識」テキストを管理します。
  - 配列の文言を入れ替えるだけで反映されます。

- `support-updates.json`
  - `/support` の「更新履歴 / お知らせ」に表示する内容です。
  - `items` に追加し、最新を上に並べます。改行は `\n` を使用します。

## よく使う調整例

- 表示件数を変えたい
  - `app-config.js` の `RESULT_LIMIT` / `PAGE_SIZE`

- キーワード数や文字数の上限を変えたい
  - `app-config.js` の `MAX_KEYWORDS` / `MAX_KEYWORD_CHARS` / `MAX_TEXT_CHARS`

- 一致の厳しさを調整したい
  - `app-config.js` の `MATCH_PERCENT_MIN` / `EMBEDDING_THRESHOLD`

- キーワードの順序やカバレッジ補正を調整したい
  - `app-config.js` の `KEYWORD_WEIGHT_MIN` / `COVERAGE_BONUS`

- 処理中の嘘知識の切り替え速度を変えたい
  - `app-config.js` の `FACT_INTERVAL_MS` / `FACT_FADE_MS`
