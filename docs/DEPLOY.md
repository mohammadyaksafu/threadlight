# Deploying ThreadLight v2 to a VPS

## Live now (2026-10-27): lite profile on the shared VPS

**http://165.99.219.251:8095/** (plain HTTP; MCP at `http://165.99.219.251:8095/mcp`). The box (2 vCPU, 4 GB RAM,
Ubuntu 24.04) already runs other sites that own ports 80 and 443, so ThreadLight runs the **lite profile**
(`deploy/docker-compose.lite.yml`, code in `/opt/threadlight`, secrets in `/opt/threadlight/deploy/.env`):
Postgres + pgvector, Redis, API, arq worker, MCP server and the web container, about 360 MB of RAM in total. Gemini is
the only model provider there (no Ollama, Docling, reranker, Presidio, n8n or Langfuse on this box). Checked after
deploy: `TL_PAGE=http://165.99.219.251:8095/ node tests/live_check.js` 11/11, MCP over HTTP (9 tools, passport 29 / 63,
search returns D1:p1 first).

**HTTPS is not set up yet.** The plan is a site block for `165-99-219-251.sslip.io` (or a sub-domain of
`mdyaksafu.shop`) in the existing Caddy on port 443 (`/var/www/DIU_Hackathon/deploy/Caddyfile`), forwarding to
`threadlight-web:80`; the web container is already on that Caddy's network. That edits another project's proxy, so it
needs the owner's go-ahead.

Update the deployment: copy the code (`git archive HEAD | ssh root@<ip> 'tar -x -C /opt/threadlight'`), then
`docker compose -f deploy/docker-compose.lite.yml --env-file deploy/.env up -d --build`. Seeded v1 documents are
indexed with `python -m backend.workers.reindex 1 1 D1 synth/out/v1/fire_certificate.pdf` (and so on for D2-D6).

## Full stack

The Compose stack, Dockerfiles, Caddy config, CI/CD and backup script below are for a dedicated VPS of the
recommended size; that full stack has not been deployed.

## Size

| Profile | Spec | Runs |
|---|---|---|
| Recommended | 8 vCPU, 32 GB RAM, 200 GB NVMe, Ubuntu 24.04 | everything incl. `--profile obs` and Qwen 2.5 7B |
| Minimum | 4 vCPU, 16 GB RAM, 100 GB | core stack + Llama 3.2 3B + bge-m3; Langfuse optional |

No GPU. Local models handle classification, embeddings and private mode in background jobs.

## Steps

1. Server: non-root sudo user, SSH keys only, `ufw allow 22,80,443`, `fail2ban`, `unattended-upgrades`.
2. Docker Engine + Compose plugin. DNS: `A` records for `<domain>`, `n8n.<domain>`, `langfuse.<domain>`, `grafana.<domain>`.
3. `git clone https://github.com/mohammadyaksafu/threadlight /opt/threadlight && cd /opt/threadlight`
4. `cp deploy/.env.example deploy/.env` and fill every secret (`openssl rand -hex 32`); `GEMINI_API_KEY` from AI Studio;
   `ADMIN_PASSWORD_HASH` from `docker run --rm caddy:2.8.4 caddy hash-password --plaintext '...'`.
5. Core stack: `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build`
   (runs `migrate` = Alembic + seed, pulls the Ollama models, Caddy gets HTTPS certificates).
6. Observability: add `--profile obs` (Langfuse + ClickHouse, Prometheus, Grafana). Put `LANGFUSE_PUBLIC_KEY` /
   `LANGFUSE_SECRET_KEY` in `.env`; the backend traces to `http://langfuse-web:3000`.
7. n8n: `docker compose -f deploy/docker-compose.yml exec n8n n8n import:workflow --separate --input=/import`, then
   activate the workflows in `https://n8n.<domain>`.
8. CI/CD: in GitHub set the repository variable `DEPLOY_ENABLED=true` and secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
   `GEMINI_API_KEY`. Each push to `main` runs the tests, builds both images, pushes them to GHCR and redeploys over SSH,
   then calls `/api/health`.
9. Backups: `crontab -e` -> `30 2 * * * /opt/threadlight/deploy/backup.sh`; test with `deploy/backup.sh --restore-test`.
10. Smoke test: sign in at `https://<domain>` with "Live API" as `officer@threadlight.demo`, upload
    `synth/out/v1/fire_certificate_renewal.pdf` replacing D1, approve it, and check coverage moves 29 -> 55.

## Services

`caddy` (HTTPS, static web app, reverse proxy), `api`, `worker` (arq + LangGraph), `mcp` (streamable HTTP),
`migrate` (one-shot), `postgres` (pgvector), `redis`, `minio` + `minio-init`, `ollama` + `ollama-pull`,
`presidio-analyzer`, `n8n`; profile `obs`: `langfuse-web`, `langfuse-worker`, `clickhouse`, `prometheus`, `grafana`.
Every long-running service has a restart policy and a memory limit; data lives in named volumes.

## Development tunnel (optional)

`cloudflared tunnel --url http://localhost:8000` exposes a laptop API for testing n8n webhooks or a remote MCP
client before the VPS exists. Development only.

## Running the whole stack on a laptop

The same Compose file runs locally (`DOMAIN=localhost`); Caddy then uses its internal CA. With 8 GB of Docker
memory, start without `--profile obs` and set `OLLAMA_MEM=4g`, `WITH_ML=0` to skip Docling and the reranker.
