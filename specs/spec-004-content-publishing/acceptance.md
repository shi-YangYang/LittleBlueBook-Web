# SPEC-004 验收记录

- Spec：`specs/spec-004-content-publishing/spec.md`
- 当前 Spec 状态：Accepting
- 验收状态：第 5 轮直接修复自测通过，等待用户确认
- 最新验收轮次：第 5 轮按用户要求由协调 Agent 直接修复

本文件用于记录独立验收轮次、结论与证据，不修改 `spec.md` 中的需求和验收标准。

## 验收门禁

- [x] 用户已明确确认 `spec.md`
- [x] 实施由单一实施 Agent 完成
- [x] 实施 Agent 未创建子 Agent
- [x] 实施 Agent 最终报告已处理并释放
- [x] 验收 Agent 与实施 Agent 身份独立
- [x] 验收 Agent 未修改业务代码
- [x] 验收 Agent 未创建子 Agent
- [x] 临时测试文件、运行产物和隔离服务已按规则清理

## 验收标准记录

| 编号 | 结果 | 证据与说明 |
| --- | --- | --- |
| AC-001 | PASS | 未登录直达 `/publish` 会返回首页并打开登录框，登录后自动续接；登录用户入口和既有导航回归通过 |
| AC-002 | PASS | 双栏布局、全部字段、纯文本保存及标题/正文边界通过 |
| AC-003 | PASS | 真实媒体解码、数量/大小/类型边界、预览、移除、排序和封面行为通过 |
| AC-004 | PASS | 服务端作者、事务发布、幂等、401 表单保留和失败媒体清理通过 |
| AC-005 | PASS | 随机对象 Key、无绝对路径泄漏、本地媒体读取和 Docker Volume 契约通过 |
| AC-006 | PASS | 首页仅展示真实推荐，空状态和新笔记置顶通过 |
| AC-007 | PASS | 20 条游标分页、稳定排序、去重和加载失败保留通过 |
| AC-008 | PASS | 当前用户笔记过滤、共享卡片与其他 Tab/统计无虚假变化通过 |
| AC-009 | PASS | 真实卡片字段、点赞 `0`、无正文/时间及键盘可达通过 |
| AC-010 | PASS | 毫秒边界测试与真实 30.5 天笔记详情均确认超过 30 天显示具体日期 |
| AC-011 | PASS | 全部互动占位存在、数量为 `0`，只提示开发中且无写请求 |
| AC-012 | PASS | 三浏览器在同一页面/历史序列的 Back 与 Forward 均通过“取消→再次确认”；表单、图片与历史长度保持，确认后到达正确首页 |
| AC-013 | PASS | 接口权限、OpenAPI、最小响应和敏感信息扫描通过 |
| AC-014 | PASS | 文本、媒体真实性、路径穿越、越权与非法游标安全边界通过 |
| AC-015 | PASS | 三浏览器历史返回兼容性、三个目标视口、根溢出、长文滚动与键盘轮播全部通过 |
| AC-016 | PASS | 全部规定命令通过；Browser E2E 为 99 passed、180 skipped、0 failed，但历史重试场景需补充覆盖 |

## 自动化证据

实施 Agent 自测证据已经记录，但不替代独立验收：

| 检查 | 实施结果 | 摘要 |
| --- | --- | --- |
| `pnpm format:check` | PASS | 全仓格式通过 |
| `pnpm lint` | PASS | frontend、backend、e2e 通过 |
| `pnpm typecheck` | PASS | frontend、backend、e2e 通过 |
| `pnpm test` | PASS | 前端 37 项、后端 56 项 |
| `pnpm db:validate` | PASS | Prisma Schema 有效 |
| `pnpm db:generate` | PASS | Prisma Client 生成成功 |
| `pnpm build` | PASS | 前后端生产构建通过 |
| `pnpm docker:build` | PASS | 前后端镜像构建通过 |
| `pnpm test:e2e` | PASS | 93 passed、168 skipped、0 failed |
| `pnpm ci:validate` | PASS | 常规 CI 静态规则通过 |
| `git diff --check` | PASS | 无空白错误 |

