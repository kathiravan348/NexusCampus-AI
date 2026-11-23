#!/usr/bin/env bash
# NexusCampus self-hosted install / start / upgrade (NEX-064). Idempotent: run it again after a reboot (Vault
# starts sealed), after pulling new images (forward-only migrations run every time), or to renew the Vault token.
#   deploy/compose/scripts/install.sh            # empty install
#   NEXUS_SEED=demo deploy/compose/scripts/install.sh   # with the demo institutions and users
set -euo pipefail
cd "$(dirname "$0")/.."
start_ms=$(date +%s%3N)
dc() { docker compose -f compose.yaml "$@"; }
rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }
set_env() { # set_env KEY VALUE  (in .env)
  if grep -q "^$1=" .env; then sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak; else echo "$1=$2" >> .env; fi
}

# 1. Settings and secrets (.env is git-ignored; secrets are generated once).
if [ ! -f .env ]; then
  cp .env.example .env
  while IFS= read -r key; do set_env "$key" "$(rand)"; done < <(grep -E '=generate$' .env | cut -d= -f1)
  echo "created deploy/compose/.env with new secrets"
fi
[ -n "${NEXUS_SEED:-}" ] && set_env NEXUS_SEED "$NEXUS_SEED"
set -a; . ./.env; set +a
mkdir -p .secrets && chmod 700 .secrets

# 2. Images (local builds unless NEXUS_IMAGE_* point at released images).
dc build migrate web

# 3. Infrastructure.
dc up -d --wait db redis vault keycloak

# 4. OpenBao (the key vault, D48): initialise once, unseal, Transit engine and an app token that can only use Transit.
vault() { dc exec -T vault bao "$@"; }
vault_state() { vault status -format=json 2>/dev/null || true; } # exits 2 while sealed
if ! vault_state | grep -q '"initialized": true'; then
  if [ -s .secrets/vault-init.json ]; then
    echo "Vault reports 'not initialised' but .secrets/vault-init.json exists: refusing to re-initialise." >&2
    exit 1
  fi
  # Never truncate a key file: write to a temporary file and keep it only if init succeeded.
  vault operator init -key-shares=1 -key-threshold=1 -format=json > .secrets/vault-init.json.new
  chmod 600 .secrets/vault-init.json.new
  mv .secrets/vault-init.json.new .secrets/vault-init.json
  echo "Vault initialised: unseal key and root token in deploy/compose/.secrets/vault-init.json — back it up offline"
fi
if [ ! -s .secrets/vault-init.json ]; then
  echo "Vault is initialised but deploy/compose/.secrets/vault-init.json is missing: restore it from your backup." >&2
  exit 1
fi
unseal_key=$(tr -d '\n ' < .secrets/vault-init.json | sed -E 's/.*"unseal_keys_b64":\["([^"]+)".*/\1/')
root_token=$(tr -d '\n ' < .secrets/vault-init.json | sed -nE 's/.*"root_token":"([^"]+)".*/\1/p')
[ -n "${NEXUS_VAULT_ROOT_TOKEN:-}" ] && root_token="$NEXUS_VAULT_ROOT_TOKEN"
vault_state | grep -q '"sealed": false' || vault operator unseal "$unseal_key" > /dev/null
app_ok=0
if [ -n "${NEXUS_VAULT_TOKEN:-}" ] && dc exec -T -e BAO_TOKEN="$NEXUS_VAULT_TOKEN" vault bao token renew > /dev/null 2>&1; then
  app_ok=1
fi
if [ "$app_ok" = "0" ] || [ -n "$root_token" ]; then
  [ -n "$root_token" ] || { echo "OpenBao app token expired and root token was revoked: regenerate one with 'bao operator generate-root' and pass NEXUS_VAULT_ROOT_TOKEN." >&2; exit 1; }
  rvault() { dc exec -T -e BAO_TOKEN="$root_token" vault bao "$@"; }
  rvault secrets list | grep -q '^transit/' || rvault secrets enable transit > /dev/null
  # Key custody (NEX-110, V-2): deny transit/export/* explicitly; allow only what encryption, signing, backup,
  # import/export wrapping, and crypto-shred need.
  printf '%s\n' \
    'path "transit/export/*" { capabilities = ["deny"] }' \
    'path "transit/keys/*" { capabilities = ["create", "read", "update", "delete", "list"] }' \
    'path "transit/datakey/plaintext/*" { capabilities = ["update"] }' \
    'path "transit/encrypt/*" { capabilities = ["update"] }' \
    'path "transit/decrypt/*" { capabilities = ["update"] }' \
    'path "transit/sign/*" { capabilities = ["update"] }' \
    'path "transit/verify/*" { capabilities = ["update"] }' \
    'path "auth/token/renew-self" { capabilities = ["update"] }' \
    'path "auth/token/lookup-self" { capabilities = ["read"] }' | rvault policy write nexus-app - > /dev/null
  if [ "$app_ok" = "0" ]; then
    NEXUS_VAULT_TOKEN=$(rvault token create -policy=nexus-app -no-default-policy -orphan -period=768h -field=token)
    set_env NEXUS_VAULT_TOKEN "$NEXUS_VAULT_TOKEN"
    export NEXUS_VAULT_TOKEN
  fi
  # Revoke the OpenBao root token once setup is complete and strip it from disk (NEX-110).
  rvault token revoke -self > /dev/null 2>&1 || true
  printf '{"unseal_keys_b64":["%s"]}\n' "$unseal_key" > .secrets/vault-init.json.new
  chmod 600 .secrets/vault-init.json.new && mv .secrets/vault-init.json.new .secrets/vault-init.json
fi

# 5. Database: forward-only migrations; demo data when asked.
dc run --rm migrate
if [ "${NEXUS_SEED:-}" = "demo" ]; then
  demo=(-e NEXUS_ENVIRONMENT=dev -e NEXUS_KEYCLOAK_ADMIN_PASSWORD -e NEXUS_DEMO_USER_PASSWORD -e NEXUS_VAULT_TOKEN)
  dc run --rm "${demo[@]}" migrate nexus-seed
  dc run --rm "${demo[@]}" migrate nexus-keycloak-dev
  dc run --rm "${demo[@]}" migrate nexus-vault-dev
fi

# 6. Application.
dc up -d --wait api worker web
elapsed=$(( $(date +%s%3N) - start_ms ))
echo "[timing] compose:up: $((elapsed / 1000)).$(( (elapsed % 1000) / 10 ))s"
echo "NexusCampus is running at ${NEXUS_PUBLIC_URL}"
