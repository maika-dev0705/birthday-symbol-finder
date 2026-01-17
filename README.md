# 誕生シンボル・ファインダー

誕生花・誕生石・誕生色などの「誕生○○」をまとめて見られて、キーワード逆引きもできる日本語向けツールです。

## 必要環境

- Node.js（LTS）
- Python 3（データ更新用）

## セットアップ

```bash
npm install
```

`.env.local` をプロジェクト直下に作成:

```
OPENAI_API_KEY=your_api_key
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small
OPENAI_SEMANTIC_MODEL=gpt-5-nano
ALLOWED_ORIGINS=https://example.com,https://www.example.com
```

## 起動

```bash
npm run dev
```

## 本番データ運用

- `content/README.md`: content内のファイル説明・運用メモ
- `content/app-config.js`: 表示や検索の調整パラメータ
- `content/birthdata.json`: 誕生○○の本番データ（366日）
- `content/meta.json`: カテゴリ定義
- `content/embeddings.json`: 逆引き検索用 embeddings（ビルド時に自動生成 / Git管理しない）
- `content/category-images.json`: カテゴリ背景画像の一覧（任意）

### 更新手順

1) データ更新（必要に応じて）
   - `python scripts/fetch-oiwai-data.py`
2) embeddings 再生成（ローカル確認したい場合）
   - `npm run embed`
   - ※Vercelでは `npm run build` の中で自動生成されます
3) 誕生色のカラーコード補完（必要に応じて）
   - `python scripts/enrich-color-codes.py`

## 運用メモ

- データ更新後は再デプロイする（ビルド時に embeddings が再生成される）
- ローカルで検索を確認したい場合は `npm run embed` を実行する
- 画面上には出典を表示しない（内部保持のみ）

## 更新履歴 / お知らせの更新

`/support` の「更新履歴 / お知らせ」は `content/support-updates.json` を編集して更新します。

1) `content/support-updates.json` を開く  
2) `items` に1件追加（新しい日付を上に積む）  
3) 改行したい場合は本文に `\n` を入れる

例:

```json
{
  "date": "2025/06/15",
  "title": "お知らせ",
  "body": "アクセスが集中した場合は、\n文章検索の制限を検討します。"
}
```

## 将来の有料化設計

有料化の設計メモは `docs/paid-plan.md` にまとめています。  
（Supabase + Googleログイン + Stripe 前提）

## APIのOrigin制限

外部サイトからのブラウザ経由アクセスを抑止するため、APIにOrigin制限を入れています。

- 開発時の許可リスト（デフォルト）:
  - `http://localhost:3000`
  - `http://127.0.0.1:3000`
- `ALLOWED_ORIGINS` に本番URLを追加できます（カンマ区切り）。
- 開発時は `Origin` ヘッダーが無いリクエストを許可します（手動検証やcurl向け）。

`ALLOWED_ORIGINS` は秘密情報ではないため、`.env.local` での管理で問題ありません。
本番ではホスティング側の環境変数に設定する運用がおすすめです。

### 本番判定の簡易チェック
本番で `NODE_ENV=production` が効いているか確認したい場合は、以下で検証できます。

1) 本番URLで `Origin` を偽装してAPIを叩く
```bash
curl -H "Origin: https://example.com" "https://あなたのURL/api/date?month=1&day=1"
```
- **403 にならなければ**「本番なのに開発扱い」になっている可能性があります。

2) 一時的にログを出す（確認後に削除）
- `console.log(process.env.NODE_ENV)` を追加し、本番ログで `production` が出るか確認します。

## 本番チェックリスト

- `OPENAI_API_KEY` を本番環境変数に設定
- `OPENAI_CHAT_MODEL` / `OPENAI_EMBED_MODEL` / `OPENAI_SEMANTIC_MODEL` の設定確認
- `ALLOWED_ORIGINS` に本番URLを追加

## キーワード検索のスコアと判定基準

### スコアの計算方法

