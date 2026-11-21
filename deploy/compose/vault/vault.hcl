# Vault for a self-hosted install (NEX-064, D46): server mode, file storage on a named volume, sealed at start.
# The install script initialises it once (keys saved to deploy/compose/.secrets, git-ignored) and unseals it.
# For production, prefer auto-unseal with your KMS/HSM and keep the unseal key off this machine.
storage "file" {
  path = "/vault/file"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = "true" # only reachable inside the Compose network; never publish this port
}

disable_mlock = true
ui            = false
api_addr      = "http://vault:8200"
