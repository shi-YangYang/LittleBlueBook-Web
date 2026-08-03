# SPEC-012 验收记录

- Spec：`specs/spec-012-legal-terms-and-more/spec.md`
- 当前 Spec 状态：Accepted
- 验收状态：Accepted
- 最新验收轮次：第 4 轮（PASS）

本文件只记录实施后的独立验收结论和证据，不修改 `spec.md` 中的需求与验收标准。

## 验收门禁

- [x] 用户已明确确认完整 `spec.md`
- [x] Spec 已进入 `Confirmed`
- [x] 实施由一个新的单一实施 Agent 完成
- [x] 实施 Agent 未创建子 Agent
- [x] 实施 Agent 已返回报告并永久退役
- [x] 已创建身份独立的验收 Agent
- [x] 验收 Agent 未修改业务代码
- [x] 初次独立验收已运行一次完整 Browser E2E
- [x] AC-001 至 AC-012 全部通过
- [x] 用户已确认最终验收完成

## 验收标准记录

| 编号 | 结果 | 证据与说明 |
| --- | --- | --- |
| AC-001 | PASS | 隔离副本、正式 runner 运行期五范围和生产构建真实字段均为 `0/0` |
| AC-002 | PASS | 法律页面公开访问、内容覆盖、配置渲染和错误降级通过 |
| AC-003 | PASS | 三类认证弹窗新标签页链接和原表单状态保留通过 |
| AC-004 | PASS | 后端权威版本、挑战绑定、过期和版本变化通过 |
| AC-005 | PASS | 数据库复合唯一和真实并发最终一条通过 |
| AC-006 | PASS | 多会话重新确认幂等和浏览器回归通过 |
| AC-007 | PASS | 回复目标脱敏和登录后年龄受限门禁立即刷新通过 |
| AC-008 | PASS | 更多菜单登录态、顺序、键盘、关闭和焦点恢复通过 |
| AC-009 | PASS | 帮助、反馈、关于页面和外部链接通过 |
| AC-010 | PASS | 空库、历史库、OpenAPI、权限和数据无损通过 |
| AC-011 | PASS | `960×600`、滚动、无障碍及三引擎差异风险通过 |
| AC-012 | PASS | 三浏览器历史失败、来源返回、刷新/直接访问和滚动恢复均独立复验通过 |

## 验收轮次

