# 技术栈与技术约束

状态：初始化，部分技术选型已确认

## 当前仓库约定

- `frontend/`：前端项目目录；
- `backend/`：后端项目目录；
- `constitution/`：项目级长期约束；
- `specs/spec-NNN-short-name/`：后续存放每项需求的独立 Spec；
- `docs/`：外部参考资料；
- `.ai/`：决策、工作流、Prompt 和 Agent 规则。

目录约定不代表框架或部署方案已经确定。

## 待确认的技术选型

| 领域 | 状态 | 需要确认的内容 |
| --- | --- | --- |
| 工程基础 | 已确认 | Node.js 24（确认时为 Active LTS）、pnpm 11 Workspace、TypeScript；前后端保留独立目录 |
| 前端 | 已确认基础栈 | Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4；状态管理和业务 UI 组件方案待具体功能确认 |
| 后端 | 已确认基础栈 | NestJS 11、TypeScript、REST、OpenAPI、模块化单体；具体业务模块边界待相关 Spec 确认 |
| 数据 | 部分确认 | PostgreSQL 18、Prisma ORM 7、Redis 8；搜索能力待确认 |
| 媒体存储 | 已确认初期方案 | 本地持久化存储；通过可替换的存储抽象隔离业务代码；未来按需要迁移至 S3 兼容对象存储和 CDN |
| 身份与权限 | 待确认 | 认证方式、授权模型、会话策略 |
| 测试 | 已确认基础栈 | 前端 Vitest 4，后端 Jest 30，端到端 Playwright 1；业务覆盖要求由具体 Spec 确认 |
| 部署 | 已确认基线 | GitHub + GitHub Actions + GHCR + Docker Compose；初期部署到单台境外云服务器；通过 `workflow_dispatch` 人工确认生产发布 |
| 可观测性 | 待确认 | 日志、指标、追踪、告警 |
| 安全与合规 | 待确认 | 数据分级、隐私要求、依赖治理、审计 |
| 兼容性 | 待确认 | 浏览器、设备、系统和 API 兼容范围 |
| 性能 | 待确认 | 容量假设、响应时间、资源预算 |

## 已确认的媒体存储策略

- 开发阶段和早期部署使用本地持久化目录保存图片、视频等媒体文件；
- 媒体文件不写入数据库，数据库只保存稳定的对象 Key、归属、尺寸、类型和状态等元数据；
- 业务代码通过统一的媒体存储接口访问文件，不绑定服务器绝对路径或厂商 URL；
- 使用 Docker 部署时，媒体目录必须挂载到宿主机目录或 Docker Volume，不得只保存在容器可写层；
- 初期可由 Nginx 等静态文件服务提供媒体访问，不把 CDN 作为当前依赖；
- 当单机磁盘、带宽、可靠性或水平扩展成为瓶颈时，再迁移到 S3 兼容对象存储和 CDN。

## 已确认的应用工程基础

- 仓库使用 pnpm Workspace 管理 `frontend/` 和 `backend/`；
- 当前不引入 Turborepo、Nx 等额外任务编排层，只有出现明确需求时再评估；
- 前端使用 Next.js App Router、React、TypeScript 和 Tailwind CSS；
- 后端使用 NestJS 构建模块化单体，通过 REST API 对外提供能力，并生成 OpenAPI 文档；
- 主数据库使用 PostgreSQL，通过 Prisma ORM 进行类型安全访问和版本化迁移；
- Redis 作为后续缓存、任务或实时能力的基础依赖，但具体用途必须由业务 Spec 决定；
- 本地开发时，前端和后端由本机 Node.js/pnpm 运行，PostgreSQL 和 Redis 由 Docker Compose 运行；
- 生产环境仍采用前后端 Docker 镜像和 Docker Compose；
- 前端单元测试使用 Vitest，后端单元与集成测试使用 Jest，浏览器端到端测试使用 Playwright；
- 依赖的精确版本由锁文件固定；升级 Major 版本前必须重新评估兼容性。

## 已确认的初期部署目标

- 初期使用一台租用的境外云服务器承载生产环境；
- 源代码托管平台使用 GitHub；
- CI/CD 平台使用 GitHub Actions；
- 前端和后端分别构建 Docker 镜像；
- 镜像存放在 GitHub Container Registry（GHCR）；
- 生产环境使用 Docker Compose 管理容器；
- 生产发布通过 `workflow_dispatch` 人工触发，不在代码合并后直接自动部署；
- 日常开发提交到 `dev`，普通推送不自动运行 CI；
- 需要验证时，通过 `workflow_dispatch` 手动选择 `dev` 运行 CI，通过后再合并到 `main`；
- CI 不作为 Spec 完成门禁，也不要求逐个生成或部署正式生产镜像；
- 准备发布时，在选定的 `main` 分支提交上创建 `vMAJOR.MINOR.PATCH` 格式的 Git Tag；
- 发布流水线根据 Git Tag 重新执行强制检查，构建正式镜像并同时使用发布版本和 Git Commit SHA 标记；
- 生产部署只选择已经生成的正式发布镜像，不以 `latest` 作为唯一版本；
- 生产服务器只拉取已经通过 CI 的镜像，不在服务器上临时拉取源码和构建应用；
- 本地 Docker 构建只用于开发验证，不作为正式发布产物，也不需要人工上传到服务器；
- 当前不引入 Kubernetes 或多节点容器编排；
- CI 应在部署前独立完成代码检查、测试和构建，不在生产服务器上临时编译未经验证的源代码；

计划建立三条独立流水线：

| 流水线 | 触发方式 | 职责 |
| --- | --- | --- |
| `ci.yml` | `workflow_dispatch` 手动选择 `dev` | 代码规范、类型检查、测试、前后端构建和 Docker 构建有效性检查；不发布生产镜像 |
| `release-images.yml` | 创建 `v*` Git Tag | 重新执行强制检查，构建前后端正式镜像并推送到 GHCR |
| `deploy-production.yml` | `workflow_dispatch` 人工触发 | 选择已发布版本，连接生产服务器，更新 Docker Compose 服务，执行健康检查并在失败时回滚 |

数据库迁移、健康检查、服务器初始化、部署脚本和回滚细节将在进入部署基础设施建设时通过 Spec 确认。

## 选型原则

技术选型应：

- 服务于已确认的产品目标，而不是先于需求决定；
- 优先选择团队可维护、生态成熟且可测试的方案；
- 明确关键依赖的版本和升级策略；
- 避免无 Spec 依据的过度设计；
- 对不可逆或高迁移成本的选择记录决策和备选方案；
- 同时考虑开发体验、运行成本、安全性和可观测性。

## 变更规则

- 技术栈选择必须由用户确认。
- 重要选型和变更记录在 `.ai/decisions/`。
- 功能 Spec 可以增加局部技术约束，但不得与本文件冲突；确需冲突时，应先更新本文件并记录决策。
