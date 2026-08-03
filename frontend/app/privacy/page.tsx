import {
  LegalUnavailable,
  PublicInfoPage,
} from '../_components/public-info-page';
import { loadLegalPageData } from '../../config/legal-page-data';

export const dynamic = 'force-dynamic';

const sections = [
  ['controller', '一、适用范围与处理者'],
  ['collection', '二、我们处理的信息'],
  ['purpose', '三、处理目的与必要性'],
  ['cookies', '四、Cookie 与会话'],
  ['providers', '五、服务提供者'],
  ['sharing', '六、共享、转移与公开披露'],
  ['storage', '七、存储与跨境情况'],
  ['retention', '八、保存规则'],
  ['security', '九、安全措施'],
  ['rights', '十、你的权利'],
  ['minor', '十一、年龄限制'],
  ['updates', '十二、政策更新'],
  ['contact', '十三、联系我们'],
] as const;

export default async function PrivacyPage() {
  let data;
  try {
    data = await loadLegalPageData();
  } catch {
    return <LegalUnavailable title="隐私政策" />;
  }
  const { config, versions } = data;

  return (
    <PublicInfoPage
      title="小蓝书隐私政策"
      eyebrow="隐私政策"
      description="本政策说明小蓝书当前 Web 服务如何处理个人信息。"
      meta={
        <>
          <span>版本：{versions.privacyVersion}</span>
          <span>生效日期：{config.legal.effectiveDate}</span>
          <span>个人信息处理者：{config.operator.displayName}</span>
        </>
      }
    >
      <article className="legal-document">
        <nav className="legal-toc" aria-label="隐私政策目录">
          <h2>目录</h2>
          <ol>
            {sections.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <section id="controller">
          <h2>一、适用范围与处理者</h2>
          <p>
            本政策适用于小蓝书当前 Web 内容社区。个人信息处理者为
            {config.operator.displayName}，联系邮箱为
            <a href={`mailto:${config.contact.email}`}>
              {config.contact.email}
            </a>
            。
          </p>
          <p>
            本政策只描述已经实现的处理活动，不代表已经完成备案、许可、个人信息出境申报或其他需要结合实际运营条件办理的程序。
          </p>
        </section>

        <section id="collection">
          <h2>二、我们处理的信息</h2>
          <h3>1. 账号与验证信息</h3>
          <p>
            包括邮箱、昵称、小蓝书号、验证码的安全哈希、验证码尝试和限流状态、一次性注册凭证、登录会话标识、最近登录时间，以及你接受的用户协议与隐私政策版本、场景和服务端时间。
          </p>
          <h3>2. 个人资料</h3>
          <p>
            包括头像、性别、出生日期、由出生日期计算的年龄、是否公开年龄、个人简介和资料并发版本。公开页面不会展示完整出生日期和邮箱。
          </p>
          <h3>3. 内容与社区互动</h3>
          <p>
            包括笔记标题和正文、图片及其技术元数据、频道、评论与回复、点赞、收藏、关注关系、通知、浏览次数，以及完成去重所需的不可逆主体标识。
          </p>
          <h3>4. 私信</h3>
          <p>
            包括互相关注用户之间的会话关系、纯文本消息、服务端时间、最后已读边界、未读状态和用于避免网络重试重复发送的客户端请求标识。
          </p>
          <h3>5. 设备与运行数据</h3>
          <p>
            为保障服务和诊断异常，服务器可能处理必要的 IP
            地址、请求时间、请求路径、状态码、浏览器发送的 Cookie
            和基础请求信息。匿名笔记浏览使用随机 Cookie，经不可逆处理后参与 30
            分钟去重；数据库和业务日志不保存该 Cookie
            原值、设备指纹或用于浏览去重的原始 IP。
          </p>
        </section>

        <section id="purpose">
          <h2>三、处理目的与必要性</h2>
          <ul>
            <li>
              邮箱、验证码和会话用于创建账号、验证身份、保持登录和防止滥用；
            </li>
            <li>
              昵称、小蓝书号、头像和个人资料用于展示社区身份和提供资料设置；
            </li>
            <li>笔记、媒体和频道用于发布、存储、检索和展示内容；</li>
            <li>互动、关注和通知用于实现社区关系、反馈和消息提醒；</li>
            <li>私信及已读边界用于向互相关注用户提供一对一通信和同步；</li>
            <li>浏览去重信息用于提供相对稳定的有效浏览次数，而非广告画像；</li>
            <li>请求与安全数据用于访问控制、限流、故障排查和保护服务安全。</li>
          </ul>
          <p>
            当前不出售个人信息，不为广告建立用户画像，也不把 Redis
            用作本政策新增的内容缓存、互动计数或私信持久化位置。
          </p>
        </section>

        <section id="cookies">
          <h2>四、Cookie 与会话</h2>
          <p>
            登录会话 Cookie 为 HttpOnly、SameSite=Lax，固定有效期最长 30
            天，退出当前设备后删除对应服务端会话。邮箱验证后的临时注册 Cookie
            最长有效 10 分钟。匿名浏览去重 Cookie
            最长有效一年，仅用于笔记详情浏览去重。
          </p>
          <p>
            邮箱验证码最长有效 10
            分钟，新验证码会使旧验证码失效；连续错误达到限制也会使其失效。浏览器限制
            Cookie 可能影响登录、注册或浏览去重，但公开内容仍应尽量可访问。
          </p>
        </section>

        <section id="providers">
          <h2>五、服务提供者</h2>
          <p>
            当前通过网易 163 SMTP
            服务发送邮箱验证码，并依赖服务器、网络、数据库和本地持久化存储等托管基础设施提供
            Web 服务。服务提供者仅在完成相应技术服务所需范围内处理信息。
          </p>
          <p>
            当前没有接入广告、跨站画像或第三方统计
            SDK。未来新增会改变个人信息处理目的或范围的提供者时，应更新本政策并按需要重新取得确认。
          </p>
        </section>

        <section id="sharing">
          <h2>六、共享、转移与公开披露</h2>
          <p>
            我们不会随意向第三方提供个人信息。为发送验证码或托管服务而进行的委托处理，以实现必要功能为限；发生主体变更、合并或资产转移时，将依法告知并要求承接方继续受本政策约束。
          </p>
          <p>
            你主动公开的昵称、头像、简介、笔记、评论、回复和互动统计会向其他访问者展示。私信、邮箱和完整出生日期不属于公开资料。根据法律程序或保护人身、财产和系统安全确有必要时，我们可能依法提供相关信息。
          </p>
        </section>

        <section id="storage">
          <h2>七、存储与跨境情况</h2>
          <p>
            当前已确认的初期生产服务器计划位于境外，实际服务器国家或地区、服务商和数据流仍需在正式上线前完成单独评估，并根据届时事实履行适用的个人信息出境程序。本页面不声称相关程序已经完成。
          </p>
          <p>
            在具体部署条件未最终确认前，如实际存储地点或跨境处理方式发生变化，我们会据实更新政策；对用户权益有实质影响的更新将提升版本并要求重新确认。
          </p>
        </section>

        <section id="retention">
          <h2>八、保存规则</h2>
          <p>
            验证码和临时注册凭证按上述短期时限删除；会话在固定期限届满或退出后失效。账号、资料、内容、互动、通知和条款接受历史在提供服务、解决争议和履行法定义务所需期间保存。
          </p>
          <p>
            当前私信永久保留，尚不支持用户自行删除消息或会话；账号也尚无站内注销入口。你可通过联系邮箱提出删除等请求，我们会在完成必要身份核验并考虑法定留存、备份和他人权益后处理。
          </p>
        </section>

        <section id="security">
          <h2>九、安全措施</h2>
          <p>
            我们采用 HttpOnly Cookie、同源与 Origin
            校验、服务端会话、访问控制、数据库约束、最小化响应、验证码哈希、必要日志脱敏和备份等措施降低风险，并在发现安全事件时进行排查、限制影响和依法处置。
          </p>
          <p>
            互联网和软件系统无法保证绝对安全。请勿向 GitHub Issues
            等公开渠道提交验证码、授权码、会话 Cookie、身份证件或私信内容。
          </p>
        </section>

        <section id="rights">
          <h2>十、你的权利</h2>
          <p>
            你可以在资料设置中查阅、更正或补充部分账号资料。对于查阅、复制、更正、补充、删除个人信息、撤回同意、解释处理规则或其他法定请求，可发送邮件至
            <a href={`mailto:${config.contact.email}`}>
              {config.contact.email}
            </a>
            。
          </p>
          <p>
            为保护账号和他人信息，我们可能要求进行必要身份核验。撤回同意不影响撤回前基于有效同意进行的处理；若必要信息无法继续处理，相应账号或功能可能无法继续提供。
          </p>
        </section>

        <section id="minor">
          <h2>十一、年龄限制</h2>
          <p>
            当前版本仅允许年满 14
            周岁的用户使用，不处理监护人代为同意流程。若发现用户未满 14
            周岁，我们将限制账号继续公开资料或新增内容与互动，并在合理核验后删除或匿名化不应继续处理的信息，法律另有要求的除外。
          </p>
        </section>

        <section id="updates">
          <h2>十二、政策更新</h2>
          <p>
            不改变处理目的或用户权利的排版、错别字修订可能不提升版本。新增处理目的、重要数据类别、跨境安排或其他实质变化时，我们会提升版本；已有会话在执行受保护写操作前需要重新确认。历史接受记录用于证明所接受的版本，不会因新版本发布而覆盖。
          </p>
        </section>

        <section id="contact">
          <h2>十三、联系我们</h2>
          <p>
            个人信息处理者：{config.operator.displayName}
            <br />
            联系及投诉邮箱：
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
