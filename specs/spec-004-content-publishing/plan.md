# SPEC-004 实施计划

- Spec：`specs/spec-004-content-publishing/spec.md`
- Spec 状态：Accepting
- 计划状态：Round 5 Direct Fix Complete；Awaiting User Confirmation
- 更新日期：2026-07-26

本计划只拆分用户已确认的 `spec.md` 版本 1.0。全部范围必须由一个实施 Agent 串行完成前端、后端、数据库、媒体存储和 E2E 改动，不得并行拆分或创建子 Agent。

## 1. 数据与媒体基础

- 建立笔记和有序图片数据模型、迁移、索引与约束；
- 建立可配置的本地媒体存储接口；
- 实现随机对象 Key、图片验证、元数据读取和失败清理；
- 为后端 Docker 运行定义持久化媒体挂载；
- 补充环境变量示例和运行文档。

## 2. 发布接口与发布页

- 实现受会话保护的发布接口和防重复提交；
- 实现标题、正文、图片数量、类型、大小和内容校验；
- 实现双栏发布页、图片预览、移除、排序和封面标识；
- 实现话题占位、发布状态、错误重试和未保存内容提醒；
- 实现未登录登录续接和会话失效后的表单保留。

## 3. 推荐与个人笔记

- 实现公开推荐游标分页接口；
- 实现当前用户笔记游标分页接口；
- 移除首页演示卡片；
- 接入首页“推荐”和个人主页“笔记”；
- 复用真实笔记卡片、空状态、加载更多和错误重试。

## 4. 笔记详情

- 实现公开详情接口和 `/explore/{noteId}`；
- 实现参考图双栏结构和多图轮播；
- 实现纯文本正文、相对时间和不存在状态；
- 实现关注、评论、点赞、收藏和分享占位；
- 验证长正文、媒体失败和根元素滚动。

## 5. 测试与文档

- 后端覆盖数据、事务、媒体安全、清理、分页和权限；
- 前端覆盖发布、列表、详情、登录续接、占位和异常状态；
- Playwright 覆盖端到端真实发布闭环和三个桌面视口；
- 同步 OpenAPI、README、环境变量和运行说明；
- 运行 lint、typecheck、单元/集成测试、构建与本地 Browser E2E；
- 不把 Browser E2E 加回常规 CI。

## 6. 交付门禁

- 用户确认 `spec.md` 前不得创建实施 Agent；
- 每一轮只创建一个实施 Agent；
- 实施 Agent 不得创建子 Agent；
- 实施完成后创建不同身份的单一验收 Agent；
- 验收 Agent 不修改业务代码；
- 用户最终确认后才能将 Spec 更新为 `Accepted`。

## 7. 第 1 轮实施结果

- 实施 Agent：`spec004_content_publishing_implementation`
- 状态：`COMPLETED`
- 子 Agent：未创建
- NVM：未调用，Node.js 为 `v24.9.0`
- Git：未暂存、未提交、未推送

实施完成了数据迁移、本地媒体存储、发布/推荐/个人笔记/详情 API、发布页、真实信息流、个人笔记、详情双栏与轮播、互动占位及对应测试。

实施自测结果：

- `pnpm format:check`：通过
- `pnpm lint`：通过
- `pnpm typecheck`：通过
- `pnpm test`：前端 37 项、后端 56 项通过
- `pnpm db:validate`、`pnpm db:generate`：通过
- `pnpm build`、`pnpm docker:build`：通过
- `pnpm test:e2e`：93 项通过、168 项按矩阵设计跳过、0 失败
- `pnpm ci:validate`、`git diff --check`：通过

实施报告已处理，Agent 已停止并永久退役；实施自测不作为最终验收结论。

## 8. 第 1 轮独立验收结果

- 验收 Agent：`spec004_content_publishing_acceptance`
- 结论：`FAIL`
- 身份：与第 1 轮实施 Agent 独立
- 子 Agent：未创建
- 业务代码：未修改
- NVM：未调用，Node.js 为 `v24.9.0`
- 临时测试文件、Playwright 产物、隔离容器、网络、卷和端口：已清理
- 用户现有 `littlebluebook-dev` PostgreSQL 与 Redis：未停止或修改

通过项为 AC-001～AC-009、AC-011、AC-013～AC-016。需要返工：

