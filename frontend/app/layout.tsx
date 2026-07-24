import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '小蓝书',
  description: '小蓝书，发现更懂你的男性兴趣社区',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
