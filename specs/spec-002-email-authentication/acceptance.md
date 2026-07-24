# SPEC-002 验收记录

- Spec：`specs/spec-002-email-authentication/spec.md`
- 当前 Spec 状态：Accepted
- 验收状态：PASS
- 最新验收轮次：第 4 轮

本文件只记录独立验收结果，不修改 `spec.md` 中的需求或验收标准。

用户已于 2026-07-24 明确要求直接创建独立验收 Agent。此前实施 Agent 均已停止，本轮验收 Agent 与其相互独立。

正式验收时，验收 Agent 必须逐项记录 `spec.md` 中 AC-001 至 AC-013 的结论、证据和未通过原因，并保持与实施 Agent 独立。

## 第 1 轮独立验收

- 日期：2026-07-24
- 验收 Agent：`spec002_acceptance_round1_retry`
- 结论：FAIL
- 运行环境：Node.js `v23.11.1`；未调用 NVM，未安装 Node.js、依赖或 Playwright 浏览器，未创建子 Agent。

### 验收标准结论

| 编号 | 结果 | 摘要 |
| --- | --- | --- |
| AC-001 | PASS | 三个桌面宽度分别显示 3、4、5 列，首页入口和品牌符合要求。 |
| AC-002 | PASS | 菜单、频道、本地演示卡片和“功能开发中”反馈符合要求。 |
| AC-003 | PASS | 登录弹窗结构、内容和首页内打开行为符合要求。 |
| AC-004 | PASS | 关闭、遮罩、焦点限制、可访问名称和焦点恢复符合要求。 |
| AC-005 | BLOCKED | 自动化与代码检查通过；真实 163 SMTP 冒烟缺少用户本地轮换后的秘密。 |
| AC-006 | PASS | 验证码哈希、生命周期、错误次数和限流实现及测试通过。 |
| AC-007 | PASS | 已有账号登录、服务端会话和 Cookie 规则通过。 |
| AC-008 | FAIL | 注册凭证过期时前端文案与 Spec 不一致。 |
| AC-009 | PASS | 用户模型、标准化邮箱、唯一约束及无密码规则通过。 |
| AC-010 | PASS | 登录恢复、多设备会话和当前设备退出规则通过。 |
| AC-011 | FAIL | 注册凭证过期错误提示不符合约定文案。 |
| AC-012 | PASS | 配置占位、秘密边界和敏感信息检查通过。 |
| AC-013 | FAIL | SPEC-002 E2E 测试、Firefox/WebKit 和三视口矩阵缺失，现有 E2E 无法启动。 |

### 自动化证据

| 命令或方式 | 结果 | 摘要 |
| --- | --- | --- |
| `pnpm db:validate` | PASS | Prisma Schema 有效。 |
| `pnpm lint` | PASS | 前端、后端和 E2E 通过。 |
| `pnpm typecheck` | PASS | 前端、后端和 E2E 通过。 |
| `pnpm test` | PASS | 前端 12 项、后端 30 项通过。 |
| `pnpm build` | PASS | Next.js 和 NestJS 构建通过。 |
| `pnpm test:e2e` | FAIL | 后端缺少测试环境必需变量，等待 120 秒后超时。 |
| 系统 Chrome 手工检查 | PASS | 三视口布局、弹窗、焦点、协议门禁和模拟登录流程通过。 |

### 必须返工

1. 在 `e2e/` 中交付并由 Git 跟踪 SPEC-002 的登录、注册、会话恢复、多设备退出和核心异常流程测试。
2. 配置 Chromium、Firefox、WebKit 与 1280px、1440px、1920px 的验收矩阵。
3. 为 E2E 后端启动提供安全的测试环境变量、测试数据库迁移和模拟邮件闭环，不发送真实外部邮件。
4. 更新已过期的基础首页 E2E 断言。
5. 将注册凭证过期提示统一为 `验证状态已失效，请重新获取验证码`，并补充对应前端测试。

### 外部复验条件

- 真实 163 SMTP 冒烟需要用户在本地配置轮换后的新授权码，禁止在对话、日志或测试输出中提供该秘密。
- 项目最终仍需在 Node.js 24 环境复验；本轮不得通过反复调用 NVM 或安装第二套 Node.js 处理。
- 当前缺少 Playwright Firefox、WebKit 浏览器二进制；返工应先交付测试源码和配置，实际跨浏览器运行条件不足时必须如实报告。