- 2026-08-03：用户明确回复“开始实施”，确认完整 Spec；SPEC-012 进入 `Confirmed`，等待创建单一实施 Agent。
- 2026-08-03：已创建新的单一实施 Agent `spec012_implementation_round1`，统一承担数据库、后端、前端、Docker 配置和 E2E；已明确禁止该 Agent 创建子 Agent、复述私有法律资料或执行 Git 写操作。
- 2026-08-03：第一轮实施完成；Agent 报告本地配置隔离、数据库迁移、条款接受闭环、年龄门槛、四个公共页面、更多菜单、Docker 只读挂载和正式 E2E 均已实施，实施验证全部通过；该 Agent 未创建子 Agent、未执行 Git 写操作，并已永久退役。
- 2026-08-03：已创建身份独立的验收 Agent `spec012_acceptance_round1`；该 Agent 只执行只读检查和非破坏性验证，按 AC-001 至 AC-012 独立验收，并承担首次独立验收的一次完整 Browser E2E。
- 2026-08-03：第一轮独立验收结论为 `FAIL`；AC-001、AC-005、AC-006、AC-007 和 AC-012 未通过。验收 Agent 未修改业务代码或治理文件、未执行 Git 写操作，测试资源和产物已清理，返回结果后已永久退役。
- 2026-08-03：已创建新的单一返工实施 Agent `spec012_rework_round1`，统一处理接受记录幂等、年龄受限回复信息、登录后门禁刷新、虚构 E2E 配置和旧导航定位器五项失败；等待返工完成后创建新的独立验收 Agent。
- 2026-08-03：第一轮返工完成；Agent 报告五项失败均已修复，13 个迁移、真实并发唯一性、虚构配置隔离、定向测试和完整 Browser E2E `162` 通过、`468` 跳过、`0` 失败；该 Agent 未创建子 Agent、未执行 Git 写操作，并已永久退役。
- 2026-08-03：已创建新的独立复验 Agent `spec012_reacceptance_round2`；该 Agent 只读复验第一轮失败项和直接受影响回归，禁止修改业务代码、创建子 Agent或执行 Git 写操作。
- 2026-08-03：第二轮独立复验确认 AC-005、AC-006、AC-007 和旧导航回归均已修复，但 AC-001、AC-012 仍因 E2E Turbopack 缓存包含真实法律配置字段而失败；协调回合随后被用户中断，Agent 在完成清理与正式报告前被平台释放，已永久退役。
- 2026-08-03：已创建新的单一返工实施 Agent `spec012_rework_round2`，只处理 E2E/Next 仍读取并缓存真实法律配置的问题；等待返工完成后创建新的独立验收 Agent。
- 2026-08-03：`spec012_rework_round2` 在完成根因定位和部分隔离改动后因平台网络连接中断而失败，未返回完成结论；恢复检查确认相关进程和本轮测试产物均不存在，该 Agent 已永久退役，等待新的单一实施 Agent 续作。
- 2026-08-03：已创建新的单一续作实施 Agent `spec012_rework_round3`，负责重新审查部分隔离改动并完成 E2E/Next 对真实法律配置的零读取、零缓存修复。
- 2026-08-03：续作返工完成；Agent 报告物理隔离副本 + Webpack 方案已实现，运行期和清理后五范围真实字段均为 `0/0`，生产构建和 Chromium 定向场景通过；Docker Desktop 未启动，正式 runner 无法连接 PostgreSQL/Redis。Agent 未创建子 Agent、未执行 Git 写操作，并已永久退役。
- 2026-08-03：SPEC-012 暂进入 `Blocked`。解除条件为用户启动 Docker Desktop；解除后创建新的独立验收 Agent，复验 AC-001、AC-012 和直接受影响回归。
- 2026-08-03：用户已启动 Docker Desktop；协调 Agent 确认 Docker Engine、PostgreSQL 和 Redis 可用，外部阻塞解除。
- 2026-08-03：已创建新的独立验收 Agent `spec012_reacceptance_round3`，负责运行正式 runner、验证运行期五范围零命中并复验直接受影响回归；禁止修改业务代码、创建子 Agent或执行 Git 写操作。
- 2026-08-03：第三轮独立复验结论为 `FAIL`；AC-001 至 AC-011 通过，AC-012 因 Chromium 详情返回连续进入 `about:blank` 未通过。验收 Agent 未创建子 Agent、未修改业务代码或治理文件、未执行 Git 写操作，资源和产物已清理，返回结果后永久退役。
- 2026-08-03：已创建新的单一返工实施 Agent `spec012_rework_round4`，只处理 Chromium 详情返回来源、安全回退和滚动恢复；等待返工完成后创建新的独立验收 Agent。
- 2026-08-03：`spec012_rework_round4` 完成 Chromium 原失败修复和部分增强回归后因平台用量限制中断，未返回完整结论并永久退役；遗留 Firefox/WebKit 连续导航竞态由新的单一续作 Agent 处理。
- 2026-08-03：`spec012_rework_round5` 完成测试同步竞态与列表页刷新来源判断修复；定向 `20/20`、三浏览器正式隔离回归 `6/6` 和运行中/清理后五范围 `0/0` 通过，返回报告后永久退役。
- 2026-08-03：已创建新的独立验收 Agent `spec012_reacceptance_round4`，仅复验 AC-012、三浏览器历史失败和直接相邻行为。
- 2026-08-03：第四轮独立复验结论为 `PASS`；AC-001 至 AC-012 全部通过，当前等待用户最终确认。验收 Agent 未修改业务代码、测试或治理文件，未执行 Git 写操作，资源和产物已清理，返回结果后永久退役。
- 2026-08-03：用户完成本地测试并明确确认“没有问题”；最终验收完成，SPEC-012 更新为 `Accepted`。

