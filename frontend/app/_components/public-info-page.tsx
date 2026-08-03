import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

type PublicInfoPageProps = {
  title: string;
  eyebrow: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  wide?: boolean;
};

export function PublicInfoPage({
  title,
  eyebrow,
  description,
  meta,
  children,
  wide = false,
}: PublicInfoPageProps) {
  return (
    <div className="public-info-page">
      <aside className="public-info-sidebar" aria-label="信息页面导航">
        <Link href="/" aria-label="返回小蓝书首页">
          <Image
            src="/brand/littlebluebook-logo.svg"
            alt="小蓝书"
            width={116}
            height={52}
            priority
          />
        </Link>
        <nav aria-label="公共信息">
          <Link href="/">发现</Link>
          <Link href="/help">帮助与反馈</Link>
          <Link href="/about">关于我们</Link>
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            用户协议
          </a>
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            隐私政策
          </a>
        </nav>
      </aside>
      <main className={`public-info-main ${wide ? 'public-info-wide' : ''}`}>
        <Link className="public-info-back" href="/">
          ← 返回首页
        </Link>
        <header>
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          {description ? <div>{description}</div> : null}
          {meta ? <section className="public-info-meta">{meta}</section> : null}
        </header>
        {children}
      </main>
    </div>
  );
}

export function LegalUnavailable({ title }: { title: string }) {
  return (
    <PublicInfoPage title={title} eyebrow="小蓝书法律信息">
      <section className="public-info-unavailable" role="alert">
        <h2>法律信息暂不可用</h2>
        <p>页面配置尚未完成或当前服务暂不可用，请稍后再试。</p>
        <Link href="/">返回首页</Link>
      </section>
    </PublicInfoPage>
  );
}
