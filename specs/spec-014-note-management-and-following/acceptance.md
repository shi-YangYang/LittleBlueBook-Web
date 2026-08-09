# SPEC-014 验收记录

- Spec：`specs/spec-014-note-management-and-following/spec.md`
- 当前 Spec 状态：Accepting
- 验收状态：PASS（等待用户最终确认）
- 最新验收轮次：Round 2

本文件只记录实施后的独立验收结论和证据，不修改 `spec.md` 中的需求与验收标准。

## 验收门禁

- [x] 用户已明确确认完整 `spec.md`
- [x] Spec 已进入 `Confirmed`
- [x] 实施由一个新的单一实施 Agent 完成
- [x] 实施 Agent 未创建子 Agent
- [x] 实施 Agent 已返回报告并永久退役
- [x] 已创建身份独立的验收 Agent
- [x] 验收 Agent 未修改业务代码或测试
- [x] 初次独立验收已运行一次完整 Browser E2E
- [x] AC-001 至 AC-016 全部通过
- [ ] 用户已确认最终验收完成

## 验收标准记录

| 编号 | 状态 | 验收重点 |
| --- | --- | --- |
| AC-001 | PASS | 浏览器品牌图标、构建输出和非 PWA 边界 |
| AC-002 | PASS | 空库/历史库迁移、内容版本和历史无损 |
| AC-003 | PASS | 作者权限、两处管理入口和点击隔离 |
| AC-004 | PASS | 编辑预载、共同字段、频道和门禁 |
| AC-005 | PASS | 图文图片保留/删除/新增/排序和原子媒体 |
| AC-006 | PASS | 视频不可替换、封面替换和全表面同步 |
| AC-007 | PASS | 内容版本冲突、未保存状态、编辑时间与排序 |
| AC-008 | PASS | 删除确认绑定打开时的内容版本快照，冲突后必须重新打开 |
| AC-009 | PASS | 媒体清理最多重试 5 次并进入 `EXHAUSTED` 终态 |
| AC-010 | PASS | 删除后旧详情互动 404 刷新为已删除状态 |
| AC-011 | PASS | 私有关注列表、字段、排序、分页和 N+1 |
| AC-012 | PASS | 关注列表首屏使用稳定结构骨架并保持状态可访问 |
| AC-013 | PASS | 取消关注确认、统计同步和私信权限回归 |
| AC-014 | PASS | 服务端安全、隐私、错误和日志 |
| AC-015 | PASS | 1280 视口无图片裁切且三浏览器焦点/滚动覆盖通过 |
| AC-016 | PASS | 返工最终完整 E2E 全绿，独立复验历史失败项与受影响回归全绿 |

## 独立验收要求

- 验收 Agent 必须独立阅读完整 Spec、计划、关联决策和当前差异；
- 不得以实施 Agent 的报告代替独立验证；
- 不得修改业务代码、测试、Spec 或验收标准；
- 不得创建子 Agent或执行 Git 写操作；
- 必须使用无隐私的小型图片和视频夹具；
- 必须验证数据库真实迁移、独立内容版本和条件并发；
- 必须验证媒体删除失败后的重启/定时恢复，不只检查成功路径；
- 必须验证关注名单无法被他人读取；
- 初次独立验收运行一次完整 Browser E2E；
- 临时副本只能位于仓库根 `test/` 的任务专属目录，结束后按项目规则清理；
- 未运行项必须说明依据，不得记为通过。

## 验收轮次

### Round 1

- 日期：2026-08-09
- 验收层级：初次独立验收
- 状态：`FAIL`
- 自动化：Prisma generate/validate、三包 lint/typecheck、后端定向 6 套 54 项、前端定向 3 文件 16 项、生产构建均通过；完整 Browser E2E 为 153 passed、512 skipped、19 failed；clean-room SPEC-014 定向为 5 passed、22 skipped。
- 失败项：
  1. 删除确认框未快照打开时的内容版本；409 后原确认框可使用父级刷新后的版本重试删除；
  2. 笔记被外部删除后，旧详情中的互动 404 只显示通用失败，不进入“笔记不存在或已删除”状态；
  3. 媒体清理任务失败后始终回到 `READY`，`attempts` 递增但没有最大次数或终止状态；
  4. 关注列表首屏只有加载文字，没有结构稳定的头像、昵称和按钮骨架；
  5. 新 E2E 长期保留关注、通知和限流身份状态，污染完整套件；
  6. Chromium/WebKit 的 1280 视口发布页第二行第 4 张图片被裁切，且管理确认/关注模态框缺少 Firefox/WebKit 差异覆盖。
- 非阻断观察：Firefox 16px 间距浮点精度、dirty forward 导航上下文销毁、Windows 媒体目录 `EPERM`、WebKit native-only `Temporal.Duration` 异常。
- 清理：验收任务目录、隔离容器/卷、报告和构建产物已删除；未触碰既有 `test/spec010-direct-fix-e2e`，未保留本轮专属 `node_modules`。
- 结论：进入返工；返工后由新的独立验收 Agent 覆盖全部历史失败项和受影响回归。

### Round 2

- 日期：2026-08-09
- 验收层级：返工后独立复验；返工实施已在最终工作区状态运行完整 Browser E2E 并全绿，且之后没有相关业务变化，因此本轮不重复全套，只独立复验历史失败项和受影响回归；
- 状态：`PASS`
- 复验范围：Round 1 的 AC-008、AC-009、AC-010、AC-012、AC-015、AC-016 全部失败项，以及受影响的 AC-002、AC-004～007、AC-011、AC-013～014 回归；
- 返工实施证据仅作辅助：Prisma、lint/typecheck、相关测试和构建通过；clean-room 10 passed、14 skipped；历史失败链路 26 passed、26 skipped；完整 Browser E2E 177 passed、534 skipped、0 failed。
- 2026-08-09：用户指出重复完整 E2E 没有必要；协调 Agent 取消本轮尚未开始的完整 E2E，并将同一最终状态不重复全套的规则写入项目测试与返工工作流。
- 独立静态与自动化：Prisma generate/validate、后端 9 套 69 项、前端 4 文件 33 项、私信 2 项、三包 lint/typecheck、前后端生产构建和 `git diff --check` 全部通过；
- 独立 Browser 定向：Chromium、Firefox、WebKit 共 23 passed、37 skipped、0 failed，覆盖删除版本竞态、旧详情删除态、媒体清理/写入故障、关注骨架/分页/焦点、1280 布局、视频封面和历史导航；
- 完整回归证据：返工最终工作区的完整 Browser E2E 为 177 passed、534 skipped、0 failed；本轮按用户确认的规则不重复同一最终状态的完整全套；
- 历史失败复验：AC-008、AC-009、AC-010、AC-012、AC-015、AC-016 全部转为 `PASS`，受影响回归无失败；
- 非阻断观察：WebKit native-only `Temporal.Duration`、既有 Next Image 尺寸/LCP 警告和 PostgreSQL 测试客户端弃用提示，均未影响应用断言；
- 清理：本轮临时目录、隔离容器/卷、测试报告和构建产物已清理；保留既有 `node_modules`，未触碰 `test/spec010-direct-fix-e2e`；
- 结论：`PASS`，等待用户最终确认后将 Spec 标记为 `Accepted`。
