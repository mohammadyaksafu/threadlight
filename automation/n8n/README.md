# n8n workflows

Exported workflow JSON for the self-hosted n8n on the VPS (`https://n8n.<domain>`, behind basic auth and an IP
allow-list). Import with `docker compose -f deploy/docker-compose.yml exec n8n n8n import:workflow --separate --input=/import`,
then activate them in the editor.

| Workflow | Trigger | What it does | Tier |
|---|---|---|---|
| `expiry_watch.json` | daily 07:00 Asia/Dhaka | signs in with the read-only automation account, calls `GET /api/expiring`, sends one Telegram message per factory with evidence that expires before its next audit | T1 |
| `nightly_evals.json` | daily 02:00 | dispatches `.github/workflows/evals.yml`, waits 40 min, reads `GET /api/system/evals` and posts the gate result | T1 |
| `email_intake.json` | IMAP, new mail | maps the sender to a factory and uploads each PDF/JPEG/PNG attachment to `POST /api/factories/{id}/documents` | T2 |

Environment used by the workflows (set on the `n8n` service in `deploy/docker-compose.yml`): `THREADLIGHT_API`,
`AUTOMATION_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GITHUB_REPO`, `GITHUB_TOKEN` (fine-grained,
Actions: write), and `INTAKE_EMAIL`/`INTAKE_PASSWORD` (a staff account) for intake. The IMAP credential is created
in the n8n editor. `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` lets the expressions read `$env`.

## Local run (2026-10-31)

`expiry_watch_local.json` is the expiry watch with a manual trigger and without the Telegram step, for checking the
workflow on a laptop. It was imported into n8n 1.72.1 (`docker run -d --name tl-n8n -p 5679:5678 -e
THREADLIGHT_API=http://host.docker.internal:8000/api -e N8N_BLOCK_ENV_ACCESS_IN_NODE=false n8nio/n8n:1.72.1`) and run with
`n8n execute --id tlExpiryLocal01` against the local API, signed in as the read-only demo viewer
(`AUTOMATION_EMAIL`/`AUTOMATION_PASSWORD`; the development database predates the automation account). Result: finished,
one alert, "ThreadLight: Sample Apparel Ltd., audit 2026-11-21 (30 days) - R4 Environmental clearance (owner:
Compliance): D4 environmental clearance (EC-2024-5521) expired on 2026-09-30." The production workflows are not running
on the VPS yet (no room on the shared 4 GB box, and no Telegram bot configured).
