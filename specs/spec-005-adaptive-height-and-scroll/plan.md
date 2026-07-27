# SPEC-005 实施计划

- Spec：`specs/spec-005-adaptive-height-and-scroll/spec.md`
- Spec 状态：Accepting
- 计划状态：Round 2 Independent Reacceptance PASS；Awaiting User Confirmation
- 更新日期：2026-07-27

用户已于 2026-07-27 确认 `spec.md` v1.0 并明确要求开始实施。本轮由一个新的单一实施 Agent 串行完成全部范围。

## 1. 建立布局与滚动基线

- 审计首页、个人页、发布页、详情页和认证弹框的页面外壳、固定高度、动态视口单位、最小尺寸和溢出规则；
- 分别记录根页面和内部容器在加载、短内容和长内容下的滚动归属；
- 找出重复、相互覆盖或只服务于特定高度的规则；
- 建立能够在修复前暴露现有问题、修复后验证布局不变量的自动化场景。

## 2. 收敛通用页面高度模型

- 统一根元素、页面外壳、侧栏和主内容区的视口高度关系；
- 使用 Flex/Grid 的可收缩布局替代嵌套固定高度计算；
- 明确根页面和内部滚动容器的职责；
- 保留局部组件必要的固定尺寸；
- 不使用隐藏根溢出来掩盖布局错误。

## 3. 逐页改造

按以下顺序由同一个实施 Agent 串行完成：

1. 首页和公共侧栏；
2. 个人页及三个 Tab；
3. 发布页及媒体预览；
4. 笔记详情页；
5. 登录与重新认证弹框。

每完成一类页面，立即运行对应组件测试和浏览器专项，避免全局样式回归在最后集中出现。

## 4. 滚动恢复与生命周期

- 验证首次访问、刷新和站内导航的一致性；
- 验证弹框打开、关闭和组件卸载后的背景滚动恢复；
- 验证从列表进入详情再返回时的滚动位置恢复；
- 验证异步加载和连续改变窗口尺寸不会遗留错误状态。

## 5. 自动化验证

