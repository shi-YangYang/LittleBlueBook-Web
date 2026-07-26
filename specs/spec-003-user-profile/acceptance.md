# SPEC-003 验收记录

- Spec：`specs/spec-003-user-profile/spec.md`
- 当前 Spec 状态：Accepted
- 验收状态：PASS；User Confirmed
- 最新验收轮次：第 2 轮独立验收 PASS；协调 Agent 直接修复自检 PASS；用户确认

本文件用于独立验收记录，不修改 `spec.md` 中的需求或验收标准。

用户已于 2026-07-26 最终确认 SPEC-003。完成实施后，必须创建一个未参与实施的新验收 Agent，并按 AC-001 至 AC-013 逐项提供结论和证据。

## 验收门禁

- [x] `spec.md` 已由用户明确确认并标记为 `Confirmed`
- [x] 实施由单一实施 Agent 完成
- [x] 实施 Agent 已返回最终报告并被释放
- [x] 验收 Agent 与实施 Agent 身份独立
- [x] 验收 Agent 未修改业务代码
- [x] Node.js 任务开始时只检查一次 `node --version`
- [x] 未创建临时脚本或测试副本；E2E 运行产物已清理

## 验收标准记录

| 编号 | 结果 | 证据与说明 |
| --- | --- | --- |
| AC-001 | PASS | 登录后显示默认头像和固定“我”并链接 `/profile`；未登录仍显示“登录”，首页不再提供退出菜单。 |
| AC-002 | PASS | 三浏览器验证未登录访问 `/profile` 返回首页并打开登录弹窗；401 和会话失效会清除资料，无资料闪现。 |
| AC-003 | PASS | 展示默认头像、真实昵称、10 位小蓝书号和中文性别；无邮箱、内部 UUID、会话信息或编辑入口。 |
| AC-004 | PASS | 数据库、旧库迁移、生成和碰撞测试共同验证编号为唯一非空 10 位数字字符串并支持前导零。 |
| AC-005 | PASS | 性别受枚举约束，默认和既有用户回填均为 `PRIVATE`；三种中文映射通过测试且无修改入口。 |
| AC-006 | PASS | 三项统计均显示真实 `0`，使用不可点击语义结构，无随机或演示非零数据。 |
| AC-007 | PASS | Tab 顺序、默认项、空状态、鼠标和键盘切换均通过测试，无虚假卡片或未实现操作。 |
| AC-008 | PASS | 资料头部、统计、Tab 和内容区层级正确；使用本地小蓝书蓝色品牌；三浏览器三宽度均无溢出。 |
| AC-009 | PASS | 设置菜单退出、失败反馈、Escape 关闭、焦点恢复和仅结束当前会话均通过。 |
| AC-010 | PASS | 资料接口只基于当前服务端会话，未登录返回统一 401，仅查询和返回必要字段。 |
| AC-011 | PASS | 加载骨架、普通失败、重试、401 独立处理和清除旧资料均通过组件测试。 |
| AC-012 | PASS | 空库、三用户旧库迁移、旧用户登录、新用户注册、会话恢复和首页回归均通过。 |
| AC-013 | PASS | 后端、前端和 E2E 覆盖完整，所有规定的本地检查通过。 |

## 自动化证据

| 命令或方式 | 结果 | 摘要 |
| --- | --- | --- |
| `node --version` | PASS | `v24.9.0`，只运行一次，未调用 NVM |
| `pnpm db:validate` | PASS | Prisma Schema 有效 |
| `pnpm lint` | PASS | frontend、backend、e2e 全部通过，0 warning |
| `pnpm typecheck` | PASS | 三个 Workspace 全部通过 |
| `pnpm test` | PASS | 后端 10 suites / 37 tests；前端 3 files / 24 tests |
| `pnpm test:e2e` | PASS | 61 passed、56 按矩阵设计 skipped、0 failed |
| `pnpm build` | PASS | NestJS 与 Next.js 生产构建成功，`/profile` 正常生成 |
| `pnpm format:check` | PASS | 全仓格式检查通过 |
| `git diff --check` | PASS | 无空白错误，仅有 Windows LF/CRLF 提示 |

## 数据迁移专项

验收 Agent 使用独立 PostgreSQL 完成专项验证：

1. 空数据库基础迁移和资料迁移成功；
2. 含 3 名既有用户的旧结构数据库迁移成功；
3. 回填编号为 `0000000001`～`0000000003`，均为唯一非空 10 位数字字符串并保留前导零；
4. 既有用户性别全部回填为 `PRIVATE`；
5. 既有 UUID、邮箱、昵称、创建时间、更新时间和最近登录时间均未改变；
6. 重复编号被唯一约束拒绝，非法格式被数据库 CHECK 约束拒绝；
7. 新注册用户的编号、默认性别和碰撞重试由真实数据库 E2E、集成测试和单元测试验证。