- 対象: その日の全カテゴリ・全項目
- キーワード上限: `content/app-config.js` の `MAX_KEYWORDS`（初期 5件）
- 1キーワード × 1項目の点数は次のどちらか大きい方
  - 完全一致点: 2点（名前/意味文にテキスト一致）
  - 意味一致点: embeddings の類似度に基づく点数（2点満点）
- 1日のスコアは「全キーワード × 全項目の点数の合計」
- ただし一致％が閾値未満の項目は合計に含めない

### 意味一致点（embeddings）

- 類似度は cosine similarity
- しきい値: `content/app-config.js` の `EMBEDDING_THRESHOLD` 以上のみ評価
- 正規化: `EMBEDDING_THRESHOLD〜SEMANTIC_SIMILARITY_MAX` を `0〜1` に変換し、`SEMANTIC_SIMILARITY_CURVE` 乗で持ち上げ
- 点数化: `正規化値 × 2`（2点満点）
- LLM補正係数: `0.4〜1.5` の範囲で乗算（0.4未満は0.4に丸め）
- LLM補正の結果、意味一致点が2点を超えることがあります（最大3点）

### 一致％の表示ルール

- 完全一致: 常に `100%一致`
- 意味一致: `意味一致点 ÷ 2 × 100` を％化（最大100%）
- 表示・判定閾値: `30%` 未満は表示しない
- 30%未満しか一致がない項目は検索結果からも除外
- 意味文側の一致表示は「最も高い1件のみ」

### 調整ポイント

- 表示/判定閾値: `content/app-config.js` の `MATCH_PERCENT_MIN`
- embeddings しきい値: `content/app-config.js` の `EMBEDDING_THRESHOLD`
- 正規化の上限とカーブ: `content/app-config.js` の `SEMANTIC_SIMILARITY_MAX` と `SEMANTIC_SIMILARITY_CURVE`

## カテゴリ背景画像（任意）

カテゴリの背景に写真をうっすら表示できます。画像は `public/` に置き、`content/category-images.json` で管理します。

### 追加手順（URLリストから自動取り込み）

`content/category-image-urls.json` にURLリストを用意して、取り込みコマンドで更新します。

### 表示仕様

- 各カテゴリで画像をランダムに1枚選び、背景に薄く表示
- 背景の薄さは `app/globals.css` の `.category--visual::before` の `opacity` で調整
- 現在はグレーアウト（モノクロ化）はしていない
- 背景画像は中央合わせ（`background-position: center`）
- 誕生色はカラーコードがある場合、背景色として使用

1) `content/category-image-urls.json` を編集（カテゴリキーごとにURLを並べる）
   - 無い場合は新規作成
2) 取り込み実行

```bash
python scripts/import-category-images.py
```

このコマンドは以下を行います。
- URLから画像をダウンロード
- 横幅1200pxにリサイズしたJPGを保存
- WebPに変換して保存
- `content/category-images.json` を更新

※ URLは Pixabay の写真ページを想定しています。  
※ クレジット表示は行わないため、写真家名は空でも問題ありません。  
※ 既存の `category-images.json` を残し、URLリストに追加された分だけ追記されます。  
※ 作り直したい場合は `content/category-images.json` と `public/images/categories` を削除してください。  
※ ImageMagick が必要です。

### ImageMagick インストール（Windows）

1) https://imagemagick.org/ にアクセス  
2) Windows 用のインストーラーをダウンロード  
3) セットアップ時に「Add application directory to your system path」にチェック  
4) PowerShell を開き `magick -version` で確認

### 一括変換（JPG -> WebP）

リサイズなしで変換する場合の例です。

```powershell
Get-ChildItem -Recurse -Filter *.jpg -Path public\images\categories |
  ForEach-Object {
    $out = $_.FullName -replace '\.jpg$', '.webp'
    magick $_.FullName -quality 80 $out
  }
```

変換後は `content/category-images.json` の拡張子を `.webp` に更新してください。