- 组件测试覆盖弹框背景锁定、关闭恢复和页面状态切换；
- E2E 使用小、中、大三类代表性桌面视口；
- E2E 增加同页连续改变视口宽高的行为型断言；
- 分别验证加载、短内容、长内容和多行媒体；
- 跨 Chromium、Firefox、WebKit 验证关键场景；
- 运行 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm ci:validate` 和 `pnpm test:e2e`；
- Browser E2E 不加入常规 CI。

## 6. 预计影响范围

主要影响：

- `frontend/app/globals.css`
- `frontend/app/page.tsx`
- `frontend/app/profile/page.tsx`
- `frontend/app/publish/page.tsx`
- `frontend/app/explore/[noteId]/page.tsx`
- `frontend/app/_components/reauth-dialog.tsx`
- 对应前端测试
- `e2e/tests/` 中相关端到端测试

不应影响：

- `backend/`
- Prisma Schema 和迁移
- API 合同
- 媒体持久化
- Docker 和 CI 工作流

## 7. 风险控制

- 修改全局 CSS 前先记录受影响选择器和页面，避免无关格式整理；
- 不删除现有业务回归测试；
- 不把测试选择的视口尺寸复制为新的产品断点；
- 不通过降低可访问性或裁切内容换取无滚动条；
- 不新增依赖；
- 所有任务由一个实施 Agent 串行完成，实施 Agent 不得创建子 Agent。

## 8. 交付门禁

- 用户明确确认 `spec.md` 后，将状态更新为 `Confirmed`；
- 协调开发 Agent 创建一个新的实施 Agent；
- 实施 Agent 完成并返回后必须释放；
- 协调开发 Agent 创建一个身份独立的新验收 Agent；
- 验收不通过时创建新的单一实施 Agent 返工，再由新的验收 Agent 复验；
- 最新独立验收通过后交由用户审查；
- 用户确认验收完成后将 Spec 更新为 `Accepted` 并提供中文 Conventional Commit 信息。

## 9. 第 1 轮实施结果

- 实施 Agent：`spec005_implementation_round1`
- 状态：`COMPLETED`
- 实施 Agent 未创建子 Agent，报告处理后已停止并永久退役。

完成内容：

- 使用动态视口单位、`clamp()`、Flex 和 Grid 收敛首页、个人页、发布页、详情页和弹框的高度模型；
- 删除发布页按固定视口高度切换的紧凑模式补丁；
- 首页、个人页和发布页在真实溢出时使用文档根页面自然滚动；
- 详情页在支持范围内由右侧详情内容区独立滚动；
- 新增可重入的 `html`/`body` 文档滚动锁、滚动槽补偿和精确样式恢复；
- 新增按来源路径记录并一次性恢复笔记列表滚动位置的能力；
- 新增自适应布局、弹框滚动、详情内部滚动、发布页连续尺寸变化和列表返回恢复测试；
- 未修改后端、数据库、接口、Docker 或 CI。

实施自测：

| 检查 | 结果 | 摘要 |
| --- | --- | --- |
| `node --version` | PASS | `v24.9.0`，未调用 NVM |
| `pnpm format:check` | PASS | 全工作区通过 |
| `pnpm lint` | PASS | frontend、backend、e2e 通过 |
| `pnpm typecheck` | PASS | 三个工作区通过 |
| `pnpm test` | PASS | 前端 47 项、后端 56 项 |
| `pnpm build` | PASS | 前后端构建通过 |
| `pnpm ci:validate` | PASS | 本地基础校验通过 |
| 自适应专项 E2E | PASS | 10 passed、26 skipped、0 failed |
| `pnpm test:e2e` | PASS | 115 passed、218 skipped、0 failed |
| `git diff --check` | PASS | 无空白错误 |

临时副本未创建；Playwright 产物、`.next-e2e`、隔离容器、网络、卷和端口已清理；正常工作区 `node_modules` 保留。

## 10. 第 1 轮独立验收结果

- 验收 Agent：`spec005_acceptance_round1`
- 结论：`FAIL`
- AC-004 至 AC-008：通过；
- AC-001、AC-002、AC-003、AC-009：因首页短信息流假滚动未通过；
- 验收 Agent 未修改业务代码、未创建子 Agent，报告处理后已停止并永久退役。

失败证据：

- 首页推荐接口仅返回一条 `300×400` 封面笔记；
- 在支持范围内连续改变窗口尺寸；
- `1172×656` 时最后一张卡片底部约为 `579px`、信息流网格底部约为 `607px`，均已处于 `656px` 视口内；
- `html` 仍为 `scrollHeight=673`、`clientHeight=656`，存在 17px 纯尾部空白滚动；
- `1225×612` 和 `1596×705` 也能复现；
- 根因范围为首页内容壳动态底部 padding、信息流网格高度和卡片尾部 margin 的组合。

## 11. 第 2 轮返工范围

新的单一返工实施 Agent 只处理以下范围：

- 调整首页信息流尾部间距和内容壳高度关系；
- 当最后一个有意义元素已经完全位于视口内时，根页面不得因纯尾部空白继续滚动；
- 真实长信息流仍必须由根页面自然滚动并可到达末尾；
- 在 `e2e/tests/adaptive-layout.spec.ts` 增加基于“有效内容是否真实溢出”的连续 resize 回归断言；
- 不增加新的固定高度产品断点；
- 不修改后端、接口、视觉结构或已通过的其他滚动模型；
- 完成失败项和相关回归后运行完整检查。

第 2 轮返工 Agent：`spec005_rework_round2`，当前正在执行，禁止创建子 Agent。

验收 Agent 的非阻断环境说明：完整构建会清理当前 `.next/dev`，用户现有 3000 端口前端进程仍监听但健康检查为 500。本轮返工和复验不得停止或重启用户开发服务；最终交付时向用户说明需要自行重启前端。

## 12. 第 2 轮返工结果

- 返工 Agent：`spec005_rework_round2`
- 状态：`COMPLETED`
- 返工 Agent 未创建子 Agent，报告处理后已停止并永久退役。

根因与修复：

- 独立复现确认 `.content-shell` 的 `padding-bottom: clamp(24px, 5dvh, 60px)` 在内容已经容纳时仍把根高度撑出视口；
- 仅移除共享首页内容壳的额外底部 padding，未增加媒体查询、未隐藏滚动条；
- 新增 6 个不规则连续尺寸的回归，依据最后卡片和分页区域的真实文档终点判断是否应滚动；
- 增加 18 条长信息流回归，确认真实长内容仍由根页面自然滚动且末尾可达；
- AC-004 至 AC-008 对应实现未修改。

返工自测：

| 检查 | 结果 | 摘要 |
| --- | --- | --- |
| `node --version` | PASS | `v24.9.0`，未调用 NVM |
| 修复前新增回归 | EXPECTED FAIL | `1172×656` 为 `673/656` |
| 修复后新增回归 | PASS | Chromium 通过 |
| 三浏览器自适应专项 | PASS | 12 passed、0 failed |
| `pnpm format:check` | PASS | 全仓通过 |
| `pnpm lint` | PASS | frontend、backend、e2e 通过 |
| `pnpm typecheck` | PASS | 三个工作区通过 |
| `pnpm test` | PASS | 前端 47 项、后端 56 项 |
| `pnpm build` | PASS | 前后端构建通过 |
| `pnpm ci:validate` | PASS | 本地校验通过 |
| `pnpm test:e2e` | PASS | 118 passed、224 skipped、0 failed |
| `git diff --check` | PASS | 无空白错误 |

返工没有创建项目临时副本；一次性清理脚本、Playwright 产物、`.next-e2e`、隔离资源和测试端口已清理；正常 `node_modules` 保留。

## 13. 第 2 轮独立复验结果

- 复验 Agent：`spec005_reacceptance_round2`
- 结论：`PASS`
- AC-001 至 AC-009 全部通过；
- 复验 Agent 未修改业务代码、未创建子 Agent，报告处理后已停止并永久退役。

历史失败复验：

- `1172×656`：根高度精确为 `656/656`，有效分页终点约 `640px`，无尾部假滚动；
- `1596×705`：根高度精确为 `705/705`，无尾部假滚动；
- `1225×612`：根高度为 `663/612`，但分页有效终点约 `663px`，滚动完全对应真实内容；
- 其余多个不规则连续尺寸在内容可容纳时均无根滚动和横向溢出；
- 18 条长信息流在三种浏览器中均可自然滚动到底，最后卡片和分页可见；
- 未新增高度媒体查询，未隐藏原生滚动条。

独立复验结果：

| 检查 | 结果 | 摘要 |
| --- | --- | --- |
| `node --version` | PASS | `v24.9.0`，未调用 NVM |
| 自适应专项三浏览器 | PASS | 12 passed、24 skipped |
| 独立三浏览器探针 | PASS | 6 passed |
| `pnpm format:check` | PASS | 全仓通过 |
| `pnpm lint` | PASS | frontend、backend、e2e 通过 |
| `pnpm typecheck` | PASS | 三个工作区通过 |
| `pnpm test` | PASS | 前端 47 项、后端 56 项 |
| `pnpm build` | PASS | 前后端构建通过 |
| `pnpm ci:validate` | PASS | 本地基础校验通过 |
| `pnpm test:e2e` | PASS | 118 passed、224 skipped、0 failed |
| `git diff --check` | PASS | 无空白错误 |

临时探针、测试产物和隔离资源已清理；正常工作区 `node_modules` 保留。当前等待用户实际审查并确认验收完成。
