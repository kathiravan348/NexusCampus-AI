# Nexus Control Compose install / start / upgrade for Windows (NEX-108). Same steps as install.sh; idempotent.
#   powershell -File deploy/control/scripts/install.ps1        # empty Control stack
#   powershell -File deploy/control/scripts/install.ps1 -Demo  # with demo staff & commercial fixtures
param([switch]$Demo)
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")
$watch = [System.Diagnostics.Stopwatch]::StartNew()

function Invoke-Dc {
  & docker compose -f compose.yaml --env-file .env @args
  if ($LASTEXITCODE -ne 0) { throw "docker compose $args failed" }
}
function New-Alnum {
  $b = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  (([Convert]::ToBase64String($b)) -replace '[^A-Za-z0-9]', '').Substring(0, 40)
}
function New-Hex([int]$Bytes) {
  $b = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ([BitConverter]::ToString($b) -replace '-', '').ToLowerInvariant()
}
function Get-EnvValue([string]$Key) {
  foreach ($line in Get-Content .env) {
    if ($line -match "^$Key=(.*)$") { return $Matches[1].Trim() }
  }
  return ""
}
function Set-EnvValue([string]$Key, [string]$Value) {
  $lines = @(Get-Content .env)
  if ($lines -match "^$Key=") { $lines = $lines -replace "^$Key=.*", "$Key=$Value" } else { $lines += "$Key=$Value" }
  [System.IO.File]::WriteAllLines((Join-Path (Get-Location) ".env"), $lines)
}

# 1. Settings & secrets (.env is git-ignored; secrets are generated once and never printed).
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Output "created deploy/control/.env"
}
if ($Demo) { Set-EnvValue NEXUS_CONTROL_DEMO "1" }
if (-not (Get-EnvValue NEXUS_CONTROL_LAGO_WEBHOOK_URL)) {
  Set-EnvValue NEXUS_CONTROL_LAGO_WEBHOOK_URL "http://control-api:8100/control/api/v1/billing/lago-webhook"
}
foreach ($k in @("NEXUS_CONTROL_DB_PASSWORD","NEXUS_CONTROL_APP_DB_PASSWORD","KEYCLOAK_DB_PASSWORD",
  "NEXUS_KEYCLOAK_ADMIN_PASSWORD","NEXUS_CONTROL_OIDC_CLIENT_SECRET","NEXUS_DEMO_USER_PASSWORD",
  "LAGO_DB_PASSWORD","LAGO_ORG_USER_PASSWORD")) {
  if (-not (Get-EnvValue $k)) { Set-EnvValue $k (New-Alnum) }
}
if (-not (Get-EnvValue LAGO_SECRET_KEY_BASE)) { Set-EnvValue LAGO_SECRET_KEY_BASE (New-Hex 64) }
foreach ($k in @("LAGO_ENCRYPTION_PRIMARY_KEY","LAGO_ENCRYPTION_DETERMINISTIC_KEY","LAGO_ENCRYPTION_KEY_DERIVATION_SALT")) {
  if (-not (Get-EnvValue $k)) { Set-EnvValue $k (New-Hex 16) }
}
if (-not (Get-EnvValue NEXUS_CONTROL_LAGO_API_KEY)) { Set-EnvValue NEXUS_CONTROL_LAGO_API_KEY (New-Hex 24) }

# 2. Build local backend image & generate Lago RSA key inside it if missing (before Compose validates .env).
$img = Get-EnvValue NEXUS_IMAGE_API; if (-not $img) { $img = "nexuscampus-api:dev" }
if ($img -eq "nexuscampus-api:dev") {
  & docker build -t $img ../../backend
  if ($LASTEXITCODE -ne 0) { throw "docker build $img failed" }
}
if (-not (Get-EnvValue LAGO_RSA_PRIVATE_KEY)) {
  $py = "import base64; from cryptography.hazmat.primitives import serialization as s; from cryptography.hazmat.primitives.asymmetric import rsa; k = rsa.generate_private_key(65537, 2048); print(base64.b64encode(k.private_bytes(s.Encoding.PEM, s.PrivateFormat.TraditionalOpenSSL, s.NoEncryption())).decode())"
  $rsaB64 = (& docker run --rm --entrypoint python $img -c $py) -join ""
  if ($LASTEXITCODE -ne 0 -or -not $rsaB64) { throw "Lago RSA key generation failed" }
  Set-EnvValue LAGO_RSA_PRIVATE_KEY $rsaB64.Trim()
}

