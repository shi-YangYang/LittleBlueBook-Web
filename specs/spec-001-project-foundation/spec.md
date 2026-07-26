# SPEC-001：项目工程基础

- 状态：Accepted
- 版本：1.3
- 创建日期：2026-07-24
- 更新日期：2026-07-24
- 负责人：协调开发 Agent
- 关联决策：
  - `.ai/decisions/0001-ci-cd-deployment-baseline.md`
  - `.ai/decisions/0002-application-foundation-stack.md`

## 1. 背景

LittleBlueBook-Web 当前只有项目治理和规格文档，尚未建立前端、后端、数据库、缓存、测试和 CI 工程骨架。后续业务 Spec 需要一个可重复安装、可本地运行、可测试、可构建且可容器化的基础环境。

本 Spec 只建立工程能力，不实现登录、用户、笔记、互动、搜索、推荐等业务功能。

## 2. 目标

完成后，项目应具备：

1. 统一的 pnpm Workspace；
2. 可独立开发和构建的 Next.js 前端；
3. 可独立开发和构建的 NestJS 后端；
4. PostgreSQL、Prisma 和 Redis 基础连接；
5. 跨平台的本地开发命令；
6. 前端、后端和浏览器端到端测试骨架；
7. 可构建的前后端生产 Docker 镜像；
8. 可在 `dev` 分支上手动执行的 CI；
9. 足以让新开发者从干净工作区启动项目的说明。

## 3. 技术基线

| 领域 | 基线 |
| --- | --- |
| 运行时 | Node.js 24（确认时为 Active LTS） |
| 包管理 | pnpm 11 Workspace |
| 前端 | Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4 |
| 后端 | NestJS 11、TypeScript、默认 Express Adapter、REST、OpenAPI |
| 数据库 | PostgreSQL 18 |
| ORM | Prisma ORM 7、PostgreSQL Driver Adapter、Prisma Migrate |
| 缓存基础设施 | Redis 8 |
| 前端测试 | Vitest 4、React Testing Library |
| 后端测试 | Jest 30、Supertest |
| 端到端测试 | Playwright 1 |
| 本地基础设施 | Docker Compose |
| CI | GitHub Actions |

实施时应使用上述 Major 版本中相互兼容的最新稳定版本，并通过 `package.json`、`packageManager`、Node 版本文件和 `pnpm-lock.yaml` 固定精确结果。不得使用 Preview、Canary、Beta 或 Early Access 版本。

## 4. 范围

### 4.1 范围内

- 根目录 pnpm Workspace 和统一脚本；
- `frontend/` Next.js 应用；
- `backend/` NestJS 应用；
- Tailwind CSS 基础接入；
- 后端环境变量校验；
- PostgreSQL 与 Prisma 基础接入；
- Redis 客户端基础接入；
- 开发用 PostgreSQL、Redis Docker Compose；
- 前后端健康检查；
- OpenAPI 文档；
- ESLint、Prettier 和 TypeScript 严格检查；
- 前端、后端和端到端测试；
- 前后端生产 Dockerfile；
- `.github/workflows/ci.yml`；
- 根 README 和环境变量示例。

### 4.2 范围外

- 登录、注册、身份认证和权限；
- 用户及用户资料数据模型；
- 笔记、评论、点赞、收藏、关注等业务模型；
- 信息流、搜索、推荐和通知；
- 图片或视频上传接口；
- 媒体存储接口的业务实现；
- 正式产品视觉设计和 UI 组件库；
- `release-images.yml` 和 `deploy-production.yml`；
- 生产服务器初始化、域名、HTTPS 和生产环境配置；
- GHCR 推送、生产数据库迁移和生产回滚；
- S3、CDN、Kubernetes 或多服务器编排。

## 5. 工程结构要求

最低目录结构为：

```text
LittleBlueBook-Web/
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
├── frontend/
├── e2e/
├── compose.yaml
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── README.md
```

当前不创建没有实际消费者的共享业务包。`packages/` 可以预留在 Workspace 匹配规则中，但不得为了形式建立空包或虚构共享模型。

## 6. 功能与工程要求

### FR-001：Workspace 与统一命令

根目录必须：

