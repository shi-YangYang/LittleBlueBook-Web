import {
  LegalUnavailable,
  PublicInfoPage,
} from '../_components/public-info-page';
import { loadLegalPageData } from '../../config/legal-page-data';

export const dynamic = 'force-dynamic';

const sections = [
  ['scope', '一、协议范围与生效'],
  ['service', '二、服务内容'],
  ['account', '三、账号与安全'],
  ['age', '四、年龄要求'],
  ['content', '五、用户内容与行为规范'],
  ['license', '六、知识产权与内容许可'],
  ['governance', '七、违规处理与投诉'],
  ['availability', '八、服务变更与责任边界'],
  ['updates', '九、协议更新与终止'],
  ['law', '十、适用法律与争议解决'],
  ['contact', '十一、联系我们'],
] as const;

export default async function TermsPage() {
  let data;
  try {
    data = await loadLegalPageData();
  } catch {
    return <LegalUnavailable title="用户协议" />;
  }
  const { config, versions } = data;

  return (
    <PublicInfoPage
      title="小蓝书用户协议"
      eyebrow="用户协议"
      description="请在注册、登录或继续使用小蓝书前仔细阅读本协议。"
      meta={
        <>
          <span>版本：{versions.termsVersion}</span>
          <span>生效日期：{config.legal.effectiveDate}</span>
          <span>运营主体：{config.operator.displayName}</span>
        </>
      }
    >
      <article className="legal-document">
        <nav className="legal-toc" aria-label="用户协议目录">
          <h2>目录</h2>
          <ol>
            {sections.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <section id="scope">
          <h2>一、协议范围与生效</h2>
          <p>
            本协议由你与{config.operator.displayName}
            就“小蓝书”Web
            内容社区服务的使用订立。你主动勾选同意并完成邮箱验证、注册或登录流程后，本协议对双方生效；仅打开本页面不代表同意。
          </p>
          <p>
            小蓝书会记录你接受的协议版本、隐私政策版本、接受场景和服务端时间，以便识别当前会话是否满足最新条款要求。
          </p>
        </section>

        <section id="service">
          <h2>二、服务内容</h2>
          <p>
            小蓝书是聚焦男性社区方向的 Web
            内容社区，当前提供邮箱账号、个人资料、图片笔记发布与浏览、频道、搜索、点赞、收藏、评论和回复、关注、通知及互相关注用户之间的私信等功能。
          </p>
          <p>
            我们可能根据产品运行、安全或法律要求调整功能、交互和服务范围，并会以合理方式告知对用户权利义务有实质影响的变化。本协议不承诺提供
            App 端、永久不变的功能或不间断服务。
          </p>
        </section>

        <section id="account">
          <h2>三、账号与安全</h2>
          <p>
            账号通过邮箱验证码注册和登录，不设置密码。你应提供本人有权使用的邮箱，妥善保护邮箱账号、验证码、会话
            Cookie 和设备安全，不得转让账号或协助他人绕过访问控制。
          </p>
          <p>
            验证码仅在限定时间内有效，连续错误或重新发送会使旧验证码失效。发现异常登录或账号被冒用时，请立即停止相关操作并通过本协议末尾的联系方式告知我们。
          </p>
        </section>

        <section id="age">
          <h2>四、年龄要求</h2>
          <p>
            当前版本仅向年满 14
            周岁的用户提供服务。勾选协议同时表示你声明自己已经年满 14 周岁。未满
            14
            周岁的用户不得注册或使用当前版本服务，我们不提供监护人代为同意的绕过流程。
          </p>
          <p>
            如果资料或其他可靠信息表明账号未达到年龄要求，我们可以限制账号继续公开资料或新增内容和互动，并通过联系渠道处理相关信息的删除或匿名化。
          </p>
        </section>

        <section id="content">
          <h2>五、用户内容与行为规范</h2>
          <p>
            你应对昵称、头像、简介、笔记、图片、评论、回复和私信等由你提交的内容负责，并确保拥有必要权利。不得发布或传播违法、有害、侵权、欺诈、骚扰、仇恨、恶意误导或侵犯他人隐私的内容。
          </p>
          <p>
            不得使用恶意自动化、批量账号、接口滥用、漏洞利用、绕过权限、干扰网络或其他方式破坏小蓝书、用户或第三方的安全与正常使用。
          </p>
        </section>

        <section id="license">
          <h2>六、知识产权与内容许可</h2>
          <p>
            你对自己依法享有权利的内容保留原有知识产权。为提供服务，你授予小蓝书非独占、免费的必要许可，仅限于对内容进行存储、复制、展示、分发、提供产品功能和进行与小蓝书有关的产品宣传。
          </p>
          <p>
            你删除内容后，我们停止新增使用；法律要求留存、合理缓存或备份，以及删除前已经完成的宣传材料不受影响。该许可不是无限授权，也不转移你的内容所有权。
          </p>
          <p>
            小蓝书名称、Logo、界面和自有程序等权益归相应权利人所有，除正常使用服务外，未经许可不得复制或冒用。
          </p>
        </section>

        <section id="governance">
          <h2>七、违规处理与投诉</h2>
          <p>
            对违反法律、本协议或损害安全的行为，我们可以结合情节采取提醒、删除或限制内容、限制功能、暂停账号或终止服务等必要措施。处理时会尽量考虑行为性质、影响和可纠正程度。
          </p>
          <p>
            如你认为内容侵犯合法权益，或对账号限制有异议，可通过联系邮箱提交具体说明和必要证明。为避免误处理，我们可能要求进行合理身份或权利核验。
          </p>
        </section>

        <section id="availability">
          <h2>八、服务变更与责任边界</h2>
          <p>
            系统维护、网络故障、不可抗力、第三方邮件或托管服务异常等可能造成延迟或中断。我们会在合理能力范围内维护服务和数据安全，但互联网服务无法保证绝对连续、无错误或绝对安全。
          </p>
          <p>
            对依法不能排除或限制的责任，本协议不作排除。你与第三方之间因内容、交易或其他关系产生的争议，应由相关责任方依法承担责任。
          </p>
        </section>

        <section id="updates">
          <h2>九、协议更新与终止</h2>
          <p>
            错别字、排版或不改变权利义务的澄清可能不提升版本。发生实质更新时，我们会提升版本，并要求已有用户在继续执行受保护操作前重新确认。你不同意更新时，可以退出登录并停止使用相关服务。
          </p>
          <p>
            你可以停止使用服务。当前版本尚未提供站内账号注销闭环，如需提出删除、撤回同意或其他权利请求，请通过联系邮箱办理并接受必要身份核验。
          </p>
        </section>

        <section id="law">
          <h2>十、适用法律与争议解决</h2>
          <p>
            本协议适用中华人民共和国大陆地区法律。争议发生后，双方应先友好协商；协商不成的，任何一方可以向依法有管辖权的人民法院提起诉讼。
          </p>
        </section>

        <section id="contact">
          <h2>十一、联系我们</h2>
          <p>
            运营主体：{config.operator.displayName}
            <br />
            联系邮箱：
            <a href={`mailto:${config.contact.email}`}>
              {config.contact.email}
            </a>
            <br />
            生效日期：{config.legal.effectiveDate}
          </p>
        </section>
      </article>
    </PublicInfoPage>
  );
}
