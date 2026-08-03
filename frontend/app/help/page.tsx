import {
  LegalUnavailable,
  PublicInfoPage,
} from '../_components/public-info-page';
import { loadLegalConfig } from '../../config/legal-config';

export const dynamic = 'force-dynamic';

const faqs = [
  [
    '获取不到邮箱验证码怎么办？',
    '请检查邮箱格式和垃圾邮件目录，并等待 60 秒后重试。验证码 10 分钟内有效；频繁请求或连续输入错误达到限制后，需要稍后重新获取。',
  ],
  [
    '登录状态可以保持多久？',
    '登录会话自登录成功起固定有效 30 天，不会因访问自动延期。退出登录只结束当前设备会话。',
  ],
  [
    '怎样发布笔记？',
    '登录后点击左侧“发布”，选择 1～9 张符合要求的图片，填写标题、正文并选择频道后发布。',
  ],
  [
    '频道中的内容怎样展示？',
    '发布时选择的频道决定笔记所属频道；首页推荐和频道列表当前都按发布时间倒序展示，不使用推荐算法。',
  ],
  [
    '如何点赞、收藏、评论和关注？',
    '登录后可在笔记卡片或详情中完成互动。可以回复两级评论，但不能点赞自己的评论；关注关系由服务端保存。',
  ],
  [
    '通知包含哪些内容？',
    '通知页展示点赞、收藏、评论、回复、评论点赞和关注等社区互动通知，并支持分类和已读状态。私信不进入通知列表。',
  ],
  [
    '谁可以给我发送私信？',
    '目前只有互相关注的两名用户可以发送一对一纯文本私信。取消互关后历史仍可查看，但不能继续发送。',
  ],
  [
    '如何编辑个人资料？',
    '登录后进入“我”或“更多—编辑资料”，可修改昵称、头像、性别、出生日期、年龄公开状态和简介。当前服务仅支持年满 14 周岁的用户。',
  ],
  [
    '怎样处理隐私或条款问题？',
    '你可以阅读用户协议和隐私政策。查阅、复制、删除、撤回同意或投诉等请求，请使用本页下方的法律联系邮箱。',
  ],
] as const;

export default async function HelpPage() {
  let config;
  try {
    config = await loadLegalConfig();
  } catch {
    return <LegalUnavailable title="帮助与反馈" />;
  }

  return (
    <PublicInfoPage
      title="帮助与反馈"
      eyebrow="帮助中心"
      description="先查看常见问题；仍未解决时，可以通过公开 Issue 或法律联系邮箱反馈。"
      wide
    >
      <section className="faq-list" aria-label="常见问题">
        {faqs.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      <section className="feedback-panel">
        <h2>产品问题与建议</h2>
        <p>
          GitHub Issues 是公开渠道。请勿提交邮箱验证码、SMTP 授权码、会话
          Cookie、身份证件、私信内容或其他敏感信息。
        </p>
        <a
          href="https://github.com/shi-YangYang/LittleBlueBook-Web/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="在新标签页前往 GitHub Issues 反馈"
        >
          前往 GitHub Issues 反馈
        </a>
      </section>
      <section className="feedback-panel">
        <h2>隐私与法律请求</h2>
        <p>如需提出隐私权利请求、条款咨询或投诉，请联系：</p>
        <a href={`mailto:${config.contact.email}`}>{config.contact.email}</a>
      </section>
    </PublicInfoPage>
  );
}
