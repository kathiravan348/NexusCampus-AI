# NexusCampus — self-hosted install (Docker Compose)

One set of images (`nexuscampus-api`, used for the API, the worker and migrations, and `nexuscampus-web`) runs
both a SaaS region cell and this self-hosted install. Stage 1 ships: PostgreSQL 16 + pgvector, Valkey (Redis protocol), Keycloak
(sign-in), OpenBao (keys; open-source Vault API, D48), the API, the outbox worker and the web app.

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
services, initialises and unseals OpenBao, runs the migrations (and the demo seed), and prints
`[timing] compose:up: …`. Open `http://127.0.0.1:8088`. With the demo seed, sign in as
`priya.raman@littlesteps.example.edu` with `NEXUS_DEMO_USER_PASSWORD` from `.env`. Demo data is for trying the
product only; do not use it for a real school.

**Back up `deploy/compose/.secrets/vault-init.json` offline right away.** It holds OpenBao's unseal key; without it,
OpenBao cannot be unsealed after a restart and encrypted data cannot be recovered. The install script never overwrites
it, denies `transit/export/*` in the `nexus-app` policy, and **revokes the OpenBao root token immediately after setup**
(stripping `root_token` from `vault-init.json`). Re-running the install script unseals OpenBao and renews the app token
without needing a root token. If an operator ever needs a temporary root token (for example, if the app token expired
while offline), generate one with the unseal key (`docker compose -f compose.yaml exec vault bao operator generate-root -init`,
then supply the unseal key and decode), pass `NEXUS_VAULT_ROOT_TOKEN=<token>` when running `install.sh` / `install.ps1`,
and the script will revoke it again as soon as it finishes.

## Real hostnames (TLS)

Every port binds to `127.0.0.1`. Put your reverse proxy (nginx, Caddy, Traefik, a load balancer) in front, terminate
TLS there, and forward:

- `https://campus.example.org` → `127.0.0.1:8088` (the web container also proxies `/api` to the API)
- `https://login.example.org` → `127.0.0.1:8089` (Keycloak)

Then set `NEXUS_PUBLIC_URL` and `NEXUS_KEYCLOAK_PUBLIC_URL` to those https addresses in `.env` and run the install
script again. Pass `X-Forwarded-For` / `X-Forwarded-Proto` headers.

## Start after a reboot, upgrade

Run the install script again. It is idempotent: it unseals OpenBao (sealed after every restart), renews the app's
key-vault token, rebuilds or pulls the images, runs **forward-only** migrations, and restarts the app. Data is kept.
To run released images, set `NEXUS_IMAGE_API` / `NEXUS_IMAGE_WEB` to their digests (`registry/image@sha256:…`).

### Upgrading an install made before NEX-066 (HashiCorp Vault + Redis → OpenBao + Valkey)

Installs made before 2026-11-22 ran HashiCorp Vault and Redis, which are not open source. NexusCampus now ships
their open-source drop-ins, OpenBao and Valkey (D48). OpenBao stores keys in raft storage instead of Vault's file
storage, so convert once **before** running the new install script:

```bash
deploy/compose/scripts/migrate-vault-to-openbao.sh      # Windows: deploy\compose\scripts\migrate-vault-to-openbao.ps1
deploy/compose/scripts/install.sh                       # Windows: deploy\compose\scripts\install.ps1
```

The migration script stops the app, saves a copy of the old key storage in `deploy/compose/backups/`, converts it
with Vault's own `operator migrate` (nothing is decrypted), and moves the old Redis cache snapshot aside (Valkey
cannot read it; it held only sign-in sessions and caches, so people sign in again). Your unseal key and root token
in `.secrets/vault-init.json` stay the same. Running it again does nothing. Keep the backup until the app has run
for a while, then store it with your other backups.

### The install agent and your licence

The install agent (`nexus-agent loop`, part of the install) checks your licence on this server — no internet needed —
counts learners and campuses (numbers only), and looks for updates. Put these in the install folder
(`NEXUS_INSTALL_DIR`): `licence.json` (from us), `licence-keys.json` and `release-keys.json` (our public keys, no
secrets). An expired licence gives a grace period, then read-only — your data is never deleted or locked away.
Administrators see all of it in **Install & updates**.

**Optional health reports and online update checks.** When paired with Nexus Control (`NEXUS_CONTROL_URL` — `https://`
only, plain `http://` only on loopback — and the per-deployment bearer token in `NEXUS_CONTROL_AGENT_TOKEN`),
`nexus-agent report` and each `once` / `loop` run send one PII-free health check-in (version, API probe uptime/error
rate/p95 latency, disk use, running job count, and active user count; never names or records), and `once` / `loop` also
checks Control for a newer release and offers it only after verifying its `nexus-release/1` signature with your pinned
`release-keys.json` (a verified offline bundle in `inbox/` always takes precedence). Set `NEXUS_TELEMETRY_ENABLED=false`
or `NEXUS_AIR_GAPPED=true` (or leave the token empty) to disable all outbound calls — no network request is made.

