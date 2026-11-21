# OpenBao for a self-hosted install (NEX-066, D48; was HashiCorp Vault in NEX-064): server mode, integrated raft
# storage on a named volume, sealed at start. The install script initialises it once (keys saved to
# deploy/compose/.secrets, git-ignored) and unseals it. For production, prefer auto-unseal with your KMS/HSM and keep
# the unseal key off this machine. Upgrading an install that still runs Vault: see deploy/compose/README.md.
storage "raft" {
  path    = "/openbao/file"
  node_id = "nexus-1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = "true" # only reachable inside the Compose network; never publish this port
}

disable_mlock = true
ui            = false
api_addr      = "http://vault:8200"
cluster_addr  = "http://vault:8201"
