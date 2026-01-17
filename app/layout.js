import "./globals.css";

export const metadata = {
  title: "誕生○検索ツール｜創作キャラに合う誕生日を提案",
  description: "誕生花・誕生石・誕生色などを一画面で確認できるツール",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
