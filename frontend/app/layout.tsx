import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '小蓝书',
  description: '小蓝书 Web 工程基础',
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
