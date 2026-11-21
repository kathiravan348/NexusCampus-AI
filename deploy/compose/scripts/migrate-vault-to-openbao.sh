#!/usr/bin/env bash
# One-time upgrade of an install made before NEX-066: HashiCorp Vault "file" storage -> OpenBao raft storage (D48).
# Safe to run twice: it does nothing when the storage is already raft. Keeps a backup of the old storage in backups/.
# The unseal key and root token in .secrets/vault-init.json stay valid. Afterwards run scripts/install.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
project=${NEXUS_PROJECT:-nexuscampus-install}
data="${project}_vault-data"
work="${project}_vault-migrate"
bao=openbao/openbao:2.7.2
vault=hashicorp/vault:1.20.4

if ! docker volume inspect "$data" > /dev/null 2>&1; then echo "No key storage volume ($data): nothing to migrate."; exit 0; fi
layout=$(docker run --rm --entrypoint sh -v "$data:/d:ro" "$bao" -c 'if [ -f /d/vault.db ]; then echo raft; elif [ -d /d/core ]; then echo file; else echo empty; fi')
if [ "$layout" != "file" ]; then echo "Key storage is '$layout': no migration needed."; exit 0; fi

docker compose -p "$project" -f compose.yaml stop api worker vault redis > /dev/null 2>&1 || true
mkdir -p backups && chmod 700 backups
stamp=$(date +%Y%m%d-%H%M%S)
docker run --rm --entrypoint sh -v "$data:/d:ro" -v "$PWD/backups:/b" "$bao" -c "tar czf /b/vault-file-$stamp.tgz -C /d ."
echo "Backed up the old key storage to deploy/compose/backups/vault-file-$stamp.tgz"

docker volume rm "$work" > /dev/null 2>&1 || true
docker volume create "$work" > /dev/null
# The source is not read-only: Vault writes a migration lock into it (the backup above is the safety copy).
docker run --rm --user root --entrypoint vault -v "$data:/vault/file" -v "$work:/vault/raft" \
  -v "$PWD/vault/migrate-from-vault.hcl:/migrate.hcl:ro" "$vault" operator migrate -config=/migrate.hcl
docker run --rm --user root --entrypoint sh -v "$work:/s:ro" -v "$data:/d" "$bao" \
  -c 'rm -rf /d/* /d/.[!.]* 2>/dev/null; cp -a /s/. /d/ && chown -R openbao:openbao /d'
docker volume rm "$work" > /dev/null
echo "Key storage converted to raft for OpenBao."

# Valkey cannot read a Redis 7.4 snapshot. It only held sign-in sessions and short-lived caches: move it to the
# backup folder; people sign in again.
cache="${project}_redis-data"
if docker volume inspect "$cache" > /dev/null 2>&1; then
  docker run --rm --user root --entrypoint sh -v "$cache:/d" -v "$PWD/backups:/b" "$bao" \
    -c "[ ! -f /d/dump.rdb ] || mv /d/dump.rdb /b/redis-dump-$stamp.rdb"
fi
echo "Done. Now run: scripts/install.sh"
