# NexusCampus — self-hosted Kubernetes Helm chart

Installs the same NexusCampus product stack as `deploy/compose/` on Kubernetes (DM-9, D48): `api`, `worker`, `web`,
forward-only `migrate` hook Job, and switchable `db` (PostgreSQL 16 + pgvector), `valkey`, `openbao`, and `keycloak`.
No external chart dependencies are downloaded from the internet; every third-party image is pinned by SHA-256 digest.

## Prerequisites

- Kubernetes 1.28+ with a CNI that enforces `NetworkPolicy` (e.g. Cilium, Calico) and a default `StorageClass` when
  using built-in StatefulSets.
- Helm 3.14+ / 4.x.
- Pre-created Kubernetes Secrets (never put secret values in `values.yaml` — `values.schema.json` rejects them).

## 1. Create Secrets

```bash
kubectl create namespace nexuscampus

kubectl -n nexuscampus create secret generic nexuscampus-app-secrets \
  --from-literal=NEXUS_DB_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=NEXUS_APP_DB_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=NEXUS_OIDC_CLIENT_SECRET="$(openssl rand -hex 24)" \
  --from-literal=NEXUS_GRANT_SIGNING_KEY="$(openssl rand -hex 32)" \
  --from-literal=NEXUS_VAULT_TOKEN="" \
  --from-literal=NEXUS_ANTHROPIC_API_KEY="" \
  --from-literal=NEXUS_CONTROL_AGENT_TOKEN=""

kubectl -n nexuscampus create secret generic nexuscampus-db-secrets \
  --from-literal=POSTGRES_PASSWORD="<same NEXUS_DB_PASSWORD>" \
  --from-literal=KEYCLOAK_DB_PASSWORD="$(openssl rand -hex 24)"

kubectl -n nexuscampus create secret generic nexuscampus-keycloak-secrets \
  --from-literal=KC_BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=KEYCLOAK_DB_PASSWORD="<same KEYCLOAK_DB_PASSWORD>" \
  --from-literal=NEXUS_OIDC_CLIENT_SECRET="<same NEXUS_OIDC_CLIENT_SECRET>"
```

If enabling Ingress (`ingress.enabled=true`), also create the TLS Secret named in `ingress.tlsSecretName`.

## 2. Install & upgrade

```bash
helm upgrade --install nexuscampus deploy/helm/nexuscampus \
  --namespace nexuscampus \
  --set publicUrl=https://campus.example.org \
  --set keycloakPublicUrl=https://login.example.org
```

For production, pin released `images.api` and `images.web` digests (`registry/nexuscampus-api@sha256:…`). Every
install and upgrade runs the `migrate` pre-install / pre-upgrade Job (`alembic upgrade head`, forward-only).

## 3. Initialise & unseal OpenBao (first install)

When `openbao.enabled=true`, OpenBao starts sealed (same as `deploy/compose/`):

```bash
kubectl -n nexuscampus exec -it nexuscampus-openbao-0 -- bao operator init -key-shares=1 -key-threshold=1
# Store the unseal key and root token offline immediately!
kubectl -n nexuscampus exec -it nexuscampus-openbao-0 -- bao operator unseal
```

Enable the `transit` engine, create a least-privilege token (denying `transit/export/*`), store it in
`nexuscampus-app-secrets` (`NEXUS_VAULT_TOKEN`), and restart `api` and `worker`. For HA clusters, configure KMS
auto-unseal or switch `openbao.enabled=false` and point `openbao.external.url` at your existing OpenBao/Vault.

## 4. Using external / managed services

Set `<service>.enabled=false` and configure `<service>.external.*` for any combination of PostgreSQL (`db`), Valkey
(`valkey`), OpenBao (`openbao`), and Keycloak (`keycloak`).

## Security defaults

- Every pod runs non-root with `seccompProfile.type: RuntimeDefault`, `automountServiceAccountToken: false`,
  `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]`, explicit CPU/memory requests and limits, no
  `hostPath`, and no `hostNetwork`.
- `readOnlyRootFilesystem: true` on `api`, `worker`, `migrate`, `web`, `db`, `valkey`, and `openbao` (matching
  `deploy/control/compose.yaml`; Keycloak keeps writable cache).
- Default-deny `NetworkPolicy` allows only `web → api`, `api/worker/migrate → db/valkey/openbao/keycloak`,
  `keycloak → db`, DNS, and (only when `control.url` is set and `control.airGapped: false`) outbound HTTPS (`443`) for
  the M84 install agent.
