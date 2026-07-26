# 小蓝书 Web

小蓝书是面向男性社区的 Web 内容社区项目。当前仓库完成的是项目工程基础：前端、后端、开发数据库与 Redis、自动化测试、生产镜像和 CI 骨架；登录、用户、笔记、互动、搜索、推荐和媒体上传等业务能力尚未实现。

## 前置软件

- Node.js 24
- Corepack（随 Node.js 24 提供）
- pnpm 11.9.0（由 Corepack 按根 `package.json` 固定）
- Docker Engine 和 Docker Compose

项目不依赖全局安装的 Next.js、NestJS、Prisma、Vitest、Jest 或 Playwright CLI。

## 首次安装

确认运行时版本，并启用仓库固定的 pnpm：

```shell
node --version
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm --version
pnpm install --frozen-lockfile
```

`node --version` 应显示 `v24.x`，`pnpm --version` 应显示 `11.9.0`。安装过程会生成 Prisma Client。

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

这些示例只包含本地开发占位值。不要将真实凭据提交到仓库。

## 本地开发

PostgreSQL 和 Redis 在 Docker 中运行，前端和后端在宿主机 Node.js 中运行：

```shell
pnpm infra:up
pnpm dev
```

默认地址：

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

查看或停止开发基础设施：

```shell
pnpm infra:logs
pnpm infra:down
```

`infra:down` 不删除命名数据卷。只有明确需要清空本地开发数据时，才应自行执行带 `--volumes` 的 Docker Compose 命令。

前后端也可以单独启动：

```shell
pnpm --filter frontend dev
pnpm --filter backend dev
```

## 检查、测试和构建

基础设施处于健康状态时，依次运行：

```shell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm db:generate
pnpm test
pnpm --filter e2e exec playwright install --no-shell chromium
pnpm test:e2e
pnpm build
pnpm docker:build
```

`pnpm test:e2e` 会确定性等待前后端健康后再执行浏览器测试，该命令用于本地实施和独立验收。常规 CI 不安装浏览器，也不运行 Browser E2E；它仍会检查 `e2e/` 源码的 Lint 和类型，并执行前后端测试、构建及 Docker 构建。CI 不发布镜像，也不连接生产服务器。

## 手动运行 CI

CI 只接受 GitHub Actions 的手动触发。普通的 `push` 和 Pull Request 都不会自动运行 CI，因此只修改文档并推送时不会消耗一次 CI 运行。

GitHub 要求支持 `workflow_dispatch` 的工作流文件已经存在于仓库默认分支，才会在 Actions 页面提供 **Run workflow** 按钮。首次启用时，需要先将包含 `.github/workflows/ci.yml` 的这次变更合并或提交到默认分支 `main`；如果该文件只存在于 `dev`，GitHub 页面可能不会显示手动运行入口。这是一次性的启用步骤，后续日常开发仍在 `dev` 进行。

启用后，按以下步骤验证 `dev`：

1. 将待验证代码推送到 `dev`。
2. 打开 GitHub 仓库的 **Actions** 页面。
3. 在左侧选择 **CI** 工作流。
4. 点击 **Run workflow**。
5. 在 **Use workflow from** 中选择 `dev`。
6. 再次点击 **Run workflow** 并等待运行完成。
7. CI 通过后，再由用户将 `dev` 合并到 `main`。

手动运行会检查所选分支当时的代码和工作流版本。CI 是提交后的反馈机制，不属于 Spec 验收项，也不会改变已经确认完成的 Spec 状态。

## Prisma 开发迁移

Prisma Schema 位于 `backend/prisma/schema.prisma`。当前工程基础没有业务模型，也没有虚构业务表。

后续 Spec 新增已确认的数据模型时：

1. 修改 Prisma Schema；
2. 启动 PostgreSQL：`pnpm infra:up`；
3. 创建并应用开发迁移：`pnpm db:migrate --name <migration-name>`；
4. 检查并提交生成的迁移 SQL；
5. 重新生成 Client：`pnpm db:generate`；
6. 运行类型检查和测试。

`pnpm db:deploy` 只应用已经存在的迁移，供后续部署流程使用；本项目不使用生产自动 Schema 同步。`pnpm db:studio` 可在本地打开 Prisma Studio。

## Docker 镜像

`pnpm docker:build` 从仓库根目录分别构建前端和后端生产镜像：

- `littlebluebook-frontend:local`
- `littlebluebook-backend:local`

两个 Dockerfile 使用 Node.js 24、多阶段构建和非 root 运行用户。生产环境变量在容器启动时注入，不会写入镜像。正式镜像发布和生产部署不属于当前工程基础范围。

## 常见问题

- **Node 或 pnpm 版本不匹配**：确认使用 Node.js 24，并重新执行 `corepack enable` 和 `corepack prepare pnpm@11.9.0 --activate`。
- **5432 或 6379 端口被占用**：在根 `.env` 中修改 `POSTGRES_PORT` 或 `REDIS_PORT`，并同步更新 `backend/.env` 中的连接地址。
- **3000 或 3001 端口被占用**：停止冲突进程。当前开发和端到端测试约定使用这两个端口。
- **后端启动时提示配置无效**：确认 `backend/.env` 已从示例创建，且所有必填键存在。错误不会打印连接串内容。
- **就绪检查返回 503**：运行 `docker compose ps` 检查 PostgreSQL、Redis 健康状态，再查看 `pnpm infra:logs`。
- **Prisma Client 缺失**：运行 `pnpm db:validate` 和 `pnpm db:generate`。
- **Playwright 缺少浏览器**：本地运行 `pnpm --filter e2e exec playwright install --no-shell chromium`。常规 CI 不安装浏览器或运行 Browser E2E；如未来在 Linux 环境单独运行 E2E，需要同时准备对应系统依赖。
- **Docker 构建无法拉取基础镜像**：检查 Docker daemon、Docker Hub 网络访问和代理设置。

## 仓库结构

```text
frontend/    Next.js Web 应用
backend/     NestJS REST API
e2e/         Playwright 浏览器测试
compose.yaml PostgreSQL 与 Redis 本地开发服务
```

项目采用规格驱动开发。新增业务能力前，应先在 `specs/` 中完成对应 Spec 的确认。