## 第一轮实施证据摘要

- 后端全量 `23/23` 套件、`139/139` 测试通过；前端全量 `15/15` 文件、`97/97` 测试通过；
- Lint、TypeScript、Prettier、Prisma、前后端生产构建和差异检查通过；
- 空库与现有库全部 `12` 个迁移、历史库升级探针通过；
- Chromium SPEC-012 `5/5`，Firefox/WebKit 差异场景 `4/4` 通过；
- 镜像内无真实配置，只读挂载和健康检查通过；源码及最终 `.next` 的真实资料扫描为 `0` 命中；
- `frontend/config/legal.local.json` 由协调 Agent 独立确认命中 `.gitignore` 且未被 Git 跟踪；
- 当前等待新的独立验收 Agent 按 AC-001 至 AC-012 验收。

## 第 1 轮独立验收（FAIL）

### 通过证据

- Node.js `v24.9.0`，未调用 NVM；
- 格式、Lint、三工作区类型、Prisma 校验、前后端生产构建和 `pnpm ci:validate` 通过；
- 前端全量 `15/15` 文件、`97/97` 测试通过；后端全量 `23/23` 套件、`141/141` 测试通过；
- SPEC-012 三引擎定向场景 `9` 通过、`36` 按设计跳过；
- 空库全部 `12` 个迁移和 SPEC-011 历史库升级通过；
- Docker 未挂载配置时健康检查 `503`，只读挂载后健康检查和 `/about` 为 `200`，挂载 `RW=false`；
- 可版本化文件、客户端静态包、Next standalone 和后端构建产物的真实资料扫描均为 `0` 命中；
- `legal.local.json` 已忽略、未跟踪且未进入镜像或 standalone；
- `960×600` 公共页面、自适应、滚动和无障碍验证通过。

### 失败证据

1. 真实 PostgreSQL 18 空库应用全部迁移后，同一用户、同一条款版本、同一隐私版本和同一 `RECONFIRMATION` 场景，使用不同会话证据键连续写入两次均成功，计数为 `2`；数据库唯一约束仅覆盖证据键。
2. 公开回复目标映射只检查目标评论是否删除，没有检查目标作者 `ageRestrictedAt`，受限作者昵称仍可能出现在回复关系中。
3. 首页和共享 AuthDialog 登录成功只更新局部用户状态，没有触发全局法律状态刷新；历史年龄受限账号需导航、刷新或首次写请求失败后才出现限制门禁。
4. 正式 E2E 直接读取用户真实 `legal.local.json`，虽然未复制进任务目录且产物已清理，仍违反测试只能使用虚构法律配置的边界。
5. 首次完整 Browser E2E 共 `612` 项，结果 `149` 通过、`452` 跳过、`11` 失败；失败均因 `getByRole('link', { name: '我' })` 同时匹配“我”和“关于我们”，覆盖 Chromium、Firefox、WebKit 的认证、注册和个人页回归。

### 清理与结论

- 隔离数据库、Redis、容器、卷、网络、Docker 验收镜像、`frontend/.next-e2e`、`e2e/test-results` 和 `test/spec-012-acceptance-round-1` 已清理；
- 现有 `node_modules` 和用户真实本地配置按规则保留；
- AC-001、AC-005、AC-006、AC-007、AC-012 未通过，SPEC-012 进入 `Rework Required`。

## 第一轮返工证据摘要

- 新增 `20260803000200_enforce_legal_acceptance_idempotency` 兼容迁移，旧迁移未修改；
- 复合唯一约束和 `createMany(skipDuplicates)` 使不同会话并发确认最终只有一条同版本同场景记录；
- replyTo 目标作者年龄受限脱敏和认证成功后的全局门禁刷新已补测试；
- E2E 使用任务目录虚构法律配置并显式传递路径，真实本地配置保持 untouched；
- 历史失败定向复验、13 个迁移、Lint、类型和 Prisma 校验通过；
- 最终完整 Browser E2E `162/162` 有效执行项通过，`468` 按矩阵设计跳过，`0` 失败；
- 当前等待新的独立验收 Agent 复验第一轮失败项和直接受影响回归。

