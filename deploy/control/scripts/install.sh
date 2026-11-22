#!/usr/bin/env bash
# Nexus Control Compose install / start / upgrade (NEX-108). Idempotent: safe to re-run after reboot or upgrade.
#   deploy/control/scripts/install.sh                     # empty Control stack
#   NEXUS_CONTROL_DEMO=1 deploy/control/scripts/install.sh # with demo staff & commercial fixtures
set -euo pipefail
cd "$(dirname "$0")/.."
start_ms=$(date +%s%3N)
dc() { docker compose -f compose.yaml --env-file .env "$@"; }
rand_alnum() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }
rand_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
set_env() {
  if grep -q "^$1=" .env; then sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak; else echo "$1=$2" >> .env; fi
}
get_env() { grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- || true; }

# 1. Settings & secrets (.env is git-ignored; secrets are generated once and never printed).
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "created deploy/control/.env"
fi
[ -n "${NEXUS_CONTROL_DEMO:-}" ] && set_env NEXUS_CONTROL_DEMO "$NEXUS_CONTROL_DEMO"
[ -z "$(get_env NEXUS_CONTROL_LAGO_WEBHOOK_URL)" ] && \
  set_env NEXUS_CONTROL_LAGO_WEBHOOK_URL "http://control-api:8100/control/api/v1/billing/lago-webhook"

for k in NEXUS_CONTROL_DB_PASSWORD NEXUS_CONTROL_APP_DB_PASSWORD KEYCLOAK_DB_PASSWORD \
         NEXUS_KEYCLOAK_ADMIN_PASSWORD NEXUS_CONTROL_OIDC_CLIENT_SECRET NEXUS_DEMO_USER_PASSWORD \
         LAGO_DB_PASSWORD LAGO_ORG_USER_PASSWORD; do
  [ -z "$(get_env "$k")" ] && set_env "$k" "$(rand_alnum)"
done
[ -z "$(get_env LAGO_SECRET_KEY_BASE)" ] && set_env LAGO_SECRET_KEY_BASE "$(rand_hex 64)"
for k in LAGO_ENCRYPTION_PRIMARY_KEY LAGO_ENCRYPTION_DETERMINISTIC_KEY LAGO_ENCRYPTION_KEY_DERIVATION_SALT; do
  [ -z "$(get_env "$k")" ] && set_env "$k" "$(rand_hex 16)"
done
[ -z "$(get_env NEXUS_CONTROL_LAGO_API_KEY)" ] && set_env NEXUS_CONTROL_LAGO_API_KEY "$(rand_hex 24)"

# 2. Build local backend image & generate Lago RSA key inside it if missing (before Compose validates .env).
img="$(get_env NEXUS_IMAGE_API)"; img="${img:-nexuscampus-api:dev}"
if [ "$img" = "nexuscampus-api:dev" ]; then
  docker build -t "$img" ../../backend
fi
if [ -z "$(get_env LAGO_RSA_PRIVATE_KEY)" ]; then
  rsa_b64=$(docker run --rm --entrypoint python "$img" -c \
    "import base64; from cryptography.hazmat.primitives import serialization as s; from cryptography.hazmat.primitives.asymmetric import rsa; k = rsa.generate_private_key(65537, 2048); print(base64.b64encode(k.private_bytes(s.Encoding.PEM, s.PrivateFormat.TraditionalOpenSSL, s.NoEncryption())).decode())")
  set_env LAGO_RSA_PRIVATE_KEY "$rsa_b64"
fi

# 3. Infrastructure (DB, Valkey, OpenBao, staff Keycloak, Lago).
dc up -d --wait control-db valkey openbao staff-keycloak lago-db lago-valkey lago-api lago-worker lago-clock

# 4. OpenBao: init once (.env.vault-init.json, git-ignored by .env.*), unseal, create nexus-licence & nexus-release keys.
bao_exec() { dc exec -T openbao bao "$@"; }
bao_state() { bao_exec status -format=json 2>/dev/null || true; }
if ! bao_state | grep -q '"initialized": true'; then
  if [ -s .env.vault-init.json ]; then
    echo "OpenBao reports not initialised but .env.vault-init.json exists: refusing to re-initialise." >&2
    exit 1
  fi
  bao_exec operator init -key-shares=1 -key-threshold=1 -format=json > .env.vault-init.json.new
  chmod 600 .env.vault-init.json.new && mv .env.vault-init.json.new .env.vault-init.json
  echo "OpenBao initialised: back up deploy/control/.env.vault-init.json offline"
