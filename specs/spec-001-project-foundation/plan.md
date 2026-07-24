# SPEC-001 实施计划

- Spec：`specs/spec-001-project-foundation/spec.md`
- Spec 状态：Accepted
- 计划状态：Completed
- 更新日期：2026-07-24

本计划描述如何实施已定义需求，不扩大或修改 `spec.md`。用户已确认 Spec，本计划可以作为实施 Agent 的任务依据。

## 1. 实施边界

允许新增或修改：

- 根目录工程配置和 README；
- `frontend/`；
- `backend/`；
- `e2e/`；
- `compose.yaml`；
- `.github/workflows/ci.yml`；
- 与本 Spec 直接相关的 `.gitignore`、环境变量示例和测试配置；
- 必要的技术栈说明同步。

不得实施：

- 业务页面、业务接口和业务数据模型；
- Release、CD 和生产服务器脚本；
- 远端 GitHub 设置修改；
- Git 提交、推送或创建 Pull Request；
- 生产环境和外部服务操作。

## 2. 实施顺序

### 阶段 A：根 Workspace

1. 建立 Node.js、pnpm 和 Workspace 版本约束。
2. 建立根脚本、格式规范、Git 忽略项和环境变量示例。
3. 确保所有根脚本跨 Windows、macOS 和 Linux。

### 阶段 B：前端

1. 初始化 Next.js App Router、TypeScript、ESLint 和 Tailwind。
2. 建立最小首页和 `/healthz`。
3. 建立 Vitest、React Testing Library 和对应测试。
4. 配置生产独立输出。

### 阶段 C：后端

1. 初始化 NestJS、ESM、环境变量校验、REST 前缀和 OpenAPI。
2. 接入 Prisma 7、PostgreSQL Driver Adapter 和数据库命令。
3. 接入 Redis 客户端生命周期。
4. 建立存活和就绪检查。
5. 建立 Jest、Supertest 和依赖可用/不可用测试。

### 阶段 D：开发基础设施

1. 建立 PostgreSQL 18 和 Redis 8 的 `compose.yaml`。
2. 添加健康检查、回环端口绑定和命名数据卷。
3. 验证基础设施停止与重启不会默认删除数据卷。

### 阶段 E：端到端测试

1. 建立 Playwright 配置。
2. 建立可靠的前后端启动与健康等待机制。
3. 验证前端首页和健康接口。
4. 记录失败时的 Trace、截图或报告。

### 阶段 F：生产镜像

1. 为前端和后端建立多阶段 Dockerfile。
2. 使用 pnpm Workspace 锁文件进行构建。
3. 将最终容器切换为非 root 用户。
4. 验证镜像启动和健康接口。

### 阶段 G：CI 与文档

1. 建立 `ci.yml` 和服务容器。
2. 配置缓存、并发取消、最小权限和失败报告。
3. 执行全部强制检查和 Docker 构建。
4. 完善根 README，按干净环境流程复验。

## 3. 验证矩阵

| 范围 | 最低验证 |
| --- | --- |
| Workspace | 冻结安装、所有根脚本可解析 |
| 前端 | Vitest、类型检查、生产构建、健康接口 |
| 后端 | Jest、Supertest、Prisma 校验和生成、生产构建 |
| 数据依赖 | PostgreSQL/Redis 健康、就绪检查成功与失败路径 |
| E2E | Playwright 首页与健康检查 |
| Docker | 两个镜像构建、非 root、容器健康 |
| CI | 手动触发、`dev` 分支约束和 Workflow 静态检查；远程运行属于提交后反馈，不作为 Spec 验收门禁 |
| 安全 | 密钥扫描式检查、环境文件和镜像内容检查 |
| 文档 | 从干净工作区逐步执行 README |

## 4. 实施报告要求

实施 Agent 必须返回：

- 实际使用的精确依赖版本；
- 完整改动文件清单；
- 每条验收标准的实现映射；
- 已执行命令、退出结果和耗时较长的检查；
- 未执行或无法执行的检查及原因；
- 当前 Git 状态和已有无关改动；
- 已执行的 CI 配置检查；远程运行链接如已存在可作为非门禁反馈提供；
- 任何需要协调开发 Agent 处理的决策问题。

## 5. 风险控制

- 先验证 Prisma 7、NestJS ESM 和 Jest 的最小兼容闭环，再扩展后端配置；
- Docker 构建从一开始使用 Workspace 根上下文，避免最后补容器时大规模调整；
- 所有等待服务逻辑使用健康检查或确定性轮询，不使用固定长时间睡眠；
- CI Action 优先使用官方来源并固定版本；
- 不为通过脚手架测试创建虚假业务表或业务接口；
- 发现 Major 版本不兼容时停止实施并返回协调开发 Agent，不得擅自降级或替换技术栈。
