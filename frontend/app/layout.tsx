import type { Metadata } from 'next';

import './globals.css';
import { LegalAcceptanceGate } from './_components/legal-acceptance-gate';

export const metadata: Metadata = {
  title: '小蓝书',
  description: '小蓝书，发现更懂你的男性兴趣社区',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <LegalAcceptanceGate />
      </body>
    </html>
  );
}