## 第 2 轮独立复验（FAIL）

### 已通过的返工项

- 后端定向 `3` 个套件、`15` 个测试通过；前端定向 `4` 个文件、`30` 个测试通过；
- 空库应用全部 `13` 个迁移；历史库同语义重复删除一条并保留最早记录，不同版本、场景和用户记录全部保留；
- 数据库复合唯一索引真实存在，两个独立数据库会话并发写入最终只有一条；
- replyTo 目标作者受限脱敏、首页与共享 AuthDialog 登录/注册后的全局门禁刷新通过；
- 正式三引擎定向 E2E `23` 通过、`94` 按矩阵设计跳过、`0` 失败；“我/关于我们”定位回归通过；
- 第一轮返工的最终完整 Browser E2E `162` 通过、`468` 跳过、`0` 失败仍具代表性，本轮未机械重复完整套件。

### 剩余失败

- 页面实际使用任务目录内虚构法律配置；
- 但本轮运行新生成的 `frontend/.next-e2e` Turbopack 缓存中，用户真实法律配置的两个私有字段分别命中 `3` 个缓存文件；
- 缓存文件创建时间属于本轮，证明 E2E/Next 依赖图仍读取真实 `frontend/config/legal.local.json`；
- AC-001、AC-012 未通过，不能以删除缓存产物替代修复真实读取路径。

### 中断与清理状态

- 第二轮复验 Agent 未修改业务代码、测试、迁移或治理文件；
- 协调回合在 Agent 完成最终报告前被用户中断，恢复时平台已释放该 Agent；
- 任务目录已不存在；`frontend/.next-e2e` 和 `e2e/test-results` 仍存在，由协调 Agent 按既定测试产物规则清理；
- Docker Desktop 当前未运行，无法查询容器状态；复验此前使用的隔离资源已在 runner 阶段报告自动清理。

## 第二轮返工续作证据摘要

- 正式 E2E runtime helper `3/3`、配置路径/loader/healthz `14/14` 通过；
- 前端与 E2E Lint、类型、Prettier、语法、差异检查和生产 Turbopack 构建通过；
- 隔离 Webpack 运行中四个公共页面及 healthz 均为 `200`，页面实际使用虚构法律配置；
- Chromium 公共法律页面定向用例 `1/1` 通过；
- tracked/source、client-static、runtime-cache、test-results 和任务目录在运行中与清理后均为 `0/0` 真实字段命中；
- 未运行正式 runner，唯一原因是 Docker Desktop 未启动；该项未报告为通过。

## 第 3 轮独立复验（FAIL）

### 已通过证据

- 配置路径、loader、healthz `14/14`，E2E runtime helper `3/3`，前端/E2E Lint、类型和差异检查通过；
- 生产 Next.js Turbopack 构建通过，tracked/source、client-static 和完整 `.next` 真实字段均为 `0/0`，standalone 不含真实本地文件；
- 正式 runner 运行期间 tracked/source、client-static、完整 runtime-cache、test-results 和完整 task-root 均为 `0/0`；
- `/about`、`/terms`、`/privacy`、`/help`、`/healthz` 均使用虚构配置并验证成功；
- SPEC-012 主流程、认证、个人页、新标签页、焦点、“我”导航和 dirty Forward 相关回归通过；
- 正式 runner 部署全部 `13` 个迁移并完成历史迁移探针；用户 dev 容器保持原 ID 且健康。

### 唯一失败

- 意外完整矩阵为 `160` 通过、`468` 跳过、`2` 失败；其中 dirty Forward 随后定向通过；
- 修正参数后的定向正式 runner 为 `22` 通过、`10` 跳过、`1` 失败；
- 唯一稳定失败为 Chromium `keeps detail scrolling internal and restores the feed position on Back`；
- 从首页进入详情并点击“返回上一页”后实际到达 `about:blank`，Firefox/WebKit 同用例通过；
- 返工范围限定为详情来源/历史判断、安全回退和滚动恢复，不重复已通过的隐私与条款实现。