fi
[ -s .env.vault-init.json ] || { echo "Missing deploy/control/.env.vault-init.json" >&2; exit 1; }
unseal_key=$(tr -d '\n ' < .env.vault-init.json | sed -E 's/.*"unseal_keys_b64":\["([^"]+)".*/\1/')
root_token=$(tr -d '\n ' < .env.vault-init.json | sed -E 's/.*"root_token":"([^"]+)".*/\1/')
bao_state | grep -q '"sealed": false' || bao_exec operator unseal "$unseal_key" > /dev/null
rbao() { dc exec -T -e BAO_TOKEN="$root_token" openbao bao "$@"; }
rbao secrets list | grep -q '^transit/' || rbao secrets enable transit > /dev/null
rbao write -f transit/keys/nexus-licence type=ed25519 exportable=false > /dev/null
rbao write -f transit/keys/nexus-release type=ed25519 exportable=false > /dev/null
printf '%s\n' \
  'path "transit/*" { capabilities = ["create", "read", "update", "delete", "list"] }' \
  'path "auth/token/renew-self" { capabilities = ["update"] }' \
  'path "auth/token/lookup-self" { capabilities = ["read"] }' | rbao policy write nexus-control - > /dev/null
cur_tok="$(get_env NEXUS_VAULT_TOKEN)"
if [ -z "$cur_tok" ] || ! dc exec -T -e BAO_TOKEN="$cur_tok" openbao bao token renew > /dev/null 2>&1; then
  new_tok=$(rbao token create -policy=nexus-control -no-default-policy -orphan -period=768h -field=token)
  set_env NEXUS_VAULT_TOKEN "$new_tok"
fi

# 5. Lago HMAC webhook registration & key sync (never printed).
if [ -z "$(get_env NEXUS_CONTROL_LAGO_WEBHOOK_KEY)" ]; then
  wh_key=$(dc exec -T lago-db psql -U lago -d lago -tAc "SELECT hmac_key FROM organizations LIMIT 1" | tr -d '[:space:]')
  [ -n "$wh_key" ] && set_env NEXUS_CONTROL_LAGO_WEBHOOK_KEY "$wh_key"
fi
dc run --rm --no-deps control-migrate python -c "
import os, httpx2
url = os.environ['NEXUS_CONTROL_LAGO_WEBHOOK_URL']
api = os.environ['NEXUS_CONTROL_LAGO_API_URL']
h = {'Authorization': 'Bearer ' + os.environ['NEXUS_CONTROL_LAGO_API_KEY']}
with httpx2.Client(timeout=15) as c:
    eps = c.get(api + '/api/v1/webhook_endpoints', headers=h).json().get('webhook_endpoints', [])
    if not any(e.get('webhook_url') == url and e.get('signature_algo') == 'hmac' for e in eps):
        r = c.post(api + '/api/v1/webhook_endpoints', headers=h, json={'webhook_endpoint': {'webhook_url': url, 'signature_algo': 'hmac'}})
        r.raise_for_status()
"

# 6. Forward-only Control migrations (and demo seed + demo Keycloak staff users when NEXUS_CONTROL_DEMO=1).
dc run --rm control-migrate
if [ "$(get_env NEXUS_CONTROL_DEMO)" = "1" ]; then
  dc run --rm --no-deps \
    -e NEXUS_KEYCLOAK_ADMIN_PASSWORD="$(get_env NEXUS_KEYCLOAK_ADMIN_PASSWORD)" \
    -e NEXUS_DEMO_USER_PASSWORD="$(get_env NEXUS_DEMO_USER_PASSWORD)" \
    -e NEXUS_KEYCLOAK_URL=http://staff-keycloak:8080 \
    control-migrate python -c "
import asyncio, os, httpx2
from nexus.control.seed import load_fixtures
async def run():
    base = 'http://staff-keycloak:8080'
    async with httpx2.AsyncClient(timeout=20) as http:
        tok = (await http.post(base + '/realms/master/protocol/openid-connect/token', data={'grant_type':'password','client_id':'admin-cli','username':'admin','password':os.environ['NEXUS_KEYCLOAK_ADMIN_PASSWORD']})).json()['access_token']
        http.headers['Authorization'] = 'Bearer ' + tok
        users = base + '/admin/realms/nexus-staff/users'
        pw = os.environ['NEXUS_DEMO_USER_PASSWORD']
        for s in load_fixtures().staff:
            if not s.active: continue
            if (await http.get(users, params={'email': s.work_email, 'exact': 'true'})).json(): continue
            first, _, last = s.display_name.partition(' ')
            r = await http.post(users, json={'username': s.work_email, 'email': s.work_email, 'emailVerified': True, 'enabled': True, 'firstName': first, 'lastName': last or first, 'requiredActions': ['CONFIGURE_TOTP'], 'credentials': [{'type':'password','value':pw,'temporary':False}]})
            r.raise_for_status()
asyncio.run(run())
"
fi

# 7. Start Control API (only 127.0.0.1:8100 published).
dc up -d --wait control-api
elapsed=$(( $(date +%s%3N) - start_ms ))
echo "[timing] control-compose:up: $((elapsed / 1000)).$(( (elapsed % 1000) / 10 ))s"
echo "Nexus Control API ready at http://127.0.0.1:$(get_env NEXUS_CONTROL_PORT | sed 's/^$/8100/')/control/api/v1/health"
