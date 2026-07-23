# 0002：应用工程基础技术栈

- 状态：Accepted
- 日期：2026-07-24
- 决策人：用户
- 记录人：协调开发 Agent
- 关联：`constitution/tech-stack.md`、`specs/spec-001-project-foundation/`

## 背景

项目即将进入首个工程基础 Spec，需要确定前端、后端、数据库、缓存、测试和本地开发方式，避免实施 Agent 在脚手架阶段自行选择不兼容的方案。

## 决策问题

确定 LittleBlueBook-Web 的应用工程基础技术栈，以及本地开发与生产容器化之间的边界。

## 备选方案

### 数据访问：Prisma

- 使用独立 Schema 描述数据模型；
- 生成类型安全的数据库客户端；
- 通过 Prisma Migrate 保存并执行版本化 SQL 迁移；
- 常规业务开发效率较高，复杂查询仍可按需使用受控原生 SQL。

### 数据访问：Drizzle

- 使用 TypeScript 描述数据库结构；
- 查询风格更接近 SQL，控制力更直接；
- 对 SQL 能力要求更高，项目需要自行建立更多模块约束。

### 数据访问：TypeORM

- 与 NestJS Entity/Repository 模式结合紧密；
- 装饰器、关联和级联行为更多，运行时隐式行为相对较多；
- 生产环境需要特别避免自动 Schema 同步。

### 本地运行方式

- 全部本机安装：简单，但数据库和 Redis 版本容易不一致；
- 全部在 Docker 内运行：环境统一，但本地热更新和调试更复杂；
- 混合模式：前后端本机运行，PostgreSQL 和 Redis 使用 Docker Compose。

## 最终决定

- 运行时使用 Node.js 24；确认本决策时该版本线处于 Active LTS；
- 使用 pnpm 11 Workspace 管理仓库；
- 前端使用 Next.js 16 App Router、React 19、TypeScript 和 Tailwind CSS 4；
- 后端使用 NestJS 11、TypeScript、REST 和 OpenAPI，并以模块化单体起步；
- 数据库使用 PostgreSQL 18；
- ORM 使用 Prisma ORM 7；
- 缓存基础设施使用 Redis 8，具体业务用途由后续 Spec 决定；
- 前端测试使用 Vitest 4；
- 后端测试使用 Jest 30；
- 端到端测试使用 Playwright 1；
- 本地采用混合开发模式：前端和后端在本机运行，PostgreSQL 和 Redis 通过 Docker Compose 运行；
- 生产环境仍将前后端构建为 Docker 镜像。

## 理由

- 前后端统一使用 TypeScript，降低上下文切换和共享类型成本；
- Next.js 的服务端渲染能力适合公开内容社区；
- NestJS 的模块化结构、依赖注入和 OpenAPI 支持适合逐步扩展的后端；
- Prisma 在类型安全、迁移历史和开发体验之间提供了适合当前阶段的平衡；
- 混合本地开发兼顾依赖一致性、热更新和调试体验；
- 分层测试工具覆盖组件、服务、接口和浏览器行为。

## 影响

- Prisma Schema 和迁移历史必须进入版本控制；
- 禁止在生产环境使用会绕过迁移历史的自动 Schema 同步；
- Prisma 7 的 ESM 和 Driver Adapter 要求需要在后端初始化时正确配置；
- 根目录需要提供跨平台的统一命令，避免开发流程依赖 Bash；
- 精确依赖版本由 `package.json` 和 `pnpm-lock.yaml` 固定；
- 搜索、状态管理、认证、业务 UI 组件库和 Redis 的具体用途仍需由后续 Spec 确认。

## 后续复审条件

当出现 Prisma 无法合理支持的核心查询、需要拆分后端服务、需要边缘运行时，或 Node.js/框架 Major 版本进入停止支持状态时重新评估。