### 清理

- 本轮任务目录、隔离容器、卷、网络、端口、`.next-e2e`、test-results 和生产构建产物已清理；
- 用户真实法律配置、现有 `node_modules`、用户 dev 容器和无关 `test/spec010-direct-fix-e2e` 未触碰。

## 第 4 轮返工未完成记录

- 已改为消费经过同源与详情循环校验的来源路径并执行 `router.replace`，不再依赖 `window.history.back()`；
- Chromium 原始 `about:blank` 历史失败已通过，首页、个人页、搜索页、刷新和直接访问场景已加入增强 E2E；
- 前端定向测试 `19/19` 以及相关 Lint、类型和 E2E 静态检查通过；
- 实施 Agent 因平台用量限制在增强回归结束前中断，未返回完整报告，结果不得计为返工完成；
- 遗留 E2E 结果为 Firefox、WebKit 各一项导航中断：上一来源页的异步路由替换与下一次 `page.goto` 发生竞态；Chromium 增强场景通过；
- 当前仍维持第 3 轮 `FAIL` 结论和 `Implementing` 状态，等待新的单一实施 Agent 完成竞态修复后再进行独立复验。

## 第 5 轮返工证据摘要

- Firefox/WebKit 遗留失败已定位为同一 E2E Page 连续导航的同步竞态，现按来源使用独立 Page，不使用固定延时；
- 列表页刷新后再进入详情的来源判断边界已修复，详情页本身刷新与直接访问仍安全回首页；
- 前端定向 `20/20`、相关 Lint、frontend/e2e 类型检查和差异检查通过；
- 正式隐私隔离 runner 三浏览器定向回归 `6/6` 通过，覆盖全部三项历史失败及首页、个人页、搜索页、刷新、直接访问与滚动恢复；
- 运行期间与清理后五个扫描范围真实字段均为 `0/0`；测试产物和隔离资源已清理；
- 当前等待新的独立验收 Agent 对 AC-012 和直接受影响回归作出独立结论。

## 第 4 轮独立复验（PASS）

- 独立审查确认来源采用一次性消费，仅接受安全同源路径，拒绝跨域、协议相对地址和详情页循环；实现与测试均未加入固定延时；
- 前端定向测试 `20/20`，相关前端/E2E Lint、frontend/e2e TypeScript 和 `git diff --check` 全部通过；
- 正式隐私隔离 runner 三浏览器定向回归 `6/6` 通过，覆盖 Chromium 原 `about:blank`、Firefox/WebKit 原导航中断、首页/个人页/带查询参数搜索页、详情刷新、直接访问、详情内部滚动和列表滚动恢复；
- 列表页刷新后进入详情由一次性无落盘 Playwright 探针和永久单元测试共同验证，Chromium、Firefox、WebKit 全部通过；
- 运行期间及清理后，tracked/source、client-static、完整 runtime-cache、test-results、完整 task-root 均为 `0/0`；
- 未重复完整 `630` 项：AC-001 至 AC-011 已独立通过，本轮局部返工未发现共享路由或 runner 风险，历史失败与直接相邻行为均已覆盖；
- 相关进程、隔离容器、卷、网络、测试结果、Next E2E 缓存、本轮任务目录和一次性日志均已清理；用户 dev 容器保持健康，无关测试目录未触碰；
- AC-012 独立复验为 `PASS`，因此 AC-001 至 AC-012 全部通过；Spec 继续保持 `Accepting`，等待用户明确确认后才能标记 `Accepted`。

## 用户最终确认

- 确认日期：2026-08-03；
- 用户本地测试结果：没有问题；
- 最终结论：`Accepted`；
- CI 仍按项目约定由用户提交后按需手动运行，CI 结果不改变本次 Spec 已完成状态。