1. AC-010：30.5 天前的笔记实际显示“30天前”；规格要求实际时间差超过 30 天即显示具体日期。
2. AC-012：发布页存在未保存标题时使用浏览器 Back，未出现确认对话并直接返回首页，表单丢失。

第 1 轮完整自动化检查均通过，包括前端 37 项、后端 56 项和 Browser E2E 93 项；验收 Agent 通过额外边界探针发现上述两个现有测试未覆盖的问题。第 1 轮验收 Agent 已停止并永久退役。

## 9. 第 2 轮返工范围

第 2 轮只处理第 1 轮验收确认的两个失败项，不扩展产品范围：

- 按实际毫秒差实现 30 天时间边界，并覆盖 30 天、刚超过 30 天和 30.5 天的回归测试；
- 拦截发布页未保存状态下的浏览器历史返回/前进离开，取消离开时保留 URL 和表单，确认后正常离开；
- 保持现有站内返回、刷新/关闭提醒、发布成功清除未保存状态和会话失效续接行为；
- 为两个缺陷增加前端测试和 Playwright 回归覆盖；
- 完成影响范围测试后运行完整本地检查和 Browser E2E。

## 10. 第 2 轮返工结果

- 返工 Agent：`spec004_rework_round2`
- 状态：`COMPLETED`
- 子 Agent：未创建
- NVM：未调用，Node.js 为 `v24.9.0`
- Git：未暂存、未提交、未推送

返工结果：

- AC-010：抽取可注入当前时间的格式化纯函数，按实际毫秒差判断 30 天边界；恰好 30 天显示相对时间，超过 30 天显示具体日期；
- AC-012：新增不制造哨兵历史记录的位置追踪；Chromium 使用 Navigation API 在遍历提交前拦截，Firefox/WebKit 使用带方向判断的 `popstate` 回弹；支持 Back/Forward 的取消与确认；
- 取消离开会保留 `/publish`、标题、正文和图片预览，且不增加 `history.length`；
- 现有自有返回按钮、`beforeunload`、401 续登与发布成功清除未保存状态的行为保持不变；
- 新增时间边界单元测试、History/发布页组件测试，以及三浏览器真实 Back/Forward Playwright 回归。

返工自测：

- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`：通过
- `pnpm test`：前端 46 项、后端 56 项通过
- `pnpm build`、`pnpm ci:validate`：通过
- 三浏览器定向历史导航 E2E：6 项通过
- `pnpm test:e2e`：99 passed、180 skipped、0 failed
- `git diff --check`：通过

数据库、迁移、依赖和 Dockerfile 未发生变化，因此返工 Agent 未重复运行 Docker 镜像构建；完整 E2E 已在隔离数据库执行迁移。临时文件、Playwright 产物、隔离容器、网络、卷和端口均已清理，用户开发容器未被修改。返工 Agent 已停止并永久退役，当前等待新的独立复验 Agent。

## 11. 第 2 轮独立复验结果

- 复验 Agent：`spec004_reacceptance_round2`
- 结论：`FAIL`
- 身份：与所有实施和返工 Agent 独立
- 子 Agent：未创建
- 业务代码：未修改
- NVM：未调用，Node.js 为 `v24.9.0`
- 临时测试文件与隔离资源：已清理

复验结论：

- AC-010：`PASS`。恰好 30 天、超过 30 天 1 毫秒和 30.5 天的确定性测试通过；真实数据库 30.5 天笔记详情显示具体日期；
- AC-012：`FAIL`。首次 Back/Forward 取消能够保留表单，但取消后对同一历史项再次尝试时：
  - Chromium Forward 不再触发确认，也不离开 `/publish`；
  - WebKit Back 确认后越过首页进入 `about:blank`；
  - Firefox Back/Forward 均正确；
- AC-015：`FAIL`。布局与轮播兼容性通过，但 AC-012 的 Chromium/WebKit 历史返回流程不兼容。

规定命令均通过：前端 46 项、后端 56 项，完整 Browser E2E 为 99 passed、180 skipped、0 failed。独立复验通过额外的“同一页面、同一历史项取消后再次确认”探针发现现有受版本控制 E2E 的覆盖缺口。复验 Agent 已停止并永久退役。

## 12. 第 3 轮返工范围

第 3 轮只处理 AC-012 的重试缺陷及其对 AC-015 的影响，不修改已通过的 AC-010：

- 修复 Chromium Forward 首次取消后无法再次遍历并确认离开的问题；
- 修复 WebKit Back 首次取消后再次确认会跳过正确首页目标的问题；
- 保持 Firefox、首次取消、表单/图片保留、正确目标、`history.length` 不增加、刷新/关闭提醒、自有返回、401 续登和发布成功无误提示等已通过行为；
- 将 Back 和 Forward 的“同一页面、同一历史项：取消后再次尝试并确认”分别加入 Chromium、Firefox、WebKit 的受版本控制 E2E；
- 测试不得再把取消与确认拆到不同页面或不同历史环境；
- 完成影响范围测试与完整本地回归。

## 13. 第 3 轮首次调度中断

- Agent：`spec004_rework_round3`
- 结果：在完成规范与根因初步分析后，因平台额度限制退出；
- 业务代码：未修改；
- 测试：未开始；
- 子 Agent：未创建；
- 处理：该 Agent 已释放并永久退役，不复用其身份；第 3 轮返工范围保持不变，由新的单一实施 Agent 重新执行。

## 14. 第 3 轮返工结果

- 返工 Agent：`spec004_rework_round3_retry`
- 状态：`COMPLETED`
- 子 Agent：未创建
- NVM：未调用，Node.js 为 `v24.9.0`
- Git：未暂存、未提交、未推送

根因与方案：

- Chromium 的 Navigation API 取消 traversal 会使同一 Forward 目标无法可靠重试；
- WebKit 的 `popstate + history.go()` 回弹会在取消后再次 Back 时越过正确目标；
- Next.js App Router 还会与 `popstate` 回弹竞争，使 Chrome 无法稳定拦截；
- 返工移除了 Navigation API 拦截、`popstate` 回弹与全局 History 状态改写；
- 首页与个人页进入发布页、登录成功续接发布页改用跨文档导航；发布页历史离开交由浏览器原生 `beforeunload` 处理；
- 自有返回操作在清除未保存状态后执行文档导航，继续使用已确认的中文确认文案；
- 删除仅服务于旧方案的 `history-position` 实现与测试。

新增受版本控制 E2E 在同一页面、同一历史序列内验证 Back/Forward 的“取消→再次尝试→确认”，并在 Chromium、Firefox、WebKit 中实际执行。取消后 URL、标题、正文、图片预览和 `history.length` 保持不变；确认后到达正确首页。

返工自测：

- 三浏览器定向历史 E2E：6 项通过
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`：通过
- `pnpm test`：前端 41 项、后端 56 项通过
- `pnpm build`、`pnpm ci:validate`：通过
- `pnpm test:e2e`：99 passed、180 skipped、0 failed
- `git diff --check`：通过

本轮未修改数据库、依赖、Dockerfile 或后端镜像，因此未重复构建 Docker 镜像；完整 E2E 已在隔离 PostgreSQL/Redis 中运行迁移和回归。隔离资源、Playwright 产物和临时目录均已清理，用户容器未被修改。为执行 E2E 启动了用户已有 Docker Desktop，当前保持运行。返工 Agent 已停止并永久退役。

## 15. 第 3 轮独立复验结果

- 复验 Agent：`spec004_reacceptance_round3`
- 结论：`PASS`
- AC-001～AC-016：全部通过
- 身份：与所有实施、返工和先前验收 Agent 独立
- 子 Agent：未创建
- 业务代码：未修改
- NVM：未调用，Node.js 为 `v24.9.0`

重点复验证据：

- Chromium、Firefox、WebKit 均在同一页面、同一历史序列中通过 Back/Forward 的“取消→再次尝试→确认”；
- 首次取消后 URL、标题、正文、图片预览和 `history.length` 保持，且只出现一次提示；
- 再次确认后准确返回首页，无 `about:blank`、卡住、跳过、重复提示或历史污染；
- 首页与个人页发布入口、访客登录续接、401 后表单保留及续登、发布成功清除 dirty 状态均通过；
- 三浏览器 × 1280/1440/1920 的详情布局、长文滚动和键盘轮播通过；
- AC-010 的 30 天精确时间边界保持通过。

完整检查：

- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`：通过
- `pnpm test`：前端 41 项、后端 56 项通过
- `pnpm build`、`pnpm ci:validate`：通过
- `pnpm db:validate`、`pnpm db:generate`：通过
- `pnpm test:e2e`：99 passed、180 skipped、0 failed
- `git diff --check`：通过

复验 Agent 未安装浏览器、未运行远程 CI、未操作 Git。临时探针、`test/`、Playwright 产物、隔离容器、网络、卷与端口均已清理；用户容器未被操作。复验 Agent 已停止并永久退役。当前等待用户确认验收完成。

## 16. 第 4 轮用户反馈返工

用户在第 3 轮独立验收通过后、最终确认前提出以下修复：

1. 笔记详情页左上角移除与图片重叠的小蓝书 Logo，改为“返回”按钮；优先返回上一页，没有可用站内上一页时回首页。
2. “我 → 笔记”只有一行卡片时不得出现无意义根元素滚动条，第二行开始才按内容需要滚动。
3. 发布页“添加话题”与“发布笔记”之间增加清晰垂直间距。
4. 发布页无图片或只有一行图片时不得出现无意义根元素滚动条，图片进入第二行后才按内容需要滚动。

本轮由一个新的实施 Agent 串行完成前端和 E2E/组件测试。用户明确要求本轮不创建验收 Agent，因此实施 Agent 的自测报告将直接交由用户审查；在用户确认前 Spec 保持 `Rework Required`。

## 17. 第 4 轮实施结果

- 实施 Agent：`spec004_user_feedback_round4`
- 状态：`COMPLETED`
- 子 Agent：未创建
- 独立验收 Agent：按用户明确要求未创建
- NVM：未调用，Node.js 为 `v24.9.0`
- Git：未暂存、未提交、未推送

修复结果：

- 详情页 Logo 已移除并替换为可键盘操作的“返回”按钮；从站内来源进入时返回来源页，直接访问时回首页，按钮不与媒体重叠；
- 个人页一行笔记在三个目标视口均无根滚动条；第二行超出可用高度时正常滚动并可完整访问；
- 发布页话题占位与发布按钮之间保持 16～24px 垂直间距；
- 发布页无图或第一行图片时三个目标视口均无根滚动条；第二行超出可用高度时正常滚动。

实施自测：

- `pnpm test`：前端 43 项、后端 56 项通过
- `pnpm test:e2e`：105 passed、192 skipped、0 failed，覆盖三浏览器与三个目标视口
- 详情返回三浏览器定向复测：3 项通过
- 详情页单元测试：9 项通过
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm ci:validate`：通过
- 前后端生产构建：通过
- `git diff --check`：通过

临时探针、Playwright 产物、隔离容器、网络、卷和端口均已清理；用户现有 PostgreSQL/Redis 容器未被修改并保持健康。实施 Agent 已停止并永久退役。按用户要求不创建验收 Agent，当前直接等待用户审查。

## 18. 第 5 轮发布页初始滚动修复

用户报告发布页初始状态的 `html` 元素仍有滚动条，并明确要求协调 Agent 直接修复、不创建子 Agent。

根因调查：

- 原紧凑布局媒体查询为 `max-height: 820px`；
- 视口高度从 820px 增加到 821px 时会立即切回完整布局；
- 完整布局实际内容高度约为 869px，表单底部外边距在内容超过 `100vh` 时进一步参与根滚动高度；
- 实测 `1440×821` 下修复前为 `scrollHeight=901`、`clientHeight=821`；
- 既有自动化只测试 720、900、1080 三种高度，因此没有覆盖 821～868px 的断点空档。

直接修复：

- 将发布页紧凑布局覆盖范围从 820px 延伸至 900px；
- 新增 Chromium `1440×821`、`1440×850`、`1440×868` 严格断言 `scrollHeight === clientHeight` 的受版本控制 E2E；
- 修正发布成功单元测试的详情来源模拟顺序，使测试先执行详情页绑定再消费来源，不改变业务逻辑。

验证结果：

- 原始新增 E2E 在修复前稳定失败：`901 !== 821`；
- 修复后 720、768、820、821、850、875、900、1080 高度均为 `scrollHeight === clientHeight`；
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm ci:validate`：通过；
- `pnpm test`：前端 43 项、后端 56 项通过；
- `pnpm build`：通过；
- `pnpm test:e2e`：106 passed、200 skipped、0 failed；
- 临时探针、Playwright 产物和隔离 Docker 资源已清理，用户开发容器未被修改。

本轮未创建任何子 Agent、未调用 NVM、未安装运行时或浏览器、未操作 Git 或远程 CI。
