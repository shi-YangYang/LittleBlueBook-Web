# 小蓝书 Web _(LittleBlueBook-Web)_

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

小蓝书，专为西格玛男士打造

小蓝书是聚焦男性用户的 Web 内容社区，参考内容社区的信息架构，并采用蓝色品牌视觉形成差异化体验。

当前版本已经具备社区首页、邮箱验证码注册与登录、会话恢复以及登录用户个人主页。笔记发布、真实关注与互动、搜索、推荐和媒体上传等能力尚未实现，后续功能均通过 SDD（规格驱动开发）流程逐项交付。

## 目录

- [背景](#背景)
- [安装](#安装)
- [使用](#使用)
- [开发与测试](#开发与测试)
- [CI](#ci)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [API](#api)
- [维护者](#维护者)
- [贡献](#贡献)
- [许可证](#许可证)

## 背景

小蓝书当前仅面向 Web 端，产品定位聚焦男性社区。项目使用 pnpm Workspace 管理前后端，通过 PostgreSQL 保存业务数据、Redis 提供基础设施能力，并使用 Docker Compose 管理本地依赖。

项目采用 SDD 与多 Agent 协作流程。每项业务功能都必须先在 [`specs/`](specs/) 中形成并确认 Spec，再依次经过实施、独立验收和用户确认。项目级目标、技术约束和协作规则分别记录在 [`constitution/`](constitution/)、[`.ai/`](.ai/) 和 [`AGENTS.md`](AGENTS.md)。

当前已完成：

- 小蓝书品牌化社区首页；
- 邮箱验证码注册、登录、会话恢复与退出登录；
- 用户昵称、小蓝书号、性别及个人主页；
- “笔记”“收藏”“点赞”个人主页标签页和真实空状态；
- 前后端测试、Playwright E2E、生产镜像与手动 CI 工程基础。

## 安装

### 依赖

- Node.js 24
- Corepack（随 Node.js 24 提供）
- pnpm 11.9.0（由根目录 `package.json` 固定）
- Docker Engine 与 Docker Compose

项目不依赖全局安装的 Next.js、NestJS、Prisma、Vitest、Jest 或 Playwright CLI。

### 安装项目

确认 Node.js 版本，启用项目指定的 pnpm，并安装依赖：

```shell
node --version
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm --version
pnpm install --frozen-lockfile
```

`node --version` 应显示 `v24.x`，`pnpm --version` 应显示 `11.9.0`。依赖安装完成后会自动生成 Prisma Client。

从示例创建本地环境文件。

PowerShell：

```powershell
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
```

macOS 或 Linux：

```shell
cp .env.example .env
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

根据本地环境修改这些文件。邮箱验证码功能需要在 `backend/.env` 中配置 SMTP 发件账号和授权码。环境文件包含本地或真实凭据，不得提交到 Git。

## 使用

确保 Docker 已启动，然后在仓库根目录运行：

```shell
pnpm dev:local
```

该命令会依次启动 PostgreSQL 与 Redis、应用已有数据库迁移，并启动前端和后端开发服务。

默认服务地址：

| 服务                   | 地址                               |
| ---------------------- | ---------------------------------- |
| 前端                   | http://127.0.0.1:3000              |
| 前端健康检查           | http://127.0.0.1:3000/healthz      |
| 后端存活检查           | http://127.0.0.1:3001/health/live  |
| 后端就绪检查           | http://127.0.0.1:3001/health/ready |
| OpenAPI UI（非生产）   | http://127.0.0.1:3001/docs         |
| OpenAPI JSON（非生产） | http://127.0.0.1:3001/docs-json    |
| PostgreSQL             | 127.0.0.1:5432                     |
| Redis                  | 127.0.0.1:6379                     |

停止前后端进程后，关闭本地基础设施：

```shell
pnpm infra:down
```

`infra:down` 不会删除命名数据卷。只有明确需要清空本地开发数据时，才应自行执行带 `--volumes` 的 Docker Compose 命令。

其他常用启动方式：

```shell
# 只启动 PostgreSQL 和 Redis
pnpm infra:up

# 前后端同时启动，不自动启动基础设施或应用迁移
pnpm dev

# 单独启动前端或后端
pnpm --filter frontend dev
pnpm --filter backend dev

# 查看基础设施日志
pnpm infra:logs
```

## 开发与测试

### 常用检查

```shell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm db:generate
pnpm test
pnpm build
pnpm docker:build
```

### Browser E2E

Playwright 配置和 E2E 测试属于项目源码并纳入 Git。首次运行前安装需要的浏览器：

```shell
pnpm --filter e2e exec playwright install chromium firefox webkit
pnpm test:e2e
```

`pnpm test:e2e` 会启动隔离的 PostgreSQL、Redis、后端和前端，等待健康检查完成后运行浏览器测试，并在结束时清理测试服务。Playwright 报告、截图、录像和 Trace 等单次运行产物不会纳入 Git。

Browser E2E 用于本地实施和独立验收，不进入常规 CI。常规 CI 仍通过根级 Lint 和类型检查验证 `e2e/` 测试源码。

### Prisma 数据库迁移

Prisma Schema 位于 [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)。

新增已确认的数据模型时：

```shell
pnpm infra:up
pnpm db:migrate --name <migration-name>
pnpm db:generate
pnpm typecheck
pnpm test
```

提交前应检查并一同提交生成的迁移 SQL。`pnpm db:deploy` 只应用已经存在的迁移，供本地一键启动和后续部署流程使用；项目不使用生产自动 Schema 同步。

### Docker 镜像

```shell
pnpm docker:build
```

该命令从仓库根目录构建：

- `littlebluebook-frontend:local`
- `littlebluebook-backend:local`

两个 Dockerfile 均使用 Node.js 24、多阶段构建和非 root 运行用户。生产环境变量在容器启动时注入，不会写入镜像。

### 常见问题

- **无法识别 `pnpm`**：执行 `corepack enable` 和 `corepack prepare pnpm@11.9.0 --activate`，然后重新打开终端。
- **Node.js 版本不匹配**：使用现有 NVM 切换到 Node.js 24，再重新检查 `node --version`。
- **5432 或 6379 端口被占用**：修改根 `.env` 中的 `POSTGRES_PORT` 或 `REDIS_PORT`，并同步调整 `backend/.env` 中的连接地址。
- **3000 或 3001 端口被占用**：停止占用端口的进程，再重新启动开发服务。
- **后端提示配置无效**：确认 `backend/.env` 已从示例创建，并填写所有必填配置。
- **就绪检查返回 503**：运行 `docker compose ps` 检查 PostgreSQL 和 Redis，再查看 `pnpm infra:logs`。
- **Prisma Client 缺失**：运行 `pnpm db:validate` 和 `pnpm db:generate`。
- **Playwright 缺少浏览器**：运行 Browser E2E 章节中的安装命令。
- **Docker 无法拉取基础镜像**：检查 Docker daemon、Docker Hub 网络和代理设置。

## CI

常规 CI 位于 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)，只接受 GitHub Actions 的 `workflow_dispatch` 手动触发，不响应 `push` 或 `pull_request`。

CI 执行：

- 冻结锁文件安装；
- CI 配置静态校验；
- Prettier、ESLint 和 TypeScript 检查；
- Prisma Schema 校验与 Client 生成；
- 前后端单元和集成测试；
- 前后端生产构建；
- 前后端 Docker 镜像构建验证。

常规 CI 不安装浏览器，也不运行 Browser E2E；它不发布镜像、不连接服务器、不执行生产部署。

手动验证 `dev`：

1. 将代码推送到 `dev`。
2. 打开仓库的 **Actions** 页面。
3. 选择 **CI** 工作流。
4. 点击 **Run workflow**。
5. 在 **Use workflow from** 中选择 `dev`。
6. 再次点击 **Run workflow** 并等待结果。
7. CI 通过后，将 `dev` 合并到 `main`。

支持 `workflow_dispatch` 的工作流文件必须先存在于默认分支，GitHub Actions 页面才会显示 **Run workflow** 按钮。CI 是提交后的反馈机制，不属于 Spec 验收项，也不会改变已经确认完成的 Spec 状态。

## 项目结构

```text
frontend/       Next.js Web 前端
backend/        NestJS REST API
e2e/            Playwright E2E 测试源码
constitution/   项目使命、路线图和技术约束
specs/          已确认和进行中的功能规格
docs/           外部参考资料
.ai/            决策、工作流、Prompt 和 Agent 规则
.github/        GitHub Actions 工作流
scripts/        项目级辅助与校验脚本
compose.yaml    PostgreSQL 与 Redis 本地开发服务
```

## 技术栈

| 领域  | 技术                                             |
| ----- | ------------------------------------------------ |
| 前端  | Next.js 16、React 19、TypeScript、Tailwind CSS 4 |
| 后端  | NestJS 11、REST、OpenAPI、TypeScript             |
| 数据  | PostgreSQL 18、Prisma ORM 7、Redis 8             |
| 测试  | Vitest 4、Jest 30、Playwright 1                  |
| 工程  | Node.js 24、pnpm 11 Workspace、Docker Compose    |
| CI/CD | GitHub Actions、GHCR、Docker Compose             |

详细且具有约束力的技术说明见 [`constitution/tech-stack.md`](constitution/tech-stack.md)。

## API

后端 REST API 的默认基础地址为：

```text
http://127.0.0.1:3001/api/v1
```

开发环境启动后，可通过以下地址查看完整接口定义：

- OpenAPI UI：http://127.0.0.1:3001/docs
- OpenAPI JSON：http://127.0.0.1:3001/docs-json

当前 API 覆盖邮箱验证码、注册、登录、会话、退出登录和当前用户资料读取。服务端凭据和 SMTP 授权码不会通过浏览器公开配置暴露。

## 维护者

[@shi-YangYang](https://github.com/shi-YangYang)

## 贡献

问题和建议请通过 [GitHub Issues](https://github.com/shi-YangYang/LittleBlueBook-Web/issues) 提交。仓库接受符合项目流程的 Pull Request，但涉及产品行为或业务能力的改动必须先形成并确认 Spec。

贡献前请阅读 [`AGENTS.md`](AGENTS.md) 以及对应的 Constitution、Spec 和项目规则。提交标题使用 Conventional Commits 类型前缀，标题描述和正文使用中文。

## 许可证

[MIT](LICENSE) © 2026 [shi-YangYang](https://github.com/shi-YangYang)
