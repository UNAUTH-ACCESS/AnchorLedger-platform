# Multi-stage build. The previous single-stage image was 977 MB — it ran
# `npm install` (all dev deps: jest and its whole tree, nodemon) and
# `COPY . .` (the host's node_modules, .git, tests) straight into the
# runtime image. This VPS is memory- and I/O-constrained; a lean image
# matters — and once CI builds and pushes this, the VPS only pulls it.
#
# prisma (the CLI) is deliberately a runtime dependency, not dev: the
# documented deploy step is `docker exec anchorledger_api npx prisma
# migrate deploy`, which needs it in the image.

# ---- proddeps: production-only node_modules + generated Prisma client ----
FROM node:20-alpine AS proddeps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
# npm install (not `npm ci`): the committed lockfile has a benign optional-
# dep resolution difference between npm 10 (this image) and npm 11 (build
# host) around utf-8-validate. `install` reconciles it; `ci`'s strict sync
# check rejects it. --omit=dev is the actual slimming lever here.
RUN npm install --omit=dev --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate

# ---- base: shared runtime layer ----
FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=proddeps /app/node_modules ./node_modules
COPY package*.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts

FROM base AS api
EXPOSE 3000
CMD ["node", "src/app.js"]

FROM base AS worker
CMD ["node", "src/workers/simulation.worker.js"]
