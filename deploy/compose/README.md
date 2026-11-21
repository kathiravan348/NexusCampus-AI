# NexusCampus — self-hosted install (Docker Compose)

One set of images (`nexuscampus-api`, used for the API, the worker and migrations, and `nexuscampus-web`) runs
both a SaaS region cell and this self-hosted install. Stage 1 ships: PostgreSQL 16 + pgvector, Redis, Keycloak
(sign-in), HashiCorp Vault (keys), the API, the outbox worker and the web app.

## What you need

- Docker with Compose v2 (Docker Desktop on Windows / macOS, Docker Engine on Linux), 4 GB free memory.
- Ports `127.0.0.1:8088` (app) and `127.0.0.1:8089` (Keycloak sign-in pages) free — change them in `.env`.

## Install (one command)

```bash
deploy/compose/scripts/install.sh                   # empty install
NEXUS_SEED=demo deploy/compose/scripts/install.sh   # with the demo institutions and users
```

Windows PowerShell: `powershell -File deploy/compose/scripts/install.ps1 [-Seed demo]`.

The script creates `deploy/compose/.env` with generated secrets (git-ignored), builds the images, starts the
services, initialises and unseals Vault, runs the migrations (and the demo seed), and prints
`[timing] compose:up: …`. Open `http://127.0.0.1:8088`. With the demo seed, sign in as
`priya.raman@littlesteps.example.edu` with `NEXUS_DEMO_USER_PASSWORD` from `.env`. Demo data is for trying the
product only; do not use it for a real school.

**Back up `deploy/compose/.secrets/vault-init.json` offline right away.** It holds Vault's unseal key and root
token; without it, encrypted data cannot be recovered. The script never overwrites it.

## Real hostnames (TLS)

Every port binds to `127.0.0.1`. Put your reverse proxy (nginx, Caddy, Traefik, a load balancer) in front, terminate
TLS there, and forward:

- `https://campus.example.org` → `127.0.0.1:8088` (the web container also proxies `/api` to the API)
- `https://login.example.org` → `127.0.0.1:8089` (Keycloak)

Then set `NEXUS_PUBLIC_URL` and `NEXUS_KEYCLOAK_PUBLIC_URL` to those https addresses in `.env` and run the install
script again. Pass `X-Forwarded-For` / `X-Forwarded-Proto` headers.

## Start after a reboot, upgrade

Run the install script again. It is idempotent: it unseals Vault (sealed after every restart), renews the app's
Vault token, rebuilds or pulls the images, runs **forward-only** migrations, and restarts the app. Data is kept.
To run released images, set `NEXUS_IMAGE_API` / `NEXUS_IMAGE_WEB` to their digests (`registry/image@sha256:…`).

## Backup and restore

```bash
cd deploy/compose
# PostgreSQL (application data and Keycloak):
docker compose exec -T db pg_dumpall -U nexus > backup-$(date +%F).sql
# Vault key storage (stop Vault for a consistent copy):
docker compose stop vault
docker run --rm -v nexuscampus-install_vault-data:/v -v "$PWD":/b alpine tar czf /b/vault-$(date +%F).tgz -C /v .
docker compose start vault && scripts/install.sh
```

Keep backups with `.env` and `.secrets/vault-init.json`, encrypted and off the machine. Restore = fresh volumes, then
`psql -U nexus < backup.sql` into `db` and untar into the Vault volume before running the install script.

## Stop and uninstall

```bash
docker compose -f deploy/compose/compose.yaml down        # stop, keep data
docker compose -f deploy/compose/compose.yaml down -v     # remove everything, including all data
```

## What runs

| Service | Image | Role |
|---|---|---|
| `web` | nexuscampus-web | The app (PWA) and the `/api` proxy; port 8088 |
| `api` | nexuscampus-api | The backend API (FastAPI) |
| `worker` | nexuscampus-api (`nexus-worker`) | Delivers notifications from the event outbox |
| `migrate` | nexuscampus-api (`alembic upgrade head`) | One-shot, every install / upgrade |
| `db` | pgvector/pgvector (pg16) | All data, search and AI vectors (D47); Keycloak's own database |
| `redis` | redis | Sign-in state and short-lived caches |
| `keycloak` | keycloak | Sign-in, SSO, MFA (D44); port 8089 |
| `vault` | hashicorp/vault | Per-tenant encryption keys (D46); never published |

Every service has a memory limit, a health check and (where it keeps data) a named volume; third-party images are
pinned by digest. Production hardening beyond Stage 1 (HA, Vault auto-unseal with a KMS) is described in
`docs/ARCHITECTURE.md` §9.