### 临时文件清理

- `test/spec-002-acceptance-round-1-retry/` 及误生成的 `e2e/test/spec-002-acceptance-round-1-retry/` 中一次性日志和截图均已删除。
- 未创建临时 `node_modules`；仓库现有各级 `node_modules/` 均已保留。

## 第 1 轮返工结果

- 日期：2026-07-24
- 返工 Agent：`spec002_integration_implement`（以新的返工任务重新启动）
- 状态：COMPLETED
- 未创建子 Agent，未调用 NVM，未安装 Node.js、依赖或 Playwright 浏览器。

完成内容：

1. 将注册凭证过期提示统一为 `验证状态已失效，请重新获取验证码`，并补充前端测试。
2. 修复会话状态返回竞态和遮罩点击后 `Esc` 关闭问题。
3. 新增 SPEC-002 登录、注册、恢复、多设备和错误路径 E2E。
4. 配置 Chromium、Firefox、WebKit 与 1280px、1440px、1920px 九项目矩阵。
5. 新增使用 PostgreSQL `55432`、Redis `56379`、测试迁移和内存邮件发送器的自包含 E2E 启动器。
6. 更新过期的基础首页 E2E 断言。

返工自测：

| 检查 | 结果 |
| --- | --- |
| `pnpm db:validate` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS，前端 13 项、后端 30 项 |
| `pnpm test:e2e` | 可用 Chromium 三视口 18 项通过；12 项按测试设计跳过 |
| `pnpm build` | PASS |
| `git diff --check` | PASS，仅既有行尾提示 |

待第 2 轮独立复验：

- Firefox 与 WebKit 因本机缺少 Playwright 浏览器二进制尚未实际运行。
- Node.js 24 环境尚未复验，当前环境为 `v23.11.1`。
- 真实 163 SMTP 冒烟仍需用户在本地配置轮换后的秘密。

## 第 2 轮独立验收

- 日期：2026-07-24
- 验收 Agent：`spec002_acceptance_round1_retry`（以新的独立复验任务重新启动）
- 结论：FAIL
- 运行环境：Node.js `v23.11.1`；未调用 NVM，未安装 Node.js、依赖或 Playwright 浏览器，未创建子 Agent。

### 结论摘要

- AC-001、AC-002、AC-003、AC-004、AC-006、AC-009、AC-010、AC-011、AC-012：PASS。
- AC-005：BLOCKED，仅剩真实 163 SMTP 冒烟缺少用户本地轮换秘密。
- AC-007、AC-008：FAIL，初始会话请求的延迟访客响应会覆盖刚完成的登录或注册状态。
- AC-013：BLOCKED，Chromium 三视口 18 项通过，但本机缺少 Firefox、WebKit 二进制，且尚未在 Node.js 24 环境复验。

### 自动化证据

| 检查 | 结果 |
| --- | --- |
| `pnpm db:validate` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS，前端 13 项、后端 30 项 |
| `pnpm test:e2e` | Chromium 三视口 18 项通过；Firefox、WebKit 因缺少二进制未运行 |
| `pnpm build` | PASS |
| `git diff --check` | PASS，仅既有行尾提示 |
| 独立会话竞态复现 | FAIL，延迟访客响应覆盖已登录 UI |

### 必须返工

1. 修复首页初始 `/auth/session` 请求与后续登录、注册操作之间的状态竞争。
2. 旧的访客会话响应不得覆盖用户在其后完成的登录或注册状态。
3. 增加“先完成登录或注册，再返回旧会话响应”的自动化回归测试。

### 仍待外部条件

- 真实 163 SMTP 冒烟需要用户本地轮换后的有效秘密。
- Firefox 与 WebKit 需要本机具备对应 Playwright 浏览器二进制。
- 项目需要在 Node.js 24 环境复验；不得通过反复调用 NVM 或安装第二套 Node.js 处理。

### 临时文件清理

- `test/spec-002-acceptance-round-2/` 中一次性竞态复现脚本及 `e2e/test-results/` 已删除。
- 未创建新的 `node_modules`，现有各级 `node_modules/` 均已保留。

## 第 2 轮返工结果

