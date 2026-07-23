FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY backend/prisma.config.ts backend/prisma.config.ts
COPY backend/prisma/schema.prisma backend/prisma/schema.prisma
COPY e2e/package.json e2e/package.json
RUN pnpm install --frozen-lockfile

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY e2e/package.json e2e/package.json
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter backend

FROM base AS builder
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/frontend/node_modules ./frontend/node_modules
COPY --from=dependencies /workspace/backend/node_modules ./backend/node_modules
COPY --from=dependencies /workspace/e2e/node_modules ./e2e/node_modules
COPY . .
RUN pnpm --filter backend db:generate \
  && pnpm --filter backend build

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app/backend

RUN addgroup --system --gid 1001 nestjs \
  && adduser --system --uid 1001 --ingroup nestjs nestjs

COPY --from=production-dependencies --chown=nestjs:nestjs /workspace/node_modules /app/node_modules
COPY --from=production-dependencies --chown=nestjs:nestjs /workspace/backend/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nestjs /workspace/backend/dist ./dist
COPY --from=builder --chown=nestjs:nestjs /workspace/backend/package.json ./package.json

USER nestjs
EXPOSE 3001
CMD ["node", "dist/main.js"]
