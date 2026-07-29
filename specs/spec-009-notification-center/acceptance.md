# SPEC-009 验收记录

- Spec：`specs/spec-009-notification-center/spec.md`
- 当前 Spec 状态：Accepted
- 验收状态：PASS, User Confirmed
- 最新验收轮次：第一轮返工后独立复验

本文件只记录实施后的独立验收结论和证据，不修改 `spec.md` 中的需求与验收标准。

## 验收门禁

- [x] 用户已明确确认完整 `spec.md`
- [x] Spec 已经过 `Confirmed` 门禁
- [x] 实施由新的单一实施 Agent 完成
- [x] 实施 Agent 未创建子 Agent
- [x] 实施 Agent 已返回报告并永久退役
- [x] 已创建身份独立的验收 Agent
- [x] 验收 Agent 未修改业务代码
- [x] 初次独立验收实际运行一次完整 Browser E2E
- [x] 独立验收结论为 `PASS`
- [x] 用户已确认最终验收完成

## 验收标准记录

| 编号 | 结果 | 证据与说明 |
| --- | --- | --- |
| AC-001 | PASS | 空库及历史库迁移、索引、删除策略和不回填通过 |
| AC-002 | PASS | 四类通知和本人动作排除通过 |
| AC-003 | PASS | 幂等、取消后重建和事务边界通过 |
| AC-004 | PASS | 匿名、跨用户权限和登录恢复通过 |
| AC-005 | PASS | 四分类、`20 + 7` 分页和游标作用域通过 |
| AC-006 | PASS | 新通知、单条已读、失效目标和计数通过 |
| AC-007 | PASS | 全部已读后服务端未读数为 `0` |
| AC-008 | PASS | `27` 条徽标、清零、匿名和 `99+` 逻辑通过 |
| AC-009 | PASS | 通知行、准确时间及目标路由通过 |
| AC-010 | PASS | 评论删除和失效目标降级通过 |
| AC-011 | PASS | 请求版本和取消机制阻止旧分页响应污染新 Tab，正式竞态测试 `5/5` 通过 |
| AC-012 | PASS | `960×600` 空/长列表滚动与溢出通过 |
| AC-013 | PASS | Tab、键盘、异步和徽标语义通过 |
| AC-014 | PASS | DTO、OpenAPI、权限、游标和纯文本边界通过 |
| AC-015 | PASS | 通知→SPEC-007 顺序回归通过，SPEC-009 身份隔离且 Firefox/WebKit 关键场景通过 |

## 验收过程记录

- 2026-07-29：用户确认不回填上线前历史互动，SPEC-009 进入 `In Review`；
- 2026-07-29：用户明确回复“开始实施”，SPEC-009 通过 `Confirmed` 门禁并进入 `Implementing`；
- 2026-07-29：第一轮实施 Agent `spec009_implementation_round1` 返回 `COMPLETED` 并永久退役，SPEC-009 进入 `Accepting`；
- 2026-07-29：创建身份独立的第一轮验收 Agent `spec009_acceptance_round1`；
- 2026-07-29：第一轮独立验收返回 `FAIL` 并永久退役，SPEC-009 进入 `Rework Required`；
- 2026-07-29：创建新的返工 Agent `spec009_rework_round1`，SPEC-009 重新进入 `Implementing`；
- 2026-07-29：第一轮返工 Agent `spec009_rework_round1` 返回 `COMPLETED` 并永久退役，SPEC-009 再次进入 `Accepting`；
- 2026-07-29：创建新的独立复验 Agent `spec009_reacceptance_round1`；
- 2026-07-29：第一轮返工后独立复验 Agent 返回 `PASS` 并永久退役，等待用户最终确认；
- 2026-07-29：用户明确开始下一项迭代，确认 SPEC-009 最终验收完成，状态更新为 `Accepted`；
- CI 不作为 Spec 验收项。

## 第一轮实施摘要

- 实施 Agent：`spec009_implementation_round1`；
- 状态：`COMPLETED`；
- 新增通知数据库模型、无历史回填迁移、四类互动事务性通知、分类分页、未读数量、单条已读和全部已读 API；
- 所有现有侧边栏接入通知入口和未读徽标，完成登录意图恢复及 `/notifications` 四 Tab 页面；
- 完成目标失效降级、约 `300ms` 骨架、空态、失败重试、请求竞争、键盘、自适应高度和滚动；
- 定向后端测试 `13/13`、API 集成 `5/5`、定向前端测试 `36/36` 通过；
- 全量单元/集成测试：前端 `70/70`、后端 `86/86` 通过；
- SPEC-009 Chromium `2/2`、SPEC-007 Chromium 回归 `3/3` 通过；
- 格式、Lint、类型、Prisma 生成、数据库校验和前后端构建通过；
- 完整 Browser E2E 未在实施阶段运行，按分层策略交由初次独立验收；
- Node.js `v24.9.0`，未调用 NVM、未安装 Node.js、未创建子 Agent、未执行 Git 写操作；
- 隔离 Docker 资源和 `test/` 临时媒体目录已清理，用户 dev 容器未受影响；
- 协调检查仍看到被 Git 忽略的 `frontend/.next-e2e/dev` 缓存目录，交由独立验收在最终清理时核实处理；
- `frontend/next-env.d.ts` 在 Git 状态中显示换行标记但无内容差异，交由独立验收确认。