- 日期：2026-07-24
- 返工 Agent：`spec002_integration_implement`（以新的返工任务重新启动）
- 状态：COMPLETED
- 未创建子 Agent，未调用 NVM，未安装 Node.js 或依赖。

完成内容：

1. 增加认证状态版本守卫，阻止延迟初始会话响应覆盖更新的登录、注册或退出状态。
2. 增加组件卸载保护。
3. 新增登录和注册两条延迟初始访客会话回归测试。

返工自测：

| 检查 | 结果 |
| --- | --- |
| 前端直接测试 | PASS，15 项 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS，前端 15 项、后端 30 项 |
| `pnpm build` | PASS |
| `git diff --check` | PASS |

待第 3 轮独立复验：

- 初始会话竞态是否被可靠修复且无认证流程回归。
- 外部 SMTP、Firefox/WebKit 和 Node.js 24 环境阻塞仍需单独确认。

## 第 3 轮独立验收

- 日期：2026-07-24
- 验收 Agent：`spec002_acceptance_round1_retry`（以新的独立复验任务重新启动）
- 结论：BLOCKED
- 运行环境：Node.js `v23.11.1`；未调用 NVM，未安装 Node.js、依赖或 Playwright 浏览器，未创建子 Agent。

### 验收结论

| 编号 | 结果 | 摘要 |
| --- | --- | --- |
| AC-001 | PASS | Chromium 三视口分别保持 3、4、5 列。 |
| AC-002 | PASS | 菜单、频道、本地卡片和未实现入口反馈通过。 |
| AC-003 | PASS | 首页内双栏登录弹窗通过。 |
| AC-004 | PASS | 关闭、遮罩、焦点与可访问性通过。 |
| AC-005 | BLOCKED | 模拟邮件闭环通过；真实 163 SMTP 冒烟缺少轮换后的本地秘密。 |
| AC-006 | PASS | 验证码安全、生命周期和限流通过。 |
| AC-007 | PASS | 已有账号登录及延迟初始会话竞态复验通过。 |
| AC-008 | PASS | 新账号注册、过期文案及延迟初始会话竞态复验通过。 |
| AC-009 | PASS | 用户数据规则通过。 |
| AC-010 | PASS | 会话恢复、多设备和当前设备退出通过。 |
| AC-011 | PASS | 加载、错误状态和精确文案通过。 |
| AC-012 | PASS | 测试邮件边界与敏感信息检查通过。 |
| AC-013 | BLOCKED | Chromium 三视口通过；Firefox/WebKit 二进制缺失，且当前不是 Node.js 24 环境。 |

### 自动化证据

| 检查 | 结果 |
| --- | --- |
| 前端直接测试 | PASS，15 项，包含登录与注册竞态 |
| 独立浏览器竞态复验 | PASS，登录和注册旧访客响应均被忽略 |
| `pnpm db:validate` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS，前端 15 项、后端 30 项 |
| `pnpm test:e2e` | Chromium 三视口 18 项通过；Firefox/WebKit 未运行 |
| `pnpm build` | PASS |
| `git diff --check` | PASS，仅既有行尾提示 |
| E2E 资源清理 | PASS，容器、网络、测试数据卷和端口均已清理 |

### 阻塞与解除条件

1. 用户在本地安全配置轮换后的网易 163 SMTP 授权码，并执行一次真实收信冒烟；秘密不得进入对话、日志或 Git。
2. 在已经具备 Playwright Firefox 和 WebKit 浏览器二进制的环境运行九项目矩阵。
3. 在项目要求的 Node.js 24 环境重新运行本地质量检查。

### 临时文件清理

- `test/spec-002-acceptance-round-3/` 中一次性竞态脚本及 `e2e/test-results/` 已删除。
- 未创建或删除任何 `node_modules`；仓库现有依赖目录均已保留。

## 第 4 轮验收环境准备

