# Web production image: Vite build served by nginx. Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.example.com .
#
# VITE_API_URL is baked at BUILD time (Vite inlines import.meta.env), so the
# image is per-environment — rebuild to point it at a different API.

FROM node:20-bookworm-slim AS build
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

FROM nginx:1.27-alpine
COPY docker/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
