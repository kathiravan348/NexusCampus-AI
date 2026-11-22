# Nexus Control — provider plane (Docker Compose)

Runs the Nexus Control provider plane from one Compose stack (`deploy/control/compose.yaml`, NEX-108) using only
already-pinned open-source images plus the existing `nexuscampus-api` image (no second backend image):

| Service | Image | Role |
|---|---|---|
| `control-api` | `nexuscampus-api` (`uvicorn --factory nexus.control.main:app`) | Control API on `127.0.0.1:8100` (the **only** published port) |
| `control-migrate` | `nexuscampus-api` | One-shot forward-only `control_migrations` (and demo seed only when `NEXUS_CONTROL_DEMO=1`) |
| `control-db` | `pgvector/pgvector:0.8.0-pg16` (pinned digest) | `nexus_control` and `keycloak` databases (commercial/technical metadata only, V-7) |
| `staff-keycloak` | `quay.io/keycloak/keycloak:26.4.7` (pinned digest) | Dedicated `nexus-staff` realm with mandatory MFA (`acr_values=mfa`, P13) |
| `valkey` | `valkey/valkey:9.0.7-alpine` (pinned digest, D48) | OIDC login-state store for staff SSO |
| `openbao` | `openbao/openbao:2.7.2` (pinned digest, D48) | Raft-backed Transit signing keys (`nexus-licence`, `nexus-release`, Ed25519, never exported) |
| `lago-*` | included from `backend/compose.billing.yaml` | Self-hosted Lago billing engine (AGPL-3.0, D51): `lago-db`, `lago-valkey`, `lago-migrate`, `lago-api`, `lago-worker`, `lago-clock` (no host ports published; posts signed HMAC webhooks internally to `http://control-api:8100/control/api/v1/billing/lago-webhook`) |

Every service runs on the stack's internal Docker network with a `mem_limit`, health checks, `restart: unless-stopped`,
and `read_only: true` where the image supports it.

## Install

```bash
deploy/control/scripts/install.sh                      # empty Control stack
NEXUS_CONTROL_DEMO=1 deploy/control/scripts/install.sh # with demo staff, accounts, licences & billing fixtures
```

Windows PowerShell:

```powershell
powershell -File deploy/control/scripts/install.ps1        # empty Control stack
powershell -File deploy/control/scripts/install.ps1 -Demo  # with demo fixtures and staff SSO users
```

The script is idempotent:
1. Copies `.env.example` → `.env` (git-ignored) and generates every missing random secret without printing any secret.
2. Builds `nexuscampus-api` (unless `NEXUS_IMAGE_API` points to a released digest) and starts infrastructure.
3. Initialises OpenBao once (saving the unseal key and root token to git-ignored `deploy/control/.env.vault-init.json`),
   unseals it, creates non-exportable Ed25519 Transit keys `nexus-licence` and `nexus-release`, and issues a least-privilege
   app token (`NEXUS_VAULT_TOKEN`: create, read, sign and verify those two keys only; it can never delete,
   reconfigure, rotate or export them — rotation uses the root token, below).
4. Syncs Lago's organization HMAC key into `NEXUS_CONTROL_LAGO_WEBHOOK_KEY` and registers the HMAC webhook endpoint
   (`http://control-api:8100/control/api/v1/billing/lago-webhook`) inside the stack.
5. Runs `control-migrate` (forward-only migrations; demo fixtures + demo Keycloak staff users only when `NEXUS_CONTROL_DEMO=1`).
6. Starts `control-api` and prints `[timing] control-compose:up: …`.

**Back up `deploy/control/.env.vault-init.json` offline right away.** Without it, OpenBao cannot be unsealed after a restart.

### TLS and reverse proxy (production)

Only `127.0.0.1:8100` is published. In production, attach your TLS reverse proxy (nginx, Caddy, Traefik, or load balancer)
to the `nexuscampus-control_default` network and route:

- `https://control.nexuscampus.example/control/api/` → `control-api:8100`
- `https://staff-login.nexuscampus.example/` → `staff-keycloak:8080`

Set `NEXUS_CONTROL_API_PUBLIC_URL`, `NEXUS_CONTROL_APP_PUBLIC_URL`, and `NEXUS_CONTROL_KEYCLOAK_PUBLIC_URL` in
`deploy/control/.env`, update the `nexus-control` client redirect URIs in Keycloak, and re-run the install script.

### Running the Lago billing sync

```bash
docker compose -f deploy/control/compose.yaml --env-file deploy/control/.env \
  exec -T control-api python -m nexus.devtools.billing_sync
```

## Upgrade

Pull or set the new `NEXUS_IMAGE_API` digest in `deploy/control/.env` and re-run `deploy/control/scripts/install.sh`
(or `install.ps1`). The script unseals OpenBao if needed, renews `NEXUS_VAULT_TOKEN`, runs `control-migrate`
(**forward-only migrations run before `control-api` starts**), and restarts `control-api` with existing data intact.

## Backup and restore

Back up both PostgreSQL databases (`control-db` and `lago-db`) and OpenBao's Raft storage:

```bash
cd deploy/control
# 1. Control database (and Keycloak staff realm DB):
docker compose -f compose.yaml --env-file .env exec -T control-db pg_dumpall -U nexus_control > control-db-$(date +%F).sql
# 2. Lago billing database:
docker compose -f compose.yaml --env-file .env exec -T lago-db pg_dump -U lago lago > lago-db-$(date +%F).sql
# 3. OpenBao key storage (stop OpenBao briefly for a consistent Raft copy):
docker compose -f compose.yaml --env-file .env stop openbao
docker run --rm --entrypoint sh -v nexuscampus-control_control-openbao-data:/v -v "$PWD":/b openbao/openbao:2.7.2 \
  -c "tar czf /b/control-openbao-$(date +%F).tgz -C /v ."
docker compose -f compose.yaml --env-file .env start openbao && scripts/install.sh
```

Store backups encrypted off-host alongside `.env` and `.env.vault-init.json`.

## Keys and rotation

- **Where keys live:**
  - `nexus-licence` and `nexus-release` (Ed25519, `exportable=false`) live only inside OpenBao (`control-openbao-data` volume).
  - OpenBao's unseal key and root token live in `deploy/control/.env.vault-init.json` (git-ignored; move to an offline vault / KMS auto-unseal in production).
  - Database passwords, OIDC client secret, OpenBao app token, Lago API key, and Lago HMAC webhook key live in `deploy/control/.env` (git-ignored).
- **Rotation:**
  - **Licence / release signing keys:** `docker compose ... exec -T -e BAO_TOKEN=<root> openbao bao write -f transit/keys/nexus-licence/rotate` (or `nexus-release/rotate`); old public key versions remain available so existing signed licences and release manifests still verify offline.
  - **OpenBao app token (`NEXUS_VAULT_TOKEN`):** re-running `install.sh` / `install.ps1` renews it automatically (or creates a fresh Transit-only token if expired).
  - **OIDC client secret / DB passwords / Lago webhook HMAC key:** update the secret in the target service (Keycloak / PostgreSQL / Lago `organizations.hmac_key`), update the matching variable in `deploy/control/.env`, and recreate `control-api` (`docker compose -f deploy/control/compose.yaml --env-file deploy/control/.env up -d --wait control-api`).

## Stop and tear down

```bash
docker compose -f deploy/control/compose.yaml --env-file deploy/control/.env down      # stop, keep data
docker compose -f deploy/control/compose.yaml --env-file deploy/control/.env down -v   # remove containers and volumes
```
