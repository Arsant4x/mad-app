# Web production image: Vite build served by nginx. Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.example.com .
#
# VITE_API_URL is baked at BUILD time (Vite inlines import.meta.env), so the
# image is per-environment — rebuild to point it at a different API.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY apps/web apps/web
COPY packages/shared packages/shared
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace=apps/web

# ⚖️ `ق-١٥٨٦` (بحكم صاحب المشروع): الصورةُ الأساس محدَّثة والحاويةُ بغير الجذر. كانت `nginx:1.27-alpine` على Alpine 3.21.3 وفيها
# ثغرتان حرجتان في OpenSSL (`libcrypto3`/`libssl3` 3.3.3) وتعمل بالجذر. والنسخةُ «غيرُ المتميّزة» الرسمية من nginx تعمل بمستخدمٍ
# غيرِ الجذر (101) فتصغي على 8080 لا 80، وهي على الفرع المستقرّ 1.30 وAlpine 3.24، مثبَّتةٌ بالبصمة كسائر صورنا.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine3.24@sha256:ed04ec1ff34502c339ee5c3ae3f855442398edc1d05591e2b98981dcbbd20b1e
# ⚖️ `ق-١٥٨٦` (العالي يصير مانعاً في 2026-11-03): `pcre2` 10.48 في هذه الصورة فيه عالٍ مُصلَحٌ في 10.49 من مستودع Alpine 3.24،
# فيُرقّى وحدَه بالجذر ثم يعود المستخدمُ صريحاً. والسطرُ `USER` معلَنٌ هنا لا موروثٌ من الأساس، كي يرى فحصُ الإعدادات الحاويةَ بغير الجذر.
USER root
RUN apk upgrade --no-cache pcre2
USER 101
COPY docker/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
