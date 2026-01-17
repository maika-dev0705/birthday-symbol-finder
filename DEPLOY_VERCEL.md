# Vercel 公開手順（暫定メモ）
このファイルは一時的な確認用メモです。公開完了後に削除予定。

## 前提
- Node.js がインストール済み
- リポジトリを GitHub に push 済み
- OpenAI の API キーを所持

## 公開までの流れ（おすすめ）
1. ローカルでビルド確認
   - `npm run build` が通ることを確認
2. Vercel にログインし、新規プロジェクト作成
   - GitHub のリポジトリを選択
3. 環境変数を登録
   - `OPENAI_API_KEY`
   - `OPENAI_CHAT_MODEL`
   - `OPENAI_SEMANTIC_MODEL`
   - `OPENAI_EMBED_MODEL`
   - `ALLOWED_ORIGINS`（本番URLを含める）
4. Deploy を実行
   - 初回デプロイ完了後、表示確認
5. 本番URLを `ALLOWED_ORIGINS` に追加して再デプロイ

## メモ
- データ更新は「更新 → 再デプロイ」で反映
- `npm run build` 実行時に embeddings を生成します
- `content/embeddings.json` は Git 管理しない