# 3. Infrastructure.
Invoke-Dc up -d --wait control-db valkey openbao staff-keycloak lago-db lago-valkey lago-api lago-worker lago-clock

# 4. OpenBao: init once (.env.vault-init.json, git-ignored), unseal, create nexus-licence & nexus-release keys.
function Get-BaoState { (& docker compose -f compose.yaml --env-file .env exec -T openbao bao status -format=json 2>$null) -join "" }
if ((Get-BaoState) -notmatch '"initialized":\s*true') {
  if ((Test-Path .env.vault-init.json) -and (Get-Item .env.vault-init.json).Length -gt 0) {
    throw "OpenBao reports not initialised but .env.vault-init.json exists: refusing to re-initialise."
  }
  $init = (& docker compose -f compose.yaml --env-file .env exec -T openbao bao operator init -key-shares=1 -key-threshold=1 -format=json) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw "bao operator init failed" }
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) ".env.vault-init.json"), $init)
  Write-Output "OpenBao initialised: back up deploy/control/.env.vault-init.json offline"
}
if (-not (Test-Path .env.vault-init.json)) { throw "Missing deploy/control/.env.vault-init.json" }
$keys = Get-Content .env.vault-init.json -Raw | ConvertFrom-Json
if ((Get-BaoState) -notmatch '"sealed":\s*false') { Invoke-Dc exec -T openbao bao operator unseal $keys.unseal_keys_b64[0] | Out-Null }
$rootTok = if ($env:NEXUS_VAULT_ROOT_TOKEN) { $env:NEXUS_VAULT_ROOT_TOKEN } elseif ($keys.PSObject.Properties["root_token"]) { [string]$keys.root_token } else { "" }
$curTok = Get-EnvValue NEXUS_VAULT_TOKEN
$renewed = $false
if ($curTok) {
  & docker compose -f compose.yaml --env-file .env exec -T -e "BAO_TOKEN=$curTok" openbao bao token renew 2>$null | Out-Null
  $renewed = ($LASTEXITCODE -eq 0)
}
if (-not $renewed -or $rootTok) {
  if (-not $rootTok) { throw "OpenBao app token expired and root token was revoked: regenerate one with 'bao operator generate-root' and set NEXUS_VAULT_ROOT_TOKEN." }
  function Invoke-RootBao {
    & docker compose -f compose.yaml --env-file .env exec -T -e "BAO_TOKEN=$rootTok" openbao bao @args
    if ($LASTEXITCODE -ne 0) { throw "bao $args failed" }
  }
  if (-not ((Invoke-RootBao secrets list) -match '^transit/')) { Invoke-RootBao secrets enable transit | Out-Null }
  foreach ($k in @("nexus-licence","nexus-release","nexus-command","nexus-shred")) {
    Invoke-RootBao write -f "transit/keys/$k" type=ed25519 exportable=false | Out-Null
  }
  # Least privilege: create, read, sign and verify the four Ed25519 signing keys only; never delete, configure,
  # rotate or export them (NEX-110).
  $policy = @(
    'path "transit/keys/nexus-licence" { capabilities = ["create", "read", "update"] }',
    'path "transit/keys/nexus-release" { capabilities = ["create", "read", "update"] }',
    'path "transit/keys/nexus-command" { capabilities = ["create", "read", "update"] }',
    'path "transit/keys/nexus-shred" { capabilities = ["create", "read", "update"] }',
    'path "transit/sign/nexus-licence" { capabilities = ["update"] }',
    'path "transit/sign/nexus-release" { capabilities = ["update"] }',
    'path "transit/sign/nexus-command" { capabilities = ["update"] }',
    'path "transit/sign/nexus-shred" { capabilities = ["update"] }',
    'path "transit/verify/nexus-licence" { capabilities = ["update"] }',
    'path "transit/verify/nexus-release" { capabilities = ["update"] }',
    'path "transit/verify/nexus-command" { capabilities = ["update"] }',
    'path "transit/verify/nexus-shred" { capabilities = ["update"] }',
    'path "transit/export/*" { capabilities = ["deny"] }',
    'path "auth/token/renew-self" { capabilities = ["update"] }',
    'path "auth/token/lookup-self" { capabilities = ["read"] }'
  ) -join "`n"
  $policyB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($policy))
  & docker compose -f compose.yaml --env-file .env exec -T -e "BAO_TOKEN=$rootTok" openbao sh -c "echo $policyB64 | base64 -d | bao policy write nexus-control -" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "bao policy write failed" }
  if (-not $renewed) {
    $tok = (Invoke-RootBao token create -policy=nexus-control -no-default-policy -orphan -period=768h -field=token) -join ""
    Set-EnvValue NEXUS_VAULT_TOKEN $tok.Trim()
  }
  # Revoke the OpenBao root token once setup is complete and strip it from disk (NEX-110).
  & docker compose -f compose.yaml --env-file .env exec -T -e "BAO_TOKEN=$rootTok" openbao bao token revoke -self 2>$null | Out-Null
  $slim = @{ unseal_keys_b64 = @($keys.unseal_keys_b64[0]) } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) ".env.vault-init.json"), $slim + "`n")
}