## 视觉与交互专项

验收 Agent 已验证：

- Chromium、Firefox、WebKit 在 `1280px`、`1440px`、`1920px` 的 9 个个人主页布局组合；
- 三浏览器均通过未登录 `/profile` 路由保护，Chromium 通过完整退出场景；
- 登录态与未登录态首页入口、资料加载、失败、重试和会话失效；
- 三个 Tab 的鼠标、方向键、Enter、Space、Home 和 End 操作；
- 设置菜单的键盘操作、Escape 关闭和焦点恢复；
- 页面不存在资料编辑入口、虚假统计、虚假内容卡片或第三方受保护资源。

## 验收结论

第 1 轮独立验收结论为 `PASS`，AC-001 至 AC-013 全部通过，无失败项或阻塞项。

- 验收 Agent：`spec003_acceptance_round1`
- 验收 Agent 未参与实施、未修改工作区、未创建子 Agent；
- 未读取 `.env`、未发送真实邮件、未运行远程 CI；
- E2E、迁移专项使用的专属容器、网络和卷均已清理；
- `.next-e2e` 与 `e2e/test-results` 已清理；
- 用户已有的本地 PostgreSQL、Redis 和开发服务未被停止或干扰；
- 根目录及各 Workspace 的现有 `node_modules` 均保留。

当前等待用户确认验收完成；在用户确认前，Spec 状态保持 `Accepting`。

## 用户验收反馈修复

2026-07-26，用户在第 1 轮独立验收通过后发现：

1. 个人主页内容为空时仍出现影响观感的纵向滚动条；
2. 个人主页点击“发现”错误显示“功能正在开发中”，没有导航到首页。

两个问题均已纳入 SPEC-003 v1.1 的 AC-014。用户明确要求本轮只创建新的实施 Agent 修复，不再创建独立验收 Agent；因此第 1 轮 `PASS` 保留为历史记录，本轮修复将记录实施 Agent 的测试证据并直接交由用户审查。

### 用户反馈修复实施结果

- 实施 Agent：`spec003_user_feedback_fix`
- 结果：`PASS`
- 独立验收 Agent：按用户明确要求未创建

根因与修复：

1. 通用 `.content-shell` 的后置 `padding` 简写覆盖个人页底部间距，加上固定空状态高度，导致空页面纵向溢出；现已使用个人页专用选择器取消重复底部间距，并让空状态高度根据可用视口计算，未使用全局 `overflow: hidden`；
2. 个人页曾将“发现”与未实现菜单统一渲染为开发中按钮；现已将“发现”改为指向首页 `/` 的真实链接，其余未实现菜单保持原行为。

实施 Agent 自检证据：

| 检查 | 结果 | 摘要 |
| --- | --- | --- |
| `pnpm lint` | PASS | frontend、backend、e2e 全部通过 |
| `pnpm typecheck` | PASS | frontend、backend、e2e 全部通过 |
| 个人主页组件测试 | PASS | 9/9 通过 |
| `pnpm build` | PASS | 前后端生产构建通过 |
| `pnpm test:e2e` | PASS | 61 passed、56 skipped、0 failed |
| 本轮文件 Prettier | PASS | 4 个修复相关文件通过 |
| `git diff --check` | PASS | 无空白错误 |

E2E 已在 Chromium、Firefox、WebKit 的 `1280×720`、`1440×900`、`1920×1080` 下逐一切换三个空 Tab，确认 `scrollHeight <= clientHeight`；同时确认点击“发现”后 pathname 为 `/` 且不出现“功能正在开发中”。

实施 Agent 已释放，E2E 产物、隔离容器、网络、卷及相关测试端口均已清理。当前等待用户直接审查两个修复并确认 SPEC-003 验收完成。

### 第二次用户反馈

用户实际检查结果：

- “发现”已能正确返回首页；
- 滚动条问题仍存在；
- 触发条件为第一次直接进入个人主页时 `html` 根元素出现滚动条，随后从首页再次进入个人主页则不出现。

上一轮 E2E 只证明了既有测试导航顺序下的最终空状态没有溢出，没有独立覆盖“全新页面以 `/profile` 作为第一个文档”的冷启动差异，因此不足以关闭该缺陷。

该问题已纳入 SPEC-003 v1.2 的 AC-015，并进入新的实施返工。

### 第二次用户反馈实施结果

- 实施 Agent：`spec003_initial_load_scroll_fix`
- 实施结果：`PASS`

实施 Agent 在 Windows 有界面 Edge 下稳定复现：