- 使用 pnpm Workspace 管理 `frontend/`、`backend/` 和后续可选的 `packages/*`；
- 在 `package.json` 中固定 pnpm 版本；
- 提供 Node.js 24 版本声明；
- 提供以下跨平台命令，且命令不得依赖 Bash 专用语法：

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 并行启动前端和后端开发服务 |
| `pnpm infra:up` | 启动 PostgreSQL 和 Redis |
| `pnpm infra:down` | 停止开发基础设施但不主动删除数据卷 |
| `pnpm infra:logs` | 查看开发基础设施日志 |
| `pnpm lint` | 检查前后端及适用根目录代码 |
| `pnpm format:check` | 检查格式但不修改文件 |
| `pnpm typecheck` | 执行前后端 TypeScript 检查 |
| `pnpm test` | 执行前后端自动化测试 |
| `pnpm test:e2e` | 执行 Playwright 端到端测试 |
| `pnpm build` | 构建前端和后端 |
| `pnpm docker:build` | 验证前端和后端生产镜像均可构建 |

### FR-002：前端基础

`frontend/` 必须：

- 使用 Next.js App Router 和 TypeScript；
- 使用 Tailwind CSS，但不引入业务 UI 组件库；
- 启用 TypeScript 严格模式；
- 提供最小首页，显示“小蓝书”和明确的工程初始化状态，不承诺最终视觉设计；
- 提供 `GET /healthz`，成功时返回 HTTP 200 和 JSON：

```json
{
  "status": "ok",
  "service": "frontend"
}
```

- 通过环境变量配置后端基础 URL；
- 不在浏览器环境暴露服务端密钥；
- 支持生产构建和独立启动。

### FR-003：后端基础

`backend/` 必须：

- 使用 NestJS、TypeScript 和默认 Express Adapter；
- 采用模块化单体结构；
- 启用 ESM，以满足 Prisma 7 运行要求；
- 启用 TypeScript 严格模式；
- 业务 API 使用 `/api/v1` 前缀；本 Spec 不创建业务接口；
- 在非生产环境按配置提供 OpenAPI UI 和 JSON 文档；
- 对环境变量进行启动时校验，缺少必要配置时快速失败并输出不含敏感值的明确错误；
- 仅允许配置的前端 Origin 进行跨域访问；
- 提供：
  - `GET /health/live`：只检查应用进程，正常时返回 HTTP 200；
  - `GET /health/ready`：检查 PostgreSQL 和 Redis，全部可用时返回 HTTP 200，任一不可用时返回 HTTP 503；
- 健康接口返回结构中必须包含整体状态和服务名称，不得包含密码、连接串或其他敏感配置。

### FR-004：PostgreSQL 与 Prisma

- PostgreSQL 开发服务使用 Major 版本 18；
- 后端使用 Prisma ORM 7 和 PostgreSQL Driver Adapter；
- 建立 Prisma Schema、Client 生成和迁移命令；
- 本 Spec 不创建虚构业务表；
- 后续迁移文件必须进入版本控制，并由迁移历史驱动 Schema 变化；
- 禁止使用会绕过版本化迁移历史的生产自动同步方式；
- 就绪检查必须真实验证数据库连接，而不是只检查配置存在。

最低数据库命令包括：

- `db:generate`
- `db:validate`
- `db:migrate`
- `db:deploy`
- `db:studio`

### FR-005：Redis

- 开发服务使用 Redis Major 版本 8；
- 后端建立可注入、可关闭的 Redis 连接生命周期；
- 应用关闭时释放 Redis 连接；
- 本 Spec 不实现缓存、Session、队列、限流或 Pub/Sub 业务；
- 就绪检查必须真实执行 Redis 探测命令。

### FR-006：本地开发基础设施

`compose.yaml` 必须：

- 只承载本地开发所需的 PostgreSQL 和 Redis；
- 使用明确的 Major 版本镜像，不使用无版本约束的镜像；
- 提供健康检查；
- 使用命名数据卷保存本地数据；
- 将端口默认绑定到 `127.0.0.1`，并允许通过环境变量覆盖；
- 不包含真实生产凭据；
- `docker compose down` 默认不得删除数据卷。

前端和后端默认在宿主机通过 pnpm 运行。开发者不需要在宿主机安装 PostgreSQL 或 Redis。

### FR-007：配置与敏感信息

- 提供根目录及前后端所需的 `.env.example`；
- 示例值只能使用非敏感的本地占位值；
- `.gitignore` 必须排除真实 `.env`、构建产物、测试产物、本地数据和媒体目录；
- 生产配置不得写入 Docker 镜像；
- 日志、错误响应和健康检查不得输出密码、Token 或完整连接串；
- 开发配置应明确前端、后端、PostgreSQL 和 Redis 的默认端口，并允许覆盖。

