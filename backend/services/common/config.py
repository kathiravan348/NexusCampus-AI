"""
Central configuration.
- Values come from environment variables (backend/.env), with safe local-dev defaults.
- Never import secrets from anywhere else.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# --- Database ---------------------------------------------------------------
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
# Superuser: only used by setup/provisioning (CREATE DATABASE, grants)
DB_ADMIN_USER = os.getenv("DB_ADMIN_USER", "postgres")
DB_ADMIN_PASSWORD = os.getenv("DB_ADMIN_PASSWORD", "postgrespassword")
# Application role: non-superuser so row-level security is enforced
APP_DB_USER = os.getenv("APP_DB_USER", "nexus_app")
APP_DB_PASSWORD = os.getenv("APP_DB_PASSWORD", "nexus_app_password")
# Legacy / compatibility aliases
DB_USER = APP_DB_USER
DB_PASSWORD = APP_DB_PASSWORD

MASTER_DB = os.getenv("MASTER_DB", "nexus_master")
TEMPLATE_DB = os.getenv("TEMPLATE_DB", "nexus_template")
TEMPLATE_TENANT_ID = "00000000-0000-0000-0000-000000000001"
DEMO_TENANT_SLUG = os.getenv("DEMO_TENANT_SLUG", "demo")
DEFAULT_DEMO_DB = os.getenv("DEFAULT_DEMO_DB", "nexus_tenant_demo")

# --- Auth & crypto ------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me-nexuscampus-jwt-secret")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "12"))
IMPERSONATION_MINUTES = int(os.getenv("IMPERSONATION_MINUTES", "30"))
LOGIN_MAX_FAILED = int(os.getenv("LOGIN_MAX_FAILED", "5"))
FIELD_ENCRYPTION_KEY = os.getenv("FIELD_ENCRYPTION_KEY", "")
FILE_URL_SECRET = os.getenv("FILE_URL_SECRET", JWT_SECRET)

# --- Runtime ------------------------------------------------------------------
STORAGE_DIR = Path(os.getenv("STORAGE_DIR", str(BASE_DIR / "storage")))
LOG_DIR = Path(os.getenv("LOG_DIR", str(BASE_DIR / "logs")))
PUBLIC_API_BASE = os.getenv("PUBLIC_API_BASE", "http://localhost:8000")
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if o.strip()]
SCHEDULER_ENABLED = _bool("SCHEDULER_ENABLED", True)
SCHEDULER_INTERVAL_SECONDS = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "60"))
DEMO_MODE = _bool("DEMO_MODE", True)
AI_ENABLED = _bool("AI_ENABLED", False)

# --- External providers (empty = not configured; deliveries recorded as skipped) ---
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "")
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "")
PAYMENT_GATEWAY = os.getenv("PAYMENT_GATEWAY", "sandbox")
