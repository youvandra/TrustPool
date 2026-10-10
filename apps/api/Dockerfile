# Build from the repo root: docker build -f apps/api/Dockerfile -t trustpool-api .
FROM oven/bun:1.2.22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Every workspace in the lockfile must be present for the install, even unused ones.
COPY e2e/package.json e2e/
RUN bun install --production --filter '@trustpool/api'

FROM oven/bun:1.2.22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=deps /app/node_modules node_modules
COPY packages/core packages/core
COPY apps/api/package.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/assets apps/api/assets
WORKDIR /app/apps/api
USER bun
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://localhost:8787/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "src/index.ts"]
