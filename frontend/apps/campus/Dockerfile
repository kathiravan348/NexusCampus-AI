# NexusCampus web image (NEX-064): the campus PWA in real mode, served by unprivileged nginx with an SPA fallback,
# correct service-worker headers, and `/api` proxied to the API container (same origin: cookies and CSRF just work).
# Build from the repository root:  docker build -f frontend/apps/campus/Dockerfile -t nexuscampus-web .

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /repo
COPY brand.config.ts ./
COPY frontend ./frontend
WORKDIR /repo/frontend
RUN pnpm install --frozen-lockfile
ENV VITE_DATA_MODE=real
RUN pnpm --filter campus exec vite build

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0
COPY frontend/apps/campus/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/apps/campus/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=12 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