### FR-008：代码质量

- 使用 ESLint Flat Config；
- 使用 Prettier 统一格式；
- TypeScript 使用严格模式；
- `lint`、`format:check`、`typecheck`、`test` 和 `build` 必须是互相独立的命令；
- 检查命令默认不得修改文件；
- 不设置没有业务意义的全局覆盖率百分比门槛，但新增的可观察行为必须有对应测试。

### FR-009：自动化测试

最低自动化验证包括：

- 前端首页渲染“小蓝书”；
- 前端 `/healthz` 返回约定结构；
- 后端存活检查在应用启动时返回成功；
- 后端就绪检查在 PostgreSQL 和 Redis 可用时返回成功；
- 后端就绪检查在依赖不可用时返回失败；
- Prisma Schema 可以校验并生成 Client；
- Playwright 能从浏览器访问前端首页；
- Playwright 能验证前端服务健康接口；
- 测试不得依赖生产服务或真实外部凭据。

### FR-010：生产 Dockerfile

前端和后端分别提供生产 Dockerfile，并满足：

- 使用 Node.js 24 基础镜像；
- 使用多阶段构建；
- 使用锁文件进行可重复安装；
- 最终运行阶段不包含不必要的开发依赖；
- 最终进程使用非 root 用户；
- 只复制运行所需产物；
- 提供适用的 `.dockerignore`；
- 不烘焙 `.env` 或生产密钥；
- 前端使用适合独立容器运行的 Next.js 输出；
- 镜像启动后可通过对应健康接口验证。

### FR-011：CI

`.github/workflows/ci.yml` 必须：

- 只允许通过 `workflow_dispatch` 手动触发；
- 手动运行时选择 `dev` 分支；
- 不响应 `push` 或 `pull_request`，避免普通提交自动消耗 CI 资源；
- 使用最小只读仓库权限；
- 使用 Node.js 24 和仓库固定的 pnpm 版本；
- 使用冻结锁文件安装依赖；
- 启动隔离的 PostgreSQL 18 和 Redis 8 测试服务；
- 依次执行格式检查、Lint、类型检查、数据库校验、前后端单元/集成测试、应用构建和 Docker 构建验证；
- 不安装浏览器、不执行 Playwright Browser E2E；Browser E2E 保留为本地实施和独立验收能力；
- 对同一分支的新提交取消已经过时的进行中任务；
- 失败时保留足以诊断问题的测试报告；不得包含敏感信息；
- 不推送镜像、不连接服务器、不部署生产环境。

仓库分支保护属于 GitHub 外部配置，本 Spec 不直接修改远端仓库设置。由于 CI 采用纯手动触发，不将该 Job 配置为自动 Required Check。

### FR-012：开发文档

根 `README.md` 必须说明：

- 前置软件和版本；
- 首次安装步骤；
- 环境变量创建方式；
- 基础设施启动和停止方式；
- 前后端启动方式和默认地址；
- 测试、检查、构建和 Docker 构建命令；
- Prisma 开发迁移的基本流程；
- 常见启动失败的排查入口；
- 当前尚未实现的业务能力。

文档中的命令必须能够从干净工作区按顺序执行，不得依赖未说明的全局工具。

## 7. 非功能约束

### NFR-001：可重复性

- 依赖必须由 `pnpm-lock.yaml` 固定；
- Node.js 和 pnpm 版本必须在仓库中声明；
- CI 与生产 Docker 构建必须使用相同 Node.js Major 版本；
- 不得依赖开发者机器上的全局 Nest、Next、Prisma 等 CLI。

### NFR-002：跨平台开发

- 根目录脚本必须可在 Windows PowerShell、macOS 和 Linux 使用；
- 不得在 `package.json` 中依赖 Bash 专用命令串；
- 路径处理不得硬编码用户机器绝对路径。

### NFR-003：安全基线

- 不提交真实密钥；
- 开发数据库和 Redis 默认只绑定本机回环地址；
- 容器运行用户使用最小权限；
- CI 使用的外部 Action 必须固定到不可变 Commit SHA，并在实施报告中列出来源和固定版本；
- 日志和报告不得泄露敏感配置。

### NFR-004：范围控制

- 工程基础不得引入未确认的业务实体、接口或页面；
- 不得以“以后可能需要”为由创建空微服务、空共享包或复杂抽象；
- 不得实现正式发布或生产部署。

## 8. 验收标准

### AC-001：干净安装

