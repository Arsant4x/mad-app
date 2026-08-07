# API production image. Build from the REPO ROOT (the npm workspace needs the
# root lockfile):  docker build -f apps/api/Dockerfile .
#
# bookworm-slim rather than alpine: prisma's engines and argon2's native
# binding both ship glibc prebuilds — musl/alpine means compiling from source.

FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Lockfile-only layer first, so dependency install caches across code edits.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY apps/api apps/api
COPY packages/shared packages/shared
RUN cd apps/api && npx prisma generate && npm run build

FROM node:20-bookworm-slim
# openssl: prisma's engine needs it at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app

# The whole workspace node_modules comes from the build stage: it already
# contains the generated prisma client and argon2's compiled binding, so the
# runtime stage never runs npm at all. Bigger image, zero install surprises —
# trim later if size ever matters.
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma

WORKDIR /app/apps/api
EXPOSE 3000
# Migrations run on every boot: idempotent, and the container is the only
# thing guaranteed to run before the app touches the schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