# 5. Lago HMAC webhook key sync & endpoint registration (never printed).
if (-not (Get-EnvValue NEXUS_CONTROL_LAGO_WEBHOOK_KEY)) {
  $whKey = (& docker compose -f compose.yaml --env-file .env exec -T lago-db psql -U lago -d lago -tAc "SELECT hmac_key FROM organizations LIMIT 1") -join ""
  if ($LASTEXITCODE -ne 0 -or -not $whKey.Trim()) { throw "failed reading Lago hmac_key" }
  Set-EnvValue NEXUS_CONTROL_LAGO_WEBHOOK_KEY $whKey.Trim()
}
$regPy = @'
import os, httpx2
url = os.environ["NEXUS_CONTROL_LAGO_WEBHOOK_URL"]
api = os.environ["NEXUS_CONTROL_LAGO_API_URL"]
h = {"Authorization": "Bearer " + os.environ["NEXUS_CONTROL_LAGO_API_KEY"]}
with httpx2.Client(timeout=15) as c:
    eps = c.get(api + "/api/v1/webhook_endpoints", headers=h).json().get("webhook_endpoints", [])
    if not any(e.get("webhook_url") == url and e.get("signature_algo") == "hmac" for e in eps):
        r = c.post(api + "/api/v1/webhook_endpoints", headers=h, json={"webhook_endpoint": {"webhook_url": url, "signature_algo": "hmac"}})
        r.raise_for_status()
'@
$regB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($regPy))
Invoke-Dc run --rm --no-deps control-migrate python -c "import base64; exec(base64.b64decode('$regB64'))"

# 6. Forward-only Control migrations (and demo seed + demo Keycloak staff users when NEXUS_CONTROL_DEMO=1).
Invoke-Dc run --rm control-migrate
if ((Get-EnvValue NEXUS_CONTROL_DEMO) -eq "1") {
  $kcPy = @'
import asyncio, os, httpx2
from nexus.control.seed import load_fixtures
async def run():
    base = "http://staff-keycloak:8080"
    async with httpx2.AsyncClient(timeout=20) as http:
        tok = (await http.post(base + "/realms/master/protocol/openid-connect/token", data={"grant_type":"password","client_id":"admin-cli","username":"admin","password":os.environ["NEXUS_KEYCLOAK_ADMIN_PASSWORD"]})).json()["access_token"]
        http.headers["Authorization"] = "Bearer " + tok
        users = base + "/admin/realms/nexus-staff/users"
        pw = os.environ["NEXUS_DEMO_USER_PASSWORD"]
        for s in load_fixtures().staff:
            if not s.active: continue
            if (await http.get(users, params={"email": s.work_email, "exact": "true"})).json(): continue
            first, _, last = s.display_name.partition(" ")
            r = await http.post(users, json={"username": s.work_email, "email": s.work_email, "emailVerified": True, "enabled": True, "firstName": first, "lastName": last or first, "requiredActions": ["CONFIGURE_TOTP"], "credentials": [{"type":"password","value":pw,"temporary":False}]})
            r.raise_for_status()
asyncio.run(run())
'@
  $kcB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($kcPy))
  Invoke-Dc run --rm --no-deps -e "NEXUS_KEYCLOAK_ADMIN_PASSWORD=$(Get-EnvValue NEXUS_KEYCLOAK_ADMIN_PASSWORD)" -e "NEXUS_DEMO_USER_PASSWORD=$(Get-EnvValue NEXUS_DEMO_USER_PASSWORD)" control-migrate python -c "import base64; exec(base64.b64decode('$kcB64'))"
}

# 7. Start Control API (only 127.0.0.1:8100 published).
Invoke-Dc up -d --wait control-api
$port = Get-EnvValue NEXUS_CONTROL_PORT; if (-not $port) { $port = "8100" }
Write-Output ("[timing] control-compose:up: {0:N2}s" -f $watch.Elapsed.TotalSeconds)
Write-Output "Nexus Control API ready at http://127.0.0.1:$port/control/api/v1/health"
