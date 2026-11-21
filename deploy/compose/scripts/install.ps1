# NexusCampus self-hosted install / start / upgrade for Windows (NEX-064). Same steps as install.sh; idempotent.
#   powershell -File deploy/compose/scripts/install.ps1            # empty install
#   powershell -File deploy/compose/scripts/install.ps1 -Seed demo # with the demo institutions and users
param([string]$Seed = "")
# Native tools report on stderr; failures are checked by exit code (PowerShell 5.1 would stop on any stderr line).
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")
$watch = [System.Diagnostics.Stopwatch]::StartNew()

function Invoke-Dc { & docker compose -f compose.yaml @args; if ($LASTEXITCODE -ne 0) { throw "docker compose $args failed" } }
function New-Secret {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  (([Convert]::ToBase64String($bytes)) -replace '[^A-Za-z0-9]', '').Substring(0, 40)
}
function Set-EnvValue([string]$Key, [string]$Value) {
  $lines = Get-Content .env
  if ($lines -match "^$Key=") { $lines = $lines -replace "^$Key=.*", "$Key=$Value" } else { $lines += "$Key=$Value" }
  [System.IO.File]::WriteAllLines((Join-Path (Get-Location) ".env"), $lines)
}
function Read-Env {
  foreach ($line in Get-Content .env) {
    if ($line -match '^([A-Z_]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
  }
}

# 1. Settings and secrets (.env is git-ignored; secrets are generated once).
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  foreach ($line in Get-Content .env) { if ($line -match '^([A-Z_]+)=generate$') { Set-EnvValue $Matches[1] (New-Secret) } }
  Write-Output "created deploy/compose/.env with new secrets"
}
if ($Seed) { Set-EnvValue NEXUS_SEED $Seed }
Read-Env
New-Item -ItemType Directory -Force .secrets | Out-Null

# 2. Images, 3. infrastructure.
Invoke-Dc build migrate web
Invoke-Dc up -d --wait db redis vault keycloak

# 4. OpenBao (the key vault, D48): initialise once (never overwriting the key file), unseal, Transit and a Transit-only app token.
function Get-VaultState { (& docker compose -f compose.yaml exec -T vault bao status -format=json 2>$null) -join "" }
if ((Get-VaultState) -notmatch '"initialized":\s*true') {
  if ((Test-Path .secrets/vault-init.json) -and (Get-Item .secrets/vault-init.json).Length -gt 0) {
    throw "Vault reports 'not initialised' but .secrets/vault-init.json exists: refusing to re-initialise."
  }
  $init = (& docker compose -f compose.yaml exec -T vault bao operator init -key-shares=1 -key-threshold=1 -format=json) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw "bao operator init failed" }
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) ".secrets/vault-init.json"), $init)
  Write-Output "Vault initialised: unseal key and root token in deploy/compose/.secrets/vault-init.json - back it up offline"
}
if (-not (Test-Path .secrets/vault-init.json)) { throw "Vault is initialised but .secrets/vault-init.json is missing: restore it from your backup." }
$keys = Get-Content .secrets/vault-init.json -Raw | ConvertFrom-Json
if ((Get-VaultState) -notmatch '"sealed":\s*false') { Invoke-Dc exec -T vault bao operator unseal $keys.unseal_keys_b64[0] | Out-Null }
function Invoke-RootVault { & docker compose -f compose.yaml exec -T -e "BAO_TOKEN=$($keys.root_token)" vault bao @args }
if (-not ((Invoke-RootVault secrets list) -match '^transit/')) { Invoke-RootVault secrets enable transit | Out-Null }
$policy = @(
  'path "transit/*" { capabilities = ["create", "read", "update", "delete", "list"] }',
  'path "auth/token/renew-self" { capabilities = ["update"] }',
  'path "auth/token/lookup-self" { capabilities = ["read"] }'
) -join "`n"
# Passed base64-encoded, not piped: Windows PowerShell adds a byte-order mark to piped text, which OpenBao rejects.
$policyB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($policy))
& docker compose -f compose.yaml exec -T -e "BAO_TOKEN=$($keys.root_token)" vault sh -c "echo $policyB64 | base64 -d | bao policy write nexus-app -" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "bao policy write failed" }
$renewed = $false
if ($env:NEXUS_VAULT_TOKEN) {
  & docker compose -f compose.yaml exec -T -e "BAO_TOKEN=$env:NEXUS_VAULT_TOKEN" vault bao token renew 2>$null | Out-Null
  $renewed = ($LASTEXITCODE -eq 0)
}
if (-not $renewed) {
  $token = (Invoke-RootVault token create -policy=nexus-app -no-default-policy -orphan -period=768h -field=token) -join ""
  Set-EnvValue NEXUS_VAULT_TOKEN $token
  $env:NEXUS_VAULT_TOKEN = $token
}

# 5. Database: forward-only migrations; demo data when asked.
Invoke-Dc run --rm migrate
if ($env:NEXUS_SEED -eq "demo") {
  $demo = @("-e", "NEXUS_ENVIRONMENT=dev", "-e", "NEXUS_KEYCLOAK_ADMIN_PASSWORD", "-e", "NEXUS_DEMO_USER_PASSWORD", "-e", "NEXUS_VAULT_TOKEN")
  Invoke-Dc run --rm @demo migrate nexus-seed
  Invoke-Dc run --rm @demo migrate nexus-keycloak-dev
  Invoke-Dc run --rm @demo migrate nexus-vault-dev
}

# 6. Application.
Invoke-Dc up -d --wait api worker web
Write-Output ("[timing] compose:up: {0:N2}s" -f $watch.Elapsed.TotalSeconds)
Write-Output "NexusCampus is running at $env:NEXUS_PUBLIC_URL"
