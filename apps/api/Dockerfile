# API production image. Build from the REPO ROOT (the npm workspace needs the
# root lockfile):  docker build -f apps/api/Dockerfile .
#
# bookworm-slim rather than alpine: prisma's engines and argon2's native
# binding both ship glibc prebuilds — musl/alpine means compiling from source.
#
# ⚠️ **إصدار Node هنا جزءٌ من القفل، لا تفصيلة صورة.**
#
# كانت هذه الصورة على `node:20` بينما `engines` في كل package.json تشترط
# `>=22` والسير يثبّت `22` في ثلاثة مواضع. أي أن **الاختبارات كلها تجري على
# 22 والخادم يعمل على 20** — فأي اعتماد على واجهة موجودة في 22 وغائبة في 20
# يمرّ أخضرَ في السير ويسقط في الإنتاج وحده.
#
# وهو العطل الذي وُضع القفل أصلاً لمنعه: «تفاوت البيئتين هو العطل نفسه، فلا
# يُثبَّت في أحدهما دون الآخر» (web-tests.yml). وقد أُغفل **موضعه الأهمّ**.
#
# والدليل كان في المخرَج ولم يُقرأ حتى نشر 2026-08-16:
#     npm warn EBADENGINE required: { node: '>=22.0.0' }
#     npm warn EBADENGINE current:  { node: 'v20.20.2' }
#     [سجل الـAPI] for security updates please upgrade to node >=22
#
# 📌 وحارسٌ في السير يمنع عودة التفاوت — يقارن هذا السطر بـ`engines`.

FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Lockfile-only layer first, so dependency install caches across code edits.
# (ق-١٥٠٤ — ب٢) و`postinstall` في apps/api يُشغّل سكربتَ توليد العميل **إن وُجد ملفُّه** — وهنا لم يُنسخ بعد فيتخطّى،
# والتوليدُ صريحٌ بعد نسخ المصدر أدناه. (وكذلك صورةُ الواجهة التي تُثبّت مساحةَ العمل كلَّها.)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY apps/api apps/api
COPY packages/shared packages/shared
RUN cd apps/api && npx prisma generate && npm run build

FROM node:22-bookworm-slim
# openssl: prisma's engine needs it at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app

# The whole workspace node_modules comes from the build stage: it already
# contains the generated prisma client and argon2's compiled binding, so the
# runtime stage never runs npm at all. Bigger image, zero install surprises —
# trim later if size ever matters.
#
# There is deliberately NO `COPY /app/apps/api/node_modules`: npm workspaces
# hoists every dependency to the ROOT node_modules, so that directory does not
# exist in the build stage at all — the COPY that used to be here aborted the
# image build outright ("stat app/apps/api/node_modules: file does not exist"),
# which is why this image had never been built successfully. Node resolves
# upward from /app/apps/api to /app/node_modules, so nothing is lost: verified
# in the built image by requiring @nestjs/core, @prisma/client and argon2 from
# /app/apps/api. (Since ق-١٥٠٤ the generated client is @mad-app/db, copied by
# the line below — the one apps/api/node_modules entry that is NOT hoisted.)
COPY --from=build /app/node_modules node_modules
# ⚖️ (ق-١٥٠٤ — ب٢) **وعميلُ Prisma وحدَه من apps/api/node_modules**: صار يُولَّد هناك (`output` في المخطّط) لا في الجذر،
# ومرحلةُ التشغيل تنسخ الجذرَ وحدَه عمداً (التعليق أعلاه). **وبدون هذا السطر يتوقّف الإقلاعُ بـMODULE_NOT_FOUND
# على '@mad-app/db'** — فصيلةُ الحادثة التي يوثّقها ذلك التعليق نفسُه.
COPY --from=build /app/apps/api/node_modules/@mad-app/db apps/api/node_modules/@mad-app/db
COPY --from=build /app/package.json package.json
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma

WORKDIR /app/apps/api
EXPOSE 3000
# dist/src/main.js — NOT dist/main.js. tsconfig.build.json excludes only
# node_modules/dist/test/*.spec.ts, so prisma/*.ts and scripts/*.ts are part of
# the compilation too; TypeScript then infers the common rootDir as apps/api/
# and mirrors the tree under dist/ (dist/src, dist/prisma, dist/scripts).
# The old path made the container exit with MODULE_NOT_FOUND on every boot.
#
# That same layout is what makes the production bootstrap runnable here:
#   node dist/scripts/bootstrap-production.js
# (`prisma db seed` cannot work in this image — no ts-node, no src/*.ts.)
#
# Migrations run on every boot: idempotent, and the container is the only
# thing guaranteed to run before the app touches the schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