- `1200×900` 修复前根宽为 `1280/1185`、根高为 `900/885`；
- `1279×900` 修复前根宽为 `1280/1264`、根高为 `900/885`。

根因是全局 `html/body min-width: 1280px` 产生水平滚动槽，Windows 经典滚动条占用 15px 高度，同时个人页多层 `100vh` 算式仍按完整高度拼满，从而在 `html` 上连带产生纵向滚动。

实施修正：

- 仅在 DOM 含个人页根节点时解除根元素最小宽度，首页继续保留原有 `1280px` 最小宽度；
- 将个人页改为单一视口高度的纵向 Flex 布局，移除三层嵌套的 `100vh` 高度算式；
- 未隐藏 `html` 或 `body` 的滚动；
- 增加首次直达、硬刷新、首页站内导航在 loading/loaded 两阶段的根宽高断言；
- 增加 `1200px`、`1279px` Windows 滚动槽专项和 2000px 真实长内容仍可滚动的回归。

实施自检：

- Windows headed Edge 修复后 `1200×900` 根宽高为 `1200/1200`、`900/900`；
- Windows headed Edge 修复后 `1279×900` 根宽高为 `1279/1279`、`900/900`；
- 专项测试 6/6 通过；
- 完整 E2E 77 passed、130 skipped、0 failed；
- 个人页前端测试 9/9 通过；
- lint、typecheck、build、目标 Prettier 与 `git diff --check` 全部通过；
- “发现”返回首页和真实长内容滚动回归通过。

实施 Agent 已释放。当前由新的独立验收 Agent 验证 AC-014 与 AC-015。

## 第 2 轮独立验收

- 验收 Agent：`spec003_scroll_reacceptance`
- 结论：`PASS`
- 失败项：无
- 阻塞项：无

### AC-014

- Chromium、Firefox、WebKit 的 `1280×720`、`1440×900`、`1920×1080` 标准矩阵通过；
- 三个空状态 Tab 均验证 `html` 根元素无无意义纵向溢出；
- Windows Microsoft Edge 146 有界面专项在 `1200×900`、`1279×900`、`1280×900` 均无根元素横向或纵向溢出；
- 注入 2000px 长内容后，`html clientHeight=900`、`scrollHeight=2535`，页面可滚动至 `scrollY=1634.67`，证明未隐藏正常滚动；
- 点击“发现”后返回首页 `/`，页面不存在“功能正在开发中”提示；
- 返回首页后 `html/body min-width` 恢复为 `1280px`，首页 3/4/5 列布局未回归。

### AC-015

验收 Agent 使用系统 Microsoft Edge 146、`headless=false`、独立新上下文和有效测试会话验证了三条独立路径：

1. 将 `/profile` 作为首个文档直接访问；
2. 在 `/profile` 执行硬刷新；
3. 从首页点击“我”进入 `/profile`。

每条路径均在 loading 和 loaded 阶段采集根元素数据，共 18 个观测点：

| 视口 | `html clientWidth/scrollWidth` | `html clientHeight/scrollHeight` |
| --- | --- | --- |
| `1200×900` | `1200/1200` | `900/900` |
| `1279×900` | `1279/1279` | `900/900` |
| `1280×900` | `1280/1280` | `900/900` |

- `body` 尺寸与 `html` 一致；
- 所有观测点的 `html/body min-width` 均为 `0px`，`overflow-y` 均为 `visible`；
- 首次直达、硬刷新和站内跳转行为一致；
- 条件样式只在包含 `.profile-shell` 时解除根最小宽度，未全局关闭滚动；
- `:has()` 条件规则在 Chromium、Firefox、WebKit 的实际测试中均生效。

### 第 2 轮命令证据

| 检查 | 结果 | 摘要 |
| --- | --- | --- |
| `node --version` | PASS | `v24.9.0`，仅运行一次，未调用 NVM |
| 个人页前端测试 | PASS | 1 文件、9 测试 |
| `pnpm test` | PASS | 前端 3 文件/25 测试，后端 10 suites/37 测试 |
| `pnpm lint` | PASS | frontend、backend、e2e 全部通过 |
| `pnpm typecheck` | PASS | frontend、backend、e2e 全部通过 |
| `pnpm build` | PASS | 前后端生产构建通过 |
| `pnpm format:check` | PASS | 全仓格式检查通过 |
| `git diff --check` | PASS | 无空白错误，仅有 Windows LF/CRLF 提示 |
| `pnpm test:e2e` | PASS | 独立运行两次，均为 77 passed、130 按矩阵设计 skipped、0 failed |