**Optional signed Control commands (D60).** Self-hosted installs keep Control commands **off** by default
(`NEXUS_AGENT_COMMANDS=off`). To allow this install to pull signed work items (`nexus-agent commands`, also run in
`nexus-agent loop`), set `NEXUS_AGENT_COMMANDS=on`, set `NEXUS_DEPLOYMENT_ID` to your Control deployment id, pin
Control's public keys in `NEXUS_INSTALL_DIR/command-keys.json`, and configure `NEXUS_CONTROL_URL` and
`NEXUS_CONTROL_AGENT_TOKEN`. Every command is verified offline with the pinned keys, matched to this deployment id,
recorded so it can never run twice, and restricted to the agent's allow-list. Air-gapped installs never pull commands.

### Offline updates (no internet on the server)

Every release comes with a signed manifest, and for servers without internet an offline bundle
`nexuscampus-<version>.tar` (the images and the release notes). Before loading anything, check it on the server with
the public keys file you received with your licence (it holds no secret):

```bash
uv run --project backend nexus-release-verify nexuscampus-2.5.0.tar --keys nexus-release-keys.json
```

Or drop it into the install folder's `inbox/`: the install agent checks it the same way and offers it under
**Install & updates** only when it verifies. It prints `valid: …` only when the signature is ours and every file is exactly as signed; otherwise it lists what is
wrong (changed, missing or extra files, unsafe paths) and loads nothing. The manifest also names the oldest version
that can upgrade straight to this one.

## Backup and restore

**Encrypted backups by the install agent (recommended).** `nexus-agent backup` streams every table into one file
encrypted with AES-256-GCM, with a new key from your own OpenBao for every backup (only the wrapped key is in the file;
without your OpenBao it cannot be read). `nexus-agent verify-backup FILE` checks every byte without restoring;
`nexus-agent restore FILE --into <URL of an empty database>` builds the schema and loads it. Copy the `.nxbk` files
and an OpenBao backup to another place — both are needed to restore. **Support diagnostics:** `nexus-agent
diagnostics --ticket TCK-…` writes a bundle with e-mail addresses, phone numbers, IP addresses and secrets removed;
an administrator reads it under **Install & updates** and approves or discards it. Nothing leaves without approval.

**Tenant export & import (moving one institution between installs, DM-8).** On the **destination** install, run
`nexus-agent import-key > destination.pem` to create its non-exportable RSA-4096 import key (`tenant-import`) in
OpenBao and print only its public PEM. Hand `destination.pem` to the **source** install's administrator and run
`nexus-agent export-tenant <tenant-id> --to destination.pem`. It streams only that institution's rows into one
encrypted `.nxte` file (`NXTE/1`) under a fresh 256-bit AES-GCM key wrapped with RSA-OAEP-SHA256 for `destination.pem`
(nothing plain touches disk, and only the destination's OpenBao can open it). Sign-in sessions, SCIM tokens and
cached responses are never exported: people sign in again and SCIM tokens are issued anew on the destination. The job is recorded under
**Install & updates** with counts and file size only.

On the **destination** install, run `nexus-agent import-tenant <file.nxte>` to load the institution all-or-nothing into
an empty tenant: it checks format, `pemSha256`, exact schema revision, empty tenant, table allow-list, and platform key
custody; loads all rows in one transaction (skipping source-signed audit checkpoints); creates fresh tenant keys in
OpenBao and re-encrypts any field-encrypted values; records an `m84.tenant.imported` audit event; and signs today's
checkpoint after re-verifying the entire imported audit chain. When Control commands are enabled (`NEXUS_AGENT_COMMANDS=on`,
default on SaaS cells), Control can also orchestrate moves via signed `tenant.import_key` (returns only the public PEM and
fingerprint) and `tenant.import` (loads a plain filename placed in `NEXUS_IMPORT_DIR`, default `NEXUS_INSTALL_DIR/imports`,
verifies the audit chain and checkpoints, and removes the file once imported).

### Volume backups

```bash
cd deploy/compose
# PostgreSQL (application data and Keycloak):
docker compose exec -T db pg_dumpall -U nexus > backup-$(date +%F).sql
# OpenBao key storage (stop it for a consistent copy; the OpenBao image itself makes the archive):
docker compose stop vault
docker run --rm --entrypoint sh -v nexuscampus-install_vault-data:/v -v "$PWD":/b openbao/openbao:2.7.2 \
  -c "tar czf /b/vault-$(date +%F).tgz -C /v ."
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
| `redis` | valkey/valkey (BSD-3, D48) | Sign-in state and short-lived caches (Redis protocol) |
| `keycloak` | keycloak | Sign-in, SSO, MFA (D44); port 8089 |
| `vault` | openbao/openbao (MPL-2.0, D48) | Per-tenant encryption keys (D46), raft storage; never published |

Every service has a memory limit, a health check and (where it keeps data) a named volume; third-party images are
pinned by digest, and every one is open source. Production hardening beyond Stage 1 (HA, OpenBao auto-unseal with a
KMS) is described in `docs/ARCHITECTURE.md` §9.

## Large installs (Kubernetes / Helm)

Choose Docker Compose for single-server installs (up to a few thousand learners). For multi-node HA clusters, managed
PostgreSQL / Valkey / OpenBao / Keycloak, or existing Kubernetes infrastructure, use the Helm chart in
[`deploy/helm/nexuscampus/`](../helm/nexuscampus/README.md) — it runs the exact same pinned images with non-root pods,
Kubernetes Secrets only (`existingSecret`), and default-deny `NetworkPolicy` rules.