## 第 1 轮实施交接

- 实施 Agent：`spec004_content_publishing_implementation`
- 结论：`COMPLETED`
- 已实现：
  - 笔记与有序图片迁移；
  - Sharp 图片真实性和尺寸校验；
  - 本地媒体存储、随机对象 Key、失败清理和公开读取；
  - 发布、推荐、当前用户笔记和公开详情接口；
  - 发布幂等、频率限制、鉴权和不透明游标；
  - 首页真实推荐、个人笔记、发布页和详情页；
  - 未保存提醒、会话失效续登、轮播和互动占位；
  - 自动化测试、Docker 媒体配置和 README。
- 已知非阻断信息：E2E 开发服务器产生 Next Image 性能提示；实施 Agent 判断不影响功能。
- 实施 Agent 未创建子 Agent、未调用 NVM、未操作远程 CI 或 Git。
- `test/spec004-e2e/`、Playwright 产物、隔离容器、网络、卷和测试端口已经清理；用户现有 `littlebluebook-dev` 容器未被修改。
- 平台不提供物理删除能力，实施 Agent 已停止并视为永久退役，禁止复用。

## 验收结论

### 第 1 轮

- 验收 Agent：`spec004_content_publishing_acceptance`
- 结论：`FAIL`
- 阻塞项：无
- 失败项：AC-010、AC-012

独立验收运行了全部规定命令，结果如下：

| 检查 | 独立验收结果 | 摘要 |
| --- | --- | --- |
| `pnpm format:check` | PASS | 全仓格式通过 |
| `pnpm lint` | PASS | frontend、backend、e2e 通过 |
| `pnpm typecheck` | PASS | frontend、backend、e2e 通过 |
| `pnpm db:validate` | PASS | Prisma Schema 有效 |
| `pnpm db:generate` | PASS | Prisma Client 7.9.0 生成成功 |
| `pnpm test` | PASS | 前端 37 项、后端 56 项 |
| `pnpm build` | PASS | 前后端生产构建通过 |
| `pnpm docker:build` | PASS | 前后端镜像构建通过 |
| `pnpm ci:validate` | PASS | 常规 CI 静态规则通过 |
| `pnpm test:e2e` | PASS | 93 passed、168 skipped、0 failed |
| 三浏览器 × 三视口详情探针 | PASS | 无根溢出，轮播行为正确 |
| 三浏览器 1280×720 首页/发布页探针 | PASS | 首页无无意义滚动，发布页无横向溢出 |
| 未保存历史返回探针 | FAIL | 确认对话为 0，URL 直接由 `/publish` 变为 `/` |
| 30.5 天时间探针 | FAIL | 实际显示“30天前” |
| 敏感信息扫描 | PASS | 未发现版本化真实 SMTP/Token 类凭据 |
| `git diff --check` | PASS | 无空白错误，仅 Windows 行尾提示 |

失败证据与返工边界：

1. AC-010：`frontend/app/explore/[noteId]/page.tsx` 先向下取整天数，再判断 `days <= 30`，使超过 30 天但不足 31 天的时间仍显示相对天数。返工应改为按实际时间差判断，并增加 30 天边界测试。
2. AC-012：`frontend/app/publish/page.tsx` 只用 `beforeunload` 覆盖刷新/关闭，并只在自有返回按钮调用确认逻辑，没有覆盖浏览器 History 导航。返工应补齐历史返回/前进离开拦截和真实浏览器回归测试。

验收使用 Node.js `v24.9.0`，未调用 NVM、未安装浏览器、未创建子 Agent、未修改业务代码、未运行远程 CI。临时目录 `test/spec-004-acceptance-round-1/`、Playwright 产物、隔离容器、网络、卷和测试端口均已清理；用户现有开发数据库与 Redis 未被停止或修改。验收 Agent 已停止并永久退役。

