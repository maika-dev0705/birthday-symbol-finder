# Vercel再デプロイ手順メモ
このファイルは、今後ファイルを更新したときに再デプロイする手順を残すためのメモです。

## 基本：Git pushで自動デプロイ
1. 変更を確認
   - `git status -sb`
2. ファイルを追加
   - 特定ファイルだけなら `git add <ファイル>`
   - まとめて追加するなら `git add .`
3. コミット
   - `git commit -m "Update content"`
4. プッシュ
   - `git push`

→ GitHubへの push が完了すると、Vercelが自動でデプロイします。

## 手動：Vercelで再デプロイ
1. Vercel のプロジェクト画面を開く
2. 上部メニューの **Deployments** を開く
3. 直近のデプロイを選んで **Redeploy**

## 注意点
- 環境変数を変更した場合も、再デプロイが必要です。
- `npm run build` の中で embeddings が自動生成されます。
- `content/embeddings.json` は Git 管理しません。
