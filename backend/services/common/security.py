"""
Security primitives.
- Password hashing: PBKDF2-SHA256 with per-user salt.
- JWT access tokens bound to a server-side session (jti) so they can be revoked.
- TOTP (RFC 6238) for MFA, implemented with the standard library.
- Field-level encryption (Fernet) for health / counselling data and MFA secrets.
- HMAC-signed, expiring file download URLs.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

import jwt
from cryptography.fernet import Fernet, InvalidToken

from .config import FIELD_ENCRYPTION_KEY, FILE_URL_SECRET, JWT_SECRET

PBKDF2_ITERATIONS = 120_000


# --- passwords -------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, iterations, salt, digest = stored.split("$")
    except (ValueError, AttributeError):
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations))
    return hmac.compare_digest(candidate.hex(), digest)


def password_problem(password: str) -> str | None:
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        return "Password must contain letters and numbers"
    return None


def temporary_password() -> str:
    return f"Nx-{secrets.token_urlsafe(6)}7"


# --- tokens ----------------------------------------------------------------------
def create_token(*, user_id: str, tenant_slug: str, jti: str, expires_at_ts: int,
                 impersonator_id: str | None = None) -> str:
    payload = {"sub": str(user_id), "tid": tenant_slug, "jti": jti,
               "iat": int(time.time()), "exp": int(expires_at_ts)}
    if impersonator_id:
        payload["imp"] = str(impersonator_id)
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


# --- TOTP ------------------------------------------------------------------------
def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(secret: str, counter: int, digits: int = 6) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    code = (struct.unpack(">I", mac[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(code).zfill(digits)


def totp_now(secret: str) -> str:
    return _hotp(secret, int(time.time() // 30))


def verify_totp(secret: str, code: str | None, window: int = 1) -> bool:
    if not secret or not code or not code.strip().isdigit():
        return False
    counter = int(time.time() // 30)
    return any(hmac.compare_digest(_hotp(secret, counter + d), code.strip())
               for d in range(-window, window + 1))


def otpauth_uri(secret: str, email: str, issuer: str) -> str:
    return (f"otpauth://totp/{quote(issuer)}:{quote(email)}"
            f"?secret={secret}&issuer={quote(issuer)}&digits=6&period=30")


# --- field encryption ---------------------------------------------------------------
def _fernet() -> Fernet:
    key = FIELD_ENCRYPTION_KEY or base64.urlsafe_b64encode(
        hashlib.sha256(f"field-encryption:{JWT_SECRET}".encode()).digest()).decode()
    return Fernet(key.encode())


def encrypt_field(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    return _fernet().encrypt(value.encode()).decode()


def decrypt_field(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None


# --- signed file urls ----------------------------------------------------------------
def sign_file(tenant_slug: str, file_id: str, expires_in: int = 900) -> tuple[int, str]:
    exp = int(time.time()) + expires_in
    sig = hmac.new(FILE_URL_SECRET.encode(), f"{tenant_slug}:{file_id}:{exp}".encode(),
                   hashlib.sha256).hexdigest()
    return exp, sig


def verify_file_signature(tenant_slug: str, file_id: str, exp: int, sig: str) -> bool:
    if int(exp) < time.time():
        return False
    expected = hmac.new(FILE_URL_SECRET.encode(), f"{tenant_slug}:{file_id}:{exp}".encode(),
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


# --- misc ----------------------------------------------------------------------------
def mask(value, keep: int = 2):
    if value in (None, ""):
        return value
    text = str(value)
    return "•" * max(0, len(text) - keep) + text[-keep:]


def generate_api_key() -> tuple[str, str, str]:
    raw = f"nxk_{secrets.token_urlsafe(32)}"
    return raw, raw[:12], hashlib.sha256(raw.encode()).hexdigest()


def webhook_signature(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