## 第 2 轮返工交接

- 返工 Agent：`spec004_rework_round2`
- 结论：`COMPLETED`
- 返工范围：仅 AC-010 与 AC-012
- 已实现：
  - 按实际毫秒差判断 30 天时间边界；
  - 增加可注入当前时间的格式化纯函数和精确边界测试；
  - 为历史条目标记位置且不新增哨兵条目；
  - Chromium 使用 Navigation API、Firefox/WebKit 使用 `popstate` 兼容路径；
  - 覆盖 Back/Forward 的取消与确认、表单/图片保留及历史长度不污染；
  - 增加前端单元/组件测试和三浏览器 Playwright 回归。
- 自测结果：
  - 前端 46 项、后端 56 项通过；
  - 三浏览器定向历史导航 E2E 6 项通过；
  - 完整 Browser E2E 99 passed、180 skipped、0 failed；
  - 格式、Lint、类型、构建、常规 CI 校验和 diff 检查通过。
- 未创建子 Agent、未调用 NVM、未安装浏览器、未操作 Git 或远程 CI。
- 临时测试文件与隔离资源已清理，用户开发容器未被修改。
- 返工 Agent 已停止并永久退役。

第 2 轮独立复验必须重新验证 AC-010、AC-012，并检查受影响的 AC-001、AC-004、AC-010、AC-012、AC-015、AC-016 回归；第 1 轮通过项不得仅依据实施报告直接继承。

### 第 2 轮

- 复验 Agent：`spec004_reacceptance_round2`
- 结论：`FAIL`
- 阻塞项：无
- 失败项：AC-012、AC-015
- 已修复项：AC-010

独立复验证据：

- AC-010：
  - 恰好 30 天显示“30天前”；
  - 超过 30 天 1 毫秒显示具体日期；
  - 30.5 天显示具体日期；
  - 使用真实隔离数据库修改笔记时间后，详情页显示 `YYYY/MM/DD` 形式具体日期。
- AC-012：
  - Chromium Back 的“取消→再次确认”正确；
  - Chromium Forward 首次取消保留 URL、表单、图片和历史长度，但再次 Forward 无确认且无法离开；
  - Firefox Back/Forward 的“取消→再次确认”均正确；
  - WebKit Back 首次取消保留完整表单，再次 Back 确认会进入 `about:blank`，越过正确首页目标；
  - 延长等待至 2 秒并多次隔离运行后仍稳定复现。
- 其他未保存行为：
  - 自有返回首页按钮、刷新 `beforeunload`、401 后表单保留与续登、发布成功后无误提示均独立通过。

完整检查结果：

| 检查 | 独立复验结果 | 摘要 |
| --- | --- | --- |
| `pnpm format:check` | PASS | 全仓格式通过 |
| `pnpm lint` | PASS | frontend、backend、e2e 通过 |
| `pnpm typecheck` | PASS | frontend、backend、e2e 通过 |
| `pnpm test` | PASS | 前端 46 项、后端 56 项 |
| `pnpm build` | PASS | 前后端生产构建通过 |
| `pnpm ci:validate` | PASS | 常规 CI 静态规则通过 |
| `pnpm test:e2e` | PASS | 99 passed、180 skipped、0 failed |
| `git diff --check` | PASS | 无空白错误，仅 Windows 行尾提示 |
| 独立真实时间页面探针 | PASS | 30.5 天显示具体日期 |
| 独立 Chromium 生命周期探针 | PASS | 自有返回、刷新、401 续登和发布成功行为正确 |
| 独立三引擎同序列历史探针 | FAIL | Firefox 通过；Chromium Forward、WebKit Back 失败 |

现有 E2E 将“取消”和“确认”放在不同的新页面/历史环境，因此没有覆盖取消后对同一历史项再次尝试的行为。第 3 轮必须补充真实同序列回归。