验收 Agent 未修改项目文件、未创建子 Agent、未调用 NVM。临时验收目录、脚本、日志、PID、E2E 产物、隔离容器、网络和卷均已清理，测试端口已释放；用户原有 PostgreSQL、Redis 和开发服务未受影响。验收 Agent 已释放。

SPEC-003 v1.2 当前等待用户实际复查并确认验收完成。

## 第三次用户反馈与只读诊断

第 2 轮独立验收通过后，用户实际检查结果为：

- 首次进入个人主页正常；
- 从其他页面进入“我”正常；
- 刷新个人主页后，`html` 根元素仍出现滚动条。

用户明确要求本阶段只排查原因，不创建实施 Agent。

协调开发 Agent 在当前本地开发服务上使用模拟资料响应进行了只读浏览器诊断，没有修改业务代码或项目配置。诊断结果：

- `1200×900` 刷新时 loading 和 loaded 均无溢出；
- `850×800` 刷新进入资料加载骨架时：
  - `html clientWidth/scrollWidth = 835/882`
  - `html clientHeight/scrollHeight = 785/800`
- 相同 `850×800` 视口在资料加载完成后：
  - `html clientWidth/scrollWidth = 850/850`
  - `html clientHeight/scrollHeight = 800/800`
- 在更紧凑的 `800×700` 视口中：
  - loading 阶段 `html clientWidth/scrollWidth = 785/882`、`clientHeight/scrollHeight = 685/700`；
  - loaded 阶段横向溢出消失，但资料头部因空间不足从 `230px` 增长至约 `326px`，最终 `html clientHeight/scrollHeight = 700/762`，纵向滚动会继续存在。

根因定位：

- 个人页解除了根元素 `1280px` 最小宽度，但刷新必然先渲染资料加载骨架；
- 加载骨架仍使用固定网格列、固定间距和 `330px` 固定骨架线宽；
- 当开发者工具或窗口使可用视口宽度低于约 `882px` 时，骨架内容把页面横向撑宽；
- Windows 横向滚动条占用约 `15px` 高度，继而让 `html` 同时出现纵向滚动条；
- 资料完成后固定骨架消失，在高度足够的视口中根宽高恢复正常；
- 如果视口同时较窄且较矮，资料头部内容换行增高，加载完成后仍可能保留真实纵向溢出；
- 站内导航时路由和请求通常更快，加载骨架存在时间更短，因此问题不明显或不可见；刷新会重新经历完整首屏和资料请求，使问题稳定可见。

因此，`html` 根元素是滚动条承载者，不是最初的溢出源；实际溢出源是窄视口刷新期间不具备收缩能力的 `.profile-loading` / `.skeleton-line` 布局。此前 `1200px`、`1279px` 和标准三宽度测试没有覆盖这一触发区间。

用户随后明确授权协调开发 Agent 直接修复，并要求本轮不创建实施 Agent 或验收 Agent。

## 协调 Agent 直接修复自检

修复内容：

- 在小于 `960px` 的个人主页视口下，资料加载骨架与资料头部改用可收缩的列宽、间距和头像尺寸；
- 骨架标题和骨架线增加最大宽度约束，避免刷新 loading 阶段横向撑开根元素；
- 窄且矮的视口下压缩资料头部、统计和 Tab 占用高度，避免空页面产生无意义纵向溢出；
- 保留根元素正常滚动能力，没有使用全局 `overflow: hidden`；
- 增加 `850×800`、`800×700` 硬刷新 E2E 回归，分别断言 loading 与 loaded 阶段根元素均无横向或纵向溢出。

自检证据：

| 检查 | 结果 | 摘要 |
| --- | --- | --- |
| `node --version` | PASS | `v24.9.0`，仅运行一次，未调用 NVM |
| 个人页前端测试 | PASS | 1 文件、9 测试 |
| `pnpm test` | PASS | 前端 3 文件/25 测试；后端 10 suites/37 测试 |
| `pnpm lint` | PASS | frontend、backend、e2e 全部通过 |
| `pnpm typecheck` | PASS | frontend、backend、e2e 全部通过 |
| `pnpm build` | PASS | 前后端生产构建通过 |
| `pnpm test:e2e` | PASS | 79 passed、146 按既有矩阵设计 skipped、0 failed |
| `git diff --check` | PASS | 无空白错误，仅有 Windows LF/CRLF 提示 |

新增的 Chromium `850×800` 与 `800×700` 硬刷新用例均通过。完整 E2E 结束后，隔离容器、网络、卷和测试端口均已释放。当前等待用户实际刷新复查。

## 最终确认

用户于 2026-07-26 实际复查修复结果并明确确认验收完成。SPEC-003 状态更新为 `Accepted`，后续提交和 CI 反馈不再影响本 Spec 的完成状态。
