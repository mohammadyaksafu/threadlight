# Builds the React app and serves it with Caddy, which also terminates HTTPS and proxies the services.
FROM node:22-alpine AS web
WORKDIR /src
COPY data/ data/
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY web/ web/
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE
RUN cd web && npm run build

FROM caddy:2.8.4
COPY --from=web /src/web/dist /srv/web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
