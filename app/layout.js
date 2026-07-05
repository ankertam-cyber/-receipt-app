import './globals.css';

export const metadata = {
  title: '單據管理與報銷系統',
  description: 'Next.js 智能單據與報銷系統',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