## 第一轮独立验收

- 验收 Agent：`spec009_acceptance_round1`；
- 结论：`FAIL`；
- 已通过：AC-001 至 AC-010、AC-012 至 AC-014；
- 失败一（AC-011）：`frontend/app/notifications/page.tsx` 的加载更多请求使用同一渲染闭包中的 `activeTab` 和 `expectedTab`，切换 Tab 后旧请求仍可能把旧分类数据追加到新列表；
- 失败二（AC-015）：`e2e/tests/notifications.spec.ts` 复用 SPEC-007 用户和会话，并在结束时保留点赞、收藏和关注关系，导致完整 E2E 中 SPEC-007 统计从期望 `2` 变为 `4`，关注状态发生反转；
- 失败三（AC-015 及跨浏览器置信度）：通知正式 E2E 只在 `chromium-1440` 运行，没有为 Firefox 和 WebKit 提供 Spec 要求的 Tab、通知跳转、登录恢复、键盘和滚动关键覆盖；
- 常规检查：格式、Lint、类型、数据库校验、单元/集成测试、构建和 `git diff --check` 均通过；
- 完整 Browser E2E：`136 passed / 348 skipped / 2 failed`；
- 返工边界：
  - 为加载更多接入请求版本或 `AbortController`，切换 Tab 时作废旧请求，并增加正式可控延迟竞态测试；
  - 为 SPEC-009 E2E 使用独立用户/会话，或可靠清理全部互动和笔记，保证执行顺序独立；
  - 保留 Chromium 完整闭环，并为 Firefox/WebKit 增加精简关键场景；
- 验收 Agent 未修改业务代码或正式测试，未调用 NVM、未安装 Node.js、未创建子 Agent；
- 一次性竞态脚本、`e2e/test-results/`、`frontend/.next-e2e/`、空 `test/` 目录和隔离 Docker 资源已清理，用户 dev 容器未受影响。

## 第一轮返工摘要

- 返工 Agent：`spec009_rework_round1`；
- 状态：`COMPLETED`；
- AC-011：加载更多接入独立请求版本和 `AbortController`，切换 Tab、重新加载或卸载时作废旧请求；
- 新增可控返回顺序的正式组件回归，证明旧 Tab 的分页响应不会追加到新 Tab；
- AC-015：通知 E2E 改用 SPEC-009 独立用户、邮箱和会话，不再复用 SPEC-007 状态；
- 为 Firefox 和 WebKit 增加 URL Tab、键盘切换、浏览器返回、通知跳转、登录恢复及 `960×600` 滚动关键覆盖；
- 通知组件测试 `5/5` 通过；
- 通知→SPEC-007 同环境 Chromium 组合回归 `5 passed / 1 skipped`，历史统计和关注反转均未复现；
- 三浏览器相关组合 `9 passed / 9 skipped`，跳过项均按项目职责分配，Firefox/WebKit 关键场景实际执行；
- 修改范围 Lint、类型、格式和 `git diff --check` 通过；
- 按小范围返工策略未重复整仓完整 Browser E2E，初次验收已经实际运行一次完整矩阵；
- Node.js `v24.9.0`，未调用 NVM、未安装 Node.js、未创建子 Agent、未执行 Git 写操作；
- 隔离 Docker、三个 `test/spec009-rework-round1-*` 目录、E2E 产物和 Next.js E2E 缓存已清理，用户 dev 容器未操作。

## 第一轮返工后独立复验

- 复验 Agent：`spec009_reacceptance_round1`；
- 结论：`PASS`；
- AC-011：独立确认请求版本和 `AbortController` 在 Tab 切换、重载和卸载时作废旧分页请求；正式可控竞态组件测试 `5/5` 通过；
- AC-015 测试隔离：SPEC-009 使用独立用户、邮箱、UUID 和会话；通知→SPEC-007 按历史失败顺序在同一全新隔离环境执行，结果 `5 passed / 1 skipped`，统计和关注污染未复现；
- Firefox/WebKit：通知关键场景实际执行 `2 passed / 4 skipped`，覆盖 URL Tab、键盘、浏览器返回、通知跳转、登录恢复和 `960×600` 滚动；
- 最终 AC-001 至 AC-015 全部 `PASS`；
- 修改范围 Lint、类型、格式和 `git diff --check` 通过；
- 初次独立验收已经运行一次完整 Browser E2E，本轮按小范围返工复验策略未重复整仓矩阵；
- Node.js `v24.9.0`，未调用 NVM、未安装 Node.js 或浏览器、未创建子 Agent、未执行 Git 写操作；
- 两轮隔离 E2E 的容器、网络、卷、`e2e/test-results`、`frontend/.next-e2e` 和复验临时目录均已清理；
- 用户 dev PostgreSQL 与 Redis 容器未被操作并保持健康；
- 无失败项、阻塞项或非阻断建议。
