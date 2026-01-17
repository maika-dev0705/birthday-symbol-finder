# 有料化設計メモ（Supabase / Googleログイン / Stripe）

将来「文章検索のみ有料」を実装するための設計メモです。  
本番公開の初期は**全機能無料**で運用し、後からスイッチで有料化できる構成を想定します。

## 前提

- 認証: Googleログイン（NextAuth想定）
- DB: Supabase
- 決済: Stripe（後日導入）
- 有料対象: 文章検索（/api/keywords）
- 無料対象: キーワード検索（/api/search）

## フェーズ一覧

### フェーズ0: 基盤準備（無料運用の土台）
- [ ] Supabaseプロジェクト作成
- [ ] `users` テーブル作成
- [ ] 環境変数の準備（DB/NextAuth/Google）

### フェーズ1: Googleログイン導入（無料でも利用可能）
- [ ] NextAuth導入
- [ ] Google OAuth 設定
- [ ] ログイン/ログアウトUI
- [ ] ログイン時に `users` へ upsert

### フェーズ2: 有料化スイッチ
- [ ] `PAYWALL_ENABLED` を追加
- [ ] /api/keywords だけ「有料判定」を入れる
- [ ] `PAYWALL_ENABLED=false` の間は全員許可

### フェーズ3: Stripe決済導入（後日）
- [ ] Stripe商品/価格（サブスク）を作成
- [ ] Checkout API（課金開始）
- [ ] Webhook（支払い成功/失敗）
- [ ] `plan_status` 更新

### フェーズ4: 有料化ON
- [ ] `PAYWALL_ENABLED=true`
- [ ] 文章検索は有料ユーザのみ許可

### フェーズ5: 復元/整合性（保険）
- [ ] Stripeからアクティブ購読者を取得
- [ ] DBを再構築できる手順を用意
- [ ] 定期同期（任意）

## Supabaseテーブル設計

`users` テーブル（最小構成）:

```sql
create table if not exists users (
  id text primary key,
  email text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_status text default 'free',
  updated_at timestamptz default now()
);
```

`plan_status` の例:
- `free`
- `active`
- `trialing`
- `canceled`
- `unpaid`

## 環境変数（例）

開発用（.env.local）:

```
DATABASE_URL=...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
PAYWALL_ENABLED=false
```

本番ではホスティング側（Vercel等）に設定する。

## 課金判定の考え方

- **Stripeが正（マスター）**
- DBの `plan_status` は「キャッシュ」
- もしDBが壊れても、Stripeから復元できる

## 有料化ON時のチェックリスト

- [ ] StripeのWebhookが動作している
- [ ] `plan_status` が正しく更新される
- [ ] /api/keywords が有料ユーザのみ許可
- [ ] `PAYWALL_ENABLED=true`

## 注意点

- UIを隠すだけでは不十分。**API側で必ず制限**すること。
- まだ無料運用中でも、将来切替えしやすいように**段階的に実装**する。