- 日期：2026-07-24
- 用户已确认本地 `backend/.env` 配置完成；秘密内容未写入对话、Spec 或验收记录。
- 当前 Node.js 已验证为 `v24.9.0`，符合项目 `>=24 <25` 的约束。
- Playwright Firefox 151.0、WebKit 26.5 及必要辅助二进制已下载到项目 `node_modules` 内的 hermetic browser 目录。
- 浏览器二进制位于 Git 忽略的 `node_modules/` 中，验收后保留。
- 协调开发 Agent 已停止并永久退役当前可见的历史子 Agent；当前工具只提供中断，不提供物理删除，旧 Agent 不再复用。
- 首次创建第 4 轮 Agent 时平台曾返回线程数量上限；再次关闭现有实例后，平台已释放可用名额。
- 已创建全新的验收 Agent `spec002_acceptance_round4`，对此前外部阻塞项和全部 AC 进行第 4 轮复验。

## 第 4 轮独立验收

- 日期：2026-07-24
- 验收 Agent：`spec002_acceptance_round4`
- 结论：PASS
- 实现失败项：无
- 阻塞项：无

### 验收标准结论

| 编号 | 结果 | 摘要 |
| --- | --- | --- |
| AC-001 | PASS | 三视口分别为 3、4、5 列，首页入口和品牌符合要求。 |
| AC-002 | PASS | 菜单、频道、本地演示卡片和未实现入口反馈通过。 |
| AC-003 | PASS | 三视口双栏登录弹窗通过。 |
| AC-004 | PASS | 九项目弹窗关闭、遮罩、键盘和焦点行为通过。 |
| AC-005 | PASS | 自动化和真实 SMTP 技术发送成功；用户确认实际收信及正文符合 Spec。 |
| AC-006 | PASS | 验证码安全、生命周期和限流通过。 |
| AC-007 | PASS | 三引擎已有账号登录、刷新恢复和竞态回归通过。 |
| AC-008 | PASS | 三引擎新账号注册、凭证恢复/过期和竞态回归通过。 |
| AC-009 | PASS | Prisma 模型与真实隔离数据库迁移通过。 |
| AC-010 | PASS | 会话恢复、多设备和当前设备退出通过。 |
| AC-011 | PASS | 加载状态、错误路径和精确文案通过。 |
| AC-012 | PASS | 配置、测试邮件边界及敏感信息检查通过。 |
| AC-013 | PASS | Node.js 24 和三浏览器九项目均实际执行通过。 |

### 自动化证据

| 检查 | 结果 |
| --- | --- |
| `pnpm db:validate` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS，前端 15 项、后端 30 项 |
| 认证竞态定向复验 | PASS |
| `pnpm build` | PASS |
| `git diff --check` | PASS |
| `PLAYWRIGHT_BROWSERS_PATH=0; pnpm test:e2e` | PASS，48 项通过、42 项按设计跳过 |

九项目均实际执行至少一个非跳过用例。1280px 和 1920px 项目执行首页、健康、列数和弹窗核心交互；Chromium、Firefox、WebKit 的完整登录、注册和错误路径均在 1440px 项目实际执行。

### 真实 SMTP 技术结果

- 时间：2026-07-24 21:22:23 +08:00。
- 目标：`x***@163.com`。
- 请求：成功，HTTP 200，仅发送 1 次，未重试。
- 预期标题：`【小蓝书】您的登录验证码`。
- 使用隔离 PostgreSQL `55433`、Redis `56380` 和后端端口 `3102`，未接触未知 5432 进程。
- 未读取、打印、复制或记录 `.env`、授权码或验证码。

用户于 2026-07-24 确认：

1. 已收到这 1 封邮件；
2. 标题为 `【小蓝书】您的登录验证码`；
3. 正文包含 6 位验证码；
4. 正文说明验证码 10 分钟内有效；
5. 正文包含“如非本人操作，请忽略”或同义提示。

验证码未进入对话、日志或验收记录，验收期间未重复发送邮件。至此 AC-005 通过，第 4 轮独立验收总体结论更新为 `PASS`。

## 用户最终确认

- 日期：2026-07-24
- 用户确认：`SPEC-002 邮箱注册与登录验收完成。`
- 最终状态：`Accepted`
- CI 不是本 Spec 的完成门禁；后续提交和手动 CI 结果不改变本次已确认的完成状态。

### 运行环境与清理

- Node.js：`v24.9.0`；未调用 NVM。
- 未安装 Node.js、依赖或浏览器；未创建子 Agent。
- `test/spec-002-acceptance-round-4/`、Playwright 结果、隔离容器、网络、数据卷、进程和端口均已清理。
- 所有现有 `node_modules` 和 `backend/.env` 均已保留。
