# One-time upgrade of an install made before NEX-066: HashiCorp Vault "file" storage -> OpenBao raft storage (D48).
# Safe to run twice: it does nothing when the storage is already raft. Keeps a backup of the old storage in backups\.
# The unseal key and root token in .secrets\vault-init.json stay valid. Afterwards run scripts\install.ps1.
# "Continue": Windows PowerShell turns any docker stderr line into a fatal error under "Stop"; every step that must
# succeed goes through Invoke-Docker, which checks the exit code.
param([string]$Project = "nexuscampus-install")
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")
$project = $Project
$data = "${project}_vault-data"
$work = "${project}_vault-migrate"
$bao = "openbao/openbao:2.7.2"
$vault = "hashicorp/vault:1.20.4"
function Invoke-Docker {
  $out = & docker @args 2>&1
  if ($LASTEXITCODE -ne 0) {
    $out | ForEach-Object { "$_" } | Select-Object -Last 5 | ForEach-Object { Write-Output $_ }
    throw "docker $($args[0]) failed"
  }
  $out | ForEach-Object { "$_" } | Where-Object { $_ -notmatch "\[INFO\]|\[WARN\]|copied key" }
}

& docker volume inspect $data 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Output "No key storage volume ($data): nothing to migrate."; exit 0 }
$layout = (& docker run --rm --entrypoint sh -v "${data}:/d:ro" $bao -c 'if [ -f /d/vault.db ]; then echo raft; elif [ -d /d/core ]; then echo file; else echo empty; fi').Trim()
if ($layout -ne "file") { Write-Output "Key storage is '$layout': no migration needed."; exit 0 }

& docker compose -p $project -f compose.yaml stop api worker vault redis 2>$null | Out-Null
New-Item -ItemType Directory -Force backups | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backups = (Resolve-Path backups).Path
Invoke-Docker run --rm --entrypoint sh -v "${data}:/d:ro" -v "${backups}:/b" $bao -c "tar czf /b/vault-file-$stamp.tgz -C /d ."
Write-Output "Backed up the old key storage to deploy\compose\backups\vault-file-$stamp.tgz"

& docker volume rm $work 2>$null | Out-Null
Invoke-Docker volume create $work | Out-Null
$hcl = (Resolve-Path vault/migrate-from-vault.hcl).Path
Invoke-Docker run --rm --user root --entrypoint vault -v "${data}:/vault/file" -v "${work}:/vault/raft" -v "${hcl}:/migrate.hcl:ro" $vault operator migrate -config /migrate.hcl # two words: PowerShell splits "-x=/a.b" at the dot
Invoke-Docker run --rm --user root --entrypoint sh -v "${work}:/s:ro" -v "${data}:/d" $bao -c 'rm -rf /d/* /d/.[!.]* 2>/dev/null; cp -a /s/. /d/ && chown -R openbao:openbao /d'
Invoke-Docker volume rm $work | Out-Null
Write-Output "Key storage converted to raft for OpenBao."

# Valkey cannot read a Redis 7.4 snapshot. It only held sign-in sessions and short-lived caches: move it to the
# backup folder; people sign in again.
$cache = "${project}_redis-data"
& docker volume inspect $cache 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Invoke-Docker run --rm --user root --entrypoint sh -v "${cache}:/d" -v "${backups}:/b" $bao -c "[ ! -f /d/dump.rdb ] || mv /d/dump.rdb /b/redis-dump-$stamp.rdb"
}
Write-Output "Done. Now run: scripts\install.ps1"