在满足 README 前置条件的干净工作区中，依照文档可以完成冻结锁文件安装，且无需安装全局项目 CLI。

### AC-002：本地基础设施

执行 `pnpm infra:up` 后，PostgreSQL 和 Redis 均通过健康检查；执行 `pnpm infra:down` 后再次启动，开发数据卷仍存在。

### AC-003：本地启动

基础设施就绪后执行 `pnpm dev`，前端和后端均能启动，默认端口无冲突，日志不包含敏感连接信息。

### AC-004：前端行为

- 首页显示“小蓝书”和工程初始化提示；
- `GET /healthz` 返回 HTTP 200 及约定 JSON；
- 前端生产构建成功。

### AC-005：后端行为

- 存活检查返回 HTTP 200；
- PostgreSQL 和 Redis 可用时，就绪检查返回 HTTP 200；
- 任一必要依赖不可用时，就绪检查返回 HTTP 503；
- 非生产环境的 OpenAPI 文档可以访问；
- 后端生产构建成功。

### AC-006：数据工具

- Prisma Schema 校验和 Client 生成成功；
- 数据库命令存在且职责清晰；
- 仓库中不存在虚构的用户、笔记等业务表。

### AC-007：统一检查

以下命令均成功：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm docker:build
```

### AC-008：Docker 镜像

- 前端和后端生产镜像均可从仓库根目录构建；
- 容器以非 root 用户运行；
- 容器中不包含真实 `.env`；
- 两个容器启动后健康接口均可验证。

CI 仍属于本 Spec 的工程实现范围，但自版本 1.1 起不再单独设置为验收项，也不作为 Spec 完成门禁。CI 配置由实施和本地检查验证；远程运行结果属于提交后的反馈，不影响 Spec 状态。

### AC-010：文档与敏感信息

- README 可以指导新开发者完成安装、启动、测试和构建；
- 示例环境文件完整但不含真实敏感值；
- Git 检查未发现被提交的真实环境文件、密钥、构建产物或本地数据。

### AC-011：范围

未实现本 Spec 范围外的业务功能、正式镜像发布或生产部署。

## 9. 已知风险

- Prisma 7 使用 ESM 和 Driver Adapter，NestJS、Jest 和 Docker 构建配置必须保持一致；
- Windows 本地开发与 Linux CI 的脚本差异可能导致“本地可用、CI 失败”；
- Playwright 与服务启动顺序需要可靠的健康等待机制；
- Docker 构建上下文需要兼容 pnpm Workspace，避免复制无关文件或破坏缓存；
- 本地完整 Playwright 验收仍依赖浏览器和服务编排；常规 CI 不重复运行 Browser E2E，但不得因此省略具体 Spec 要求的本地浏览器验收。

## 10. 确认记录

- 用户于 2026-07-24 明确确认本 Spec。
- 用户再次确认运行时使用 Node.js 24；确认时该版本线处于 Active LTS。
- 第一轮实施 Agent 已创建，Spec 当前进入 `Implementing`。
- 第一轮实施 Agent 已完成并返回报告，Spec 当前进入 `Accepting`。
- 第一轮独立验收中，现行全部验收项 AC-001 至 AC-008、AC-010、AC-011 均已通过；当时仅因旧版 AC-009 要求远程 CI 记录而标记为 `BLOCKED`。
- 用户于 2026-07-24 确认版本 1.1：CI 不再单独作为 Spec 验收项，Spec 完成状态与 CI 结果无关。
- 用户确认本 Spec 验收完成，状态更新为 `Accepted`。
- 提交 `1dcecf9` 触发的 GitHub Actions 运行 `30041580870` 最终成功，耗时 2 分 58 秒；该记录仅作为非门禁工程反馈留档。
- 用户于 2026-07-24 确认版本 1.2：日常开发转到 `dev`，CI 改为只通过 `workflow_dispatch` 手动选择 `dev` 运行，通过后再合并到 `main`；普通推送和 Pull Request 不再自动触发。
- 版本 1.2 的 CI 配置变更已由独立验收 Agent 验证通过，用户于 2026-07-24 明确确认验收完成；本 Spec 保持 `Accepted` 状态。
- 用户于 2026-07-26 确认版本 1.3：Browser E2E 移出常规 CI，继续作为项目源码和本地 Spec 验收能力保留；常规 CI 仍检查 E2E 源码的 Lint 与类型。
- 本版本为实施和独立验收的权威依据。实质变更必须重新进入 `In Review` 并由用户确认。