复验使用 Node.js `v24.9.0`，未调用 NVM、未安装浏览器、未创建子 Agent、未修改业务代码或治理文档、未操作 Git 或远程 CI。临时目录、Playwright 产物、隔离容器、网络、卷和端口均已清理；用户开发 PostgreSQL 与 Redis 保持健康且未被修改。复验 Agent 已停止并永久退役。

## 第 3 轮返工调度记录

首次调度的 `spec004_rework_round3` 在修改代码和运行测试前因平台额度限制退出。该 Agent 未创建子 Agent、未修改业务代码，现已释放并永久退役。第 3 轮返工将由新的单一实施 Agent 按原范围重新执行。

## 第 3 轮返工交接

- 返工 Agent：`spec004_rework_round3_retry`
- 结论：`COMPLETED`
- 返工范围：AC-012 及其对 AC-015 的影响
- 已实现：
  - 移除 Navigation API 取消 traversal；
  - 移除 `popstate + history.go()` 回弹和全局历史状态改写；
  - 发布页入口、登录后续接与离开采用跨文档导航；
  - 浏览器 Back/Forward、刷新和关闭统一由原生 `beforeunload` 保护未保存内容；
  - 自有返回按钮继续使用中文确认并在确认后清除 dirty 状态；
  - 新增三浏览器同一页面、同一历史项“取消→再次尝试→确认”E2E。
- 自测结果：
  - 三浏览器定向历史 E2E 6 项通过；
  - 前端 41 项、后端 56 项通过；
  - 完整 Browser E2E 99 passed、180 skipped、0 failed；
  - 格式、Lint、类型、构建、常规 CI 校验和 diff 检查通过。
- 未创建子 Agent、未调用 NVM、未安装浏览器、未操作 Git 或远程 CI。
- 隔离服务、运行产物和临时目录已清理；用户容器未被修改。
- 返工 Agent 已停止并永久退役。

第 3 轮独立复验必须重新验证 AC-012、AC-015，并回归 AC-001、AC-004、AC-010、AC-016。尤其需要独立确认三浏览器的 Back 与 Forward 在同一历史序列中取消后仍可再次确认并到达正确目标，同时核对跨文档导航没有破坏登录续接、表单保留、发布成功和合理页面体验。

### 第 3 轮

- 复验 Agent：`spec004_reacceptance_round3`
- 结论：`PASS`
- 阻塞项：无
- AC-001～AC-016：全部通过

独立复验重新运行了受版本控制的完整 E2E，并在 `test/spec-004-reacceptance-round-3/` 编写一次性独立探针。核心证据：

- Chromium、Firefox、WebKit 均从真实首页发布入口进入 `/publish`；
- Back 与 Forward 均在同一页面、同一历史目标中先取消再重试确认；
- 三个引擎均只出现预期的两次原生离开提示；
- 取消后 URL、标题、正文、图片预览和 `history.length` 完整保持；
- 确认后准确返回首页，无 `about:blank`、卡住、跳过、额外历史项或重复提示；
- 自有返回按钮的确认文案为“内容尚未发布，确认离开吗？”；
- 原生 `beforeunload` 文案由浏览器控制，但三浏览器阻止离开行为一致；
- 访客登录续接、个人页发布入口、401 后保留并续登、发布成功无误提示全部通过；
- 三浏览器 × 三目标视口的详情布局、长文滚动和键盘轮播通过；
- 30 天精确时间边界、媒体安全、发布幂等、游标分页、本地持久化、路径安全、OpenAPI 和隐私字段均无回归。

最终自动化结果：

| 检查 | 结果 | 摘要 |
| --- | --- | --- |
| `pnpm format:check` | PASS | 全仓格式通过 |
| `pnpm lint` | PASS | frontend、backend、e2e 通过 |
| `pnpm typecheck` | PASS | frontend、backend、e2e 通过 |
| `pnpm test` | PASS | 前端 41 项、后端 56 项 |
| `pnpm build` | PASS | 前后端生产构建通过 |
| `pnpm ci:validate` | PASS | 常规 CI 静态规则通过 |
| `pnpm db:validate` | PASS | Prisma Schema 有效 |
| `pnpm db:generate` | PASS | Prisma Client 生成成功 |
| `pnpm test:e2e` | PASS | 99 passed、180 skipped、0 failed |
| `git diff --check` | PASS | 无空白错误 |

