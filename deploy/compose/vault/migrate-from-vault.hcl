# One-time conversion of an install's key storage from HashiCorp Vault "file" storage (NEX-064) to the raft storage
# OpenBao uses (NEX-066, D48). Run only through scripts/migrate-vault-to-openbao.{sh,ps1}; it runs Vault's own
# `operator migrate`, so the encrypted data is copied as-is — nothing is decrypted.
storage_source "file" {
  path = "/vault/file"
}

storage_destination "raft" {
  path    = "/vault/raft"
  node_id = "nexus-1"
}

cluster_addr = "http://vault:8201"
