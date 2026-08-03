import Image from 'next/image';
import Link from 'next/link';

import {
  LegalUnavailable,
  PublicInfoPage,
} from '../_components/public-info-page';
import { loadLegalConfig } from '../../config/legal-config';

export const dynamic = 'force-dynamic';

export default async function AboutPage() {
  let config;
  try {
    config = await loadLegalConfig();
  } catch {
    return <LegalUnavailable title="关于我们" />;
  }

  return (
    <PublicInfoPage
      title="关于小蓝书"
      eyebrow="关于我们"
      description="发现、分享并连接更懂你的男性兴趣社区。"
      wide
    >
      <section className="about-hero">
        <Image
          src="/brand/littlebluebook-logo.svg"
          alt="小蓝书"
          width={180}
          height={80}
        />
        <div>
          <h2>小蓝书 Web 内容社区</h2>
          <p>
            小蓝书是一款聚焦男性社区方向的 Web
            内容社区。用户可以通过邮箱账号发布图片笔记、浏览频道、搜索内容与用户，并通过点赞、收藏、评论、回复、关注、通知和互相关注私信参与社区。
          </p>
        </div>
      </section>
      <section className="about-links" aria-label="相关信息">
        <a href="/terms" target="_blank" rel="noopener noreferrer">
          用户协议
        </a>
        <a href="/privacy" target="_blank" rel="noopener noreferrer">
          隐私政策
        </a>
        <Link href="/help">帮助与反馈</Link>
      </section>
      <section className="about-operator">
        <h2>运营信息</h2>
        <p>运营主体：{config.operator.displayName}</p>
        <p>
          联系邮箱：
          <a href={`mailto:${config.contact.email}`}>{config.contact.email}</a>
        </p>
      </section>
    </PublicInfoPage>
  );
}