复验使用 Node.js `v24.9.0`，未调用 NVM、未安装浏览器、未创建子 Agent、未修改业务代码或治理文档、未操作 Git 或远程 CI。临时探针、`test/`、Playwright 报告和测试结果、隔离容器、网络、卷和端口均已清理；用户容器未被操作。复验 Agent 已停止并永久退役。

当前最终验收结论为 `PASS`。按照项目流程，Spec 仍保持 `Accepting`，等待用户明确确认验收完成后再更新为 `Accepted`。

## 第 4 轮用户反馈

第 3 轮独立验收通过后、用户最终确认前，用户报告了 4 项强制修复：

- 详情页左上角 Logo 与笔记图片重叠，改为“返回”按钮；
- 个人页只有一行笔记仍产生滚动条；
- 发布页“添加话题”与“发布笔记”视觉贴合；
- 发布页无图片时仍产生滚动条。

用户明确要求本轮不创建验收 Agent。协调 Agent 已将 Spec 状态切换为 `Rework Required`，并将创建新的单一实施 Agent 完成修复与自测。

### 第 4 轮实施自测

- 实施 Agent：`spec004_user_feedback_round4`
- 结论：四项用户反馈均已修复，自测通过
- 独立验收：按用户明确要求跳过

结果：

- 详情页“返回”按钮替代重叠 Logo，站内返回与直接访问回首页均通过；
- 个人页一行笔记在 1280×720、1440×900、1920×1080 均无根滚动条；
- 发布页话题占位与发布按钮间距为 16～24px；
- 发布页无图与第一行图片在三个目标视口均无根滚动条；
- 个人页和发布页第二行内容在超出视口时可正常滚动并完整访问。

自动化结果：

| 检查 | 结果 | 摘要 |
| --- | --- | --- |
| `pnpm format:check` | PASS | 全仓格式通过 |
| `pnpm lint` | PASS | frontend、backend、e2e 通过 |
| `pnpm typecheck` | PASS | frontend、backend、e2e 通过 |
| `pnpm test` | PASS | 前端 43 项、后端 56 项 |
| `pnpm build` | PASS | 前后端生产构建通过 |
| `pnpm ci:validate` | PASS | 常规 CI 静态规则通过 |
| `pnpm test:e2e` | PASS | 105 passed、192 skipped、0 failed |
| `git diff --check` | PASS | 无空白错误 |

本轮未创建子 Agent，未调用 NVM，未安装运行时或浏览器，未操作 Git 或远程 CI。临时文件、测试产物和隔离资源均已清理；用户开发容器未被修改并保持健康。当前等待用户检查并明确确认验收完成。

### 第 5 轮协调 Agent 直接修复

用户报告发布页初始状态仍有 `html` 根滚动条，并明确授权协调 Agent 直接修复、不创建子 Agent。

- 修复前独立探针在 `1440×821` 测得 `scrollHeight=901`、`clientHeight=821`；
- 根因是紧凑布局在 820px 结束，而完整布局要到约 869px 才能容纳，形成中间高度断点空档；
- 紧凑布局现覆盖至 900px；
- 新增 821、850、868px 的严格无根滚动 E2E；
- 修复后上述高度及 720、768、820、875、900、1080 均满足 `scrollHeight === clientHeight`；
- 完整 E2E 为 106 passed、200 skipped、0 failed；
- 前端 43 项、后端 56 项、格式、Lint、类型、构建和 CI 静态校验全部通过。

按用户要求，本轮未创建实施或验收子 Agent。临时探针、运行产物和隔离资源均已清理，当前等待用户检查并明确确认验收完成。
