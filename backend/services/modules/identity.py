"""
M02 Identity & Security (Build Spec §3.1, §5.2; PRD M02).
- Login (password + optional TOTP MFA), lockout after repeated failures, rate limiting.
- Server-side sessions (revocable), password change/reset, consent capture/withdraw.
- Admin: users (deactivate, never delete), custom roles from the fixed catalog, role assignment,
  time-boxed impersonation with mandatory reason, PII unmask logging.
"""
import time
import uuid
from collections import deque
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import Field

from ..common import db, recipients, tenancy
from ..common.audit import audit
from ..common.config import DEMO_MODE, IMPERSONATION_MINUTES, JWT_EXPIRATION_HOURS, LOGIN_MAX_FAILED
from ..common.errors import AppError, bad_request, conflict, forbidden, not_found
from ..common.notify import CATEGORIES, MANDATORY_CATEGORIES, SEVERITY_CHANNELS, notify
from ..common.rbac import ALL_PERMISSIONS, PERMISSION_CATALOG, Ctx, current_ctx, require
from ..common.security import (create_token, decrypt_field, encrypt_field, hash_password, mask, new_totp_secret,
                               otpauth_uri, password_problem, temporary_password, verify_password, verify_totp)
from ._base import Model, Where, institution, must, paged, utcnow

router = APIRouter(prefix="/api/v1", tags=["M02 Identity & Security"])

POLICIES = [
    {"code": "data_processing", "version": "2026.1", "title": "Student data processing",
     "scope": "Processing of academic, attendance and financial records for education delivery"},
    {"code": "media_consent", "version": "2026.1", "title": "Photos & media",
     "scope": "Use of photos/videos in institutional communications"},
    {"code": "messaging", "version": "2026.1", "title": "SMS & WhatsApp notices",
     "scope": "Receiving operational notices on SMS/WhatsApp"},
]
CHANNELS = ["in_app", "email", "sms"]
_attempts: dict[str, deque] = {}


class _AnonCtx:
    user_id = None
    role = "anonymous"
    impersonator_id = None
    source = "manual"
    name = "Anonymous"

    def __init__(self, request: Request):
        self.ip = request.client.host if request.client else None
        self.device = (request.headers.get("user-agent") or "")[:200]
        self.request_id = getattr(request.state, "request_id", None)


def _rate_limited(key: str, limit: int = 20, window: int = 60) -> bool:
    now = time.time()
    bucket = _attempts.setdefault(key, deque())
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    bucket.append(now)
    return len(bucket) > limit


async def build_profile(conn, user_id, tenant: dict, impersonator_id=None) -> dict:
    user = must(await db.fetch_one(conn, """
        SELECT u.id, u.name, u.email, u.phone, u.role_key, u.staff_id, u.student_id, u.guardian_id, u.mfa_enabled,
               u.last_login_at, r.name AS role_name, r.permissions, st.designation, d.name AS department_name
        FROM users u JOIN roles r ON r.key = u.role_key
        LEFT JOIN staff st ON st.id = u.staff_id LEFT JOIN departments d ON d.id = st.department_id
        WHERE u.id = $1""", user_id), "User")
    perms = user["permissions"] or []
    effective = sorted(ALL_PERMISSIONS | {"*"}) if "*" in perms else sorted(perms)
    linked_sql = """SELECT s.id, s.name, s.roll_no, s.current_semester, s.status, p.name AS programme_name, s.photo_url
                    FROM students s LEFT JOIN programmes p ON p.id = s.programme_id WHERE {cond} ORDER BY s.name"""
    if user["guardian_id"]:
        linked = await db.fetch_all(conn, linked_sql.format(cond="""s.id IN (SELECT student_id FROM guardian_student_links
                                    WHERE guardian_id = $1 AND status = 'active' AND deleted_at IS NULL)"""), user["guardian_id"])
    elif user["student_id"]:
        linked = await db.fetch_all(conn, linked_sql.format(cond="s.id = $1"), user["student_id"])
    else:
        linked = []
    inst = await institution(conn)
    disabled = [r["module_code"] for r in await conn.fetch(
        "SELECT module_code FROM feature_flags WHERE enabled = false AND deleted_at IS NULL")]
    impersonator = None
    if impersonator_id:
        impersonator = await conn.fetchval("SELECT name FROM users WHERE id = $1", impersonator_id)
    return {
        "id": user["id"], "name": user["name"], "email": user["email"], "phone": user["phone"],
        "role": user["role_key"], "role_name": user["role_name"], "permissions": effective,
        "staff_id": user["staff_id"], "student_id": user["student_id"], "guardian_id": user["guardian_id"],
        "designation": user["designation"], "department": user["department_name"], "mfa_enabled": user["mfa_enabled"],
        "last_login_at": user["last_login_at"], "linked_students": linked,
        "tenant": {"slug": tenant["slug"], "name": tenant["name"]},
        "institution": {k: inst.get(k) for k in ("name", "short_code", "logo_url", "primary_color", "secondary_color",
                                                   "currency", "timezone", "attendance_shortage_pct")},
        "disabled_modules": disabled, "impersonator": impersonator,
    }


async def _new_session(conn, user_id, request_meta: _AnonCtx | Ctx, hours: float, *, impersonator_id=None, reason=None):
    jti = uuid.uuid4().hex
    expires = utcnow() + timedelta(hours=hours)
    await conn.execute("""INSERT INTO sessions (user_id, jti, ip, user_agent, expires_at, impersonator_user_id,
                                                impersonation_reason) VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                       user_id, jti, request_meta.ip, request_meta.device, expires, impersonator_id, reason)
    return jti, expires


# ================================================================== public auth
class LoginIn(Model):
    tenant: Optional[str] = Field(default="demo", max_length=40)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)
    otp: Optional[str] = Field(default=None, max_length=10)


@router.get("/auth/tenants")
async def public_tenants():
    return [{"slug": t["slug"], "name": t["name"]} for t in await tenancy.list_tenants(active_only=True)]


@router.get("/auth/demo-accounts")
async def demo_accounts(tenant: str = "demo"):
    if not DEMO_MODE:
        return {"enabled": False, "accounts": []}
    t = await tenancy.get_tenant(tenant)
    if not t or t["status"] != "active":
        return {"enabled": False, "accounts": []}
    async with db.connection(t["db_name"]) as conn:
        rows = await db.fetch_all(conn, """
            SELECT u.email, u.name, u.role_key AS role, r.name AS role_name, u.persona_title AS title,
                   u.persona_description AS description
            FROM users u JOIN roles r ON r.key = u.role_key
            WHERE u.is_demo_persona AND u.status = 'active' AND u.deleted_at IS NULL ORDER BY u.persona_order""")
    return {"enabled": True, "password": "demo123", "accounts": rows}


@router.post("/auth/login")
async def login(payload: LoginIn, request: Request):
    meta = _AnonCtx(request)
    tenant = await tenancy.get_tenant(payload.tenant.strip().lower())
    invalid = AppError(401, "invalid_credentials", "Invalid institution, email or password")
    if not tenant:
        raise invalid
    if tenant["status"] != "active":
        raise AppError(403, "tenant_inactive", f"This institution is {tenant['status']}. Contact support.")
    email = payload.email.strip().lower()
    error: Optional[AppError] = None
    result = None
    async with db.transaction(tenant["db_name"]) as conn:
        if _rate_limited(f"{meta.ip}:{tenant['slug']}"):
            await audit(conn, meta, "security.rate_limit.exceeded", "login", email, after={"ip": meta.ip})
            admins = await recipients.with_permission(conn, "identity.users.manage")
            await notify(conn, meta, event_code="security.rate_limit.exceeded", severity="WARNING", user_ids=admins,
                         title="Sign-in rate limit exceeded", body=f"Repeated attempts from {meta.ip}",
                         category="security", throttle_key=f"ratelimit:{meta.ip}", throttle_hours=1)
            error = AppError(429, "rate_limited", "Too many sign-in attempts. Please wait a minute and try again.")
        else:
            user = await db.fetch_one(conn, """SELECT u.* FROM users u WHERE lower(u.email) = $1 AND u.deleted_at IS NULL""",
                                      email)
            if not user:
                await audit(conn, meta, "auth.login.failed", "user", None, after={"email": email, "reason": "unknown_email"})
                error = invalid
            elif user["locked_until"] and user["locked_until"] > utcnow():
                error = AppError(423, "account_locked", "Account temporarily locked after repeated failed attempts. "
                                                        "Try again in 15 minutes or ask an administrator to unlock it.")
            elif user["status"] != "active":
                await audit(conn, meta, "auth.login.failed", "user", user["id"], after={"reason": "inactive"})
                error = AppError(403, "account_inactive", "This account is inactive")
            elif not verify_password(payload.password, user["password_hash"]):
                failures = user["failed_login_count"] + 1
                locked_until = utcnow() + timedelta(minutes=15) if failures >= LOGIN_MAX_FAILED else None
                await conn.execute("UPDATE users SET failed_login_count = $1, locked_until = $2 WHERE id = $3",
                                   failures, locked_until, user["id"])
                await audit(conn, meta, "auth.login.failed", "user", user["id"], after={"reason": "bad_password",
                                                                                         "failures": failures})
                if failures >= LOGIN_MAX_FAILED:
                    admins = await recipients.with_permission(conn, "identity.users.manage")
                    await notify(conn, meta, event_code="auth.login.failed", severity="WARNING",
                                 user_ids=[user["id"], *admins], title="Repeated failed sign-in attempts",
                                 body=f"{failures} failed attempts for {user['email']}; account locked for 15 minutes.",
                                 category="security", entity_type="user", entity_id=user["id"],
                                 throttle_key=f"lockout:{user['id']}", throttle_hours=1)
                error = invalid
            elif user["mfa_enabled"] and not payload.otp:
                error = AppError(401, "mfa_required", "Enter the 6-digit code from your authenticator app")
            elif user["mfa_enabled"] and not verify_totp(decrypt_field(user["mfa_secret_enc"]), payload.otp):
                await audit(conn, meta, "auth.mfa.challenged", "user", user["id"], after={"result": "failed"})
                error = AppError(401, "mfa_invalid", "That authenticator code is not valid")
            else:
                if user["mfa_enabled"]:
                    await audit(conn, meta, "auth.mfa.challenged", "user", user["id"], after={"result": "passed"})
                jti, expires = await _new_session(conn, user["id"], meta, JWT_EXPIRATION_HOURS)
                await conn.execute("""UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
                                      WHERE id = $1""", user["id"])
                meta.user_id = user["id"]
                meta.role = user["role_key"]
                await audit(conn, meta, "auth.login.success", "user", user["id"])
                token = create_token(user_id=user["id"], tenant_slug=tenant["slug"], jti=jti,
                                     expires_at_ts=int(expires.timestamp()))
                result = {"access_token": token, "token_type": "bearer", "expires_at": expires,
                          "user": await build_profile(conn, user["id"], tenant)}
    if error:
        raise error
    return result


# ================================================================== session / account
@router.get("/auth/me")
async def me(ctx: Ctx = Depends(current_ctx)):
    tenant = await tenancy.get_tenant(ctx.tenant_slug)
    async with ctx.conn() as conn:
        return await build_profile(conn, ctx.user_id, tenant, ctx.impersonator_id)


@router.post("/auth/logout")
async def logout(ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        await conn.execute("UPDATE sessions SET revoked_at = now(), revoked_reason = 'logout' WHERE id = $1", ctx.session_id)
        await audit(conn, ctx, "auth.session.revoked", "session", ctx.session_id, after={"reason": "logout"})
    return {"status": "signed_out"}


class PasswordChangeIn(Model):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


@router.post("/auth/password")
async def change_password(payload: PasswordChangeIn, ctx: Ctx = Depends(current_ctx)):
    problem = password_problem(payload.new_password)
    if problem:
        raise bad_request(problem, "weak_password")
    async with ctx.tx() as conn:
        stored = await conn.fetchval("SELECT password_hash FROM users WHERE id = $1", ctx.user_id)
        if not verify_password(payload.current_password, stored):
            raise bad_request("Current password is incorrect", "invalid_password")
        await conn.execute("UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2",
                           hash_password(payload.new_password), ctx.user_id)
        await conn.execute("""UPDATE sessions SET revoked_at = now(), revoked_reason = 'password_changed'
                              WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL""", ctx.user_id, ctx.session_id)
        await audit(conn, ctx, "auth.password.reset", "user", ctx.user_id, after={"by": "self"})
        await notify(conn, ctx, event_code="auth.password.reset", severity="WARNING", user_ids=[ctx.user_id],
                     title="Your password was changed", body="If this wasn't you, contact your administrator immediately.",
                     category="security")
    return {"status": "password_changed"}


@router.post("/auth/mfa/setup")
async def mfa_setup(ctx: Ctx = Depends(current_ctx)):
    secret = new_totp_secret()
    async with ctx.tx() as conn:
        await conn.execute("UPDATE users SET mfa_pending_secret_enc = $1 WHERE id = $2", encrypt_field(secret), ctx.user_id)
    return {"secret": secret, "otpauth_uri": otpauth_uri(secret, ctx.email, ctx.tenant_name)}


class CodeIn(Model):
    code: str = Field(min_length=6, max_length=8)


@router.post("/auth/mfa/enable")
async def mfa_enable(payload: CodeIn, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        pending = decrypt_field(await conn.fetchval("SELECT mfa_pending_secret_enc FROM users WHERE id = $1", ctx.user_id))
        if not pending:
            raise bad_request("Start MFA setup first")
        if not verify_totp(pending, payload.code):
            raise bad_request("That code is not valid. Check your authenticator app's clock and try again.", "mfa_invalid")
        await conn.execute("""UPDATE users SET mfa_enabled = true, mfa_secret_enc = mfa_pending_secret_enc,
                              mfa_pending_secret_enc = NULL WHERE id = $1""", ctx.user_id)
        await audit(conn, ctx, "auth.mfa.enrolled", "user", ctx.user_id)
        await notify(conn, ctx, event_code="auth.mfa.enrolled", severity="INFO", user_ids=[ctx.user_id],
                     title="Two-factor authentication enabled", category="security")
    return {"mfa_enabled": True}


class PasswordConfirmIn(Model):
    password: str


@router.post("/auth/mfa/disable")
async def mfa_disable(payload: PasswordConfirmIn, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        stored = await conn.fetchval("SELECT password_hash FROM users WHERE id = $1", ctx.user_id)
        if not verify_password(payload.password, stored):
            raise bad_request("Password is incorrect", "invalid_password")
        await conn.execute("UPDATE users SET mfa_enabled = false, mfa_secret_enc = NULL WHERE id = $1", ctx.user_id)
        await audit(conn, ctx, "auth.mfa.disabled", "user", ctx.user_id)
        recipients_list = [ctx.user_id]
        if ctx.role in ("admin", "accountant", "super_admin"):
            recipients_list += await recipients.with_permission(conn, "identity.users.manage")
        await notify(conn, ctx, event_code="auth.mfa.disabled", severity="WARNING", user_ids=recipients_list,
                     title=f"Two-factor authentication disabled for {ctx.name}", category="security")
    return {"mfa_enabled": False}


@router.get("/auth/sessions")
async def my_sessions(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        rows = await db.fetch_all(conn, """SELECT id, ip, user_agent, created_at, expires_at, impersonator_user_id
                                           FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
                                           ORDER BY created_at DESC""", ctx.user_id)
    for r in rows:
        r["current"] = str(r["id"]) == ctx.session_id
    return rows


@router.post("/auth/sessions/{session_id}/revoke")
async def revoke_my_session(session_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        updated = await conn.fetchval("""UPDATE sessions SET revoked_at = now(), revoked_reason = 'user_revoked'
                                         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id""",
                                      session_id, ctx.user_id)
        if not updated:
            raise not_found("Session")
        await audit(conn, ctx, "auth.session.revoked", "session", session_id, after={"reason": "user_revoked"})
    return {"status": "revoked"}


# ---------- consent
class ConsentIn(Model):
    policy_code: str
    granted_for: Literal["self", "minor"] = "self"
    subject_student_id: Optional[uuid.UUID] = None


@router.get("/auth/consents")
async def my_consents(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        rows = await db.fetch_all(conn, """SELECT * FROM consent_records WHERE user_id = $1 AND deleted_at IS NULL
                                           ORDER BY granted_at DESC""", ctx.user_id)
    return {"policies": POLICIES, "records": rows}


@router.post("/auth/consents")
async def capture_consent(payload: ConsentIn, ctx: Ctx = Depends(current_ctx)):
    policy = next((p for p in POLICIES if p["code"] == payload.policy_code), None)
    if not policy:
        raise bad_request("Unknown policy")
    if payload.granted_for == "minor":
        if not payload.subject_student_id or str(payload.subject_student_id) not in ctx.linked_student_ids or not ctx.guardian_id:
            raise forbidden("Guardians can only consent for their own linked children")
    async with ctx.tx() as conn:
        row = await db.insert(conn, "consent_records", {
            "user_id": ctx.user_id, "policy_code": policy["code"], "policy_version": policy["version"],
            "scope": policy["scope"], "granted_for": payload.granted_for,
            "subject_student_id": payload.subject_student_id, "created_by": ctx.user_id})
        await audit(conn, ctx, "consent.captured", "consent_record", row["id"],
                    after={"policy": policy["code"], "version": policy["version"], "granted_for": payload.granted_for})
        await notify(conn, ctx, event_code="consent.captured", severity="INFO", user_ids=[ctx.user_id],
                     title=f"Consent recorded: {policy['title']}", category="compliance")
    return row


@router.post("/auth/consents/{consent_id}/withdraw")
async def withdraw_consent(consent_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        row = await db.fetch_one(conn, """UPDATE consent_records SET withdrawn_at = now() WHERE id = $1 AND user_id = $2
                                          AND withdrawn_at IS NULL RETURNING *""", consent_id, ctx.user_id)
        if not row:
            raise not_found("Active consent")
        await audit(conn, ctx, "consent.withdrawn", "consent_record", consent_id, after={"policy": row["policy_code"]})
        await notify(conn, ctx, event_code="consent.withdrawn", severity="INFO", user_ids=[ctx.user_id],
                     title="Consent withdrawn", category="compliance")
    return row


# ---------- notification preferences
class PreferenceItem(Model):
    category: str
    channel: Literal["in_app", "email", "sms"]
    enabled: bool


class PreferencesIn(Model):
    items: list[PreferenceItem]


@router.get("/auth/notification-preferences")
async def get_preferences(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        rows = await conn.fetch("SELECT category, channel, enabled FROM notification_preferences WHERE user_id = $1",
                                ctx.user_id)
    stored = {(r["category"], r["channel"]): r["enabled"] for r in rows}
    return [{"category": c, "mandatory": c in MANDATORY_CATEGORIES,
             "channels": {ch: stored.get((c, ch), True) for ch in CHANNELS}} for c in CATEGORIES]


@router.put("/auth/notification-preferences")
async def set_preferences(payload: PreferencesIn, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        for item in payload.items:
            if item.category not in CATEGORIES:
                raise bad_request(f"Unknown category {item.category}")
            if item.category in MANDATORY_CATEGORIES and not item.enabled:
                raise bad_request(f"'{item.category}' alerts are mandatory and cannot be turned off", "mandatory_category")
            await conn.execute("""INSERT INTO notification_preferences (user_id, category, channel, enabled)
                                  VALUES ($1, $2, $3, $4)
                                  ON CONFLICT (user_id, category, channel) DO UPDATE SET enabled = EXCLUDED.enabled""",
                               ctx.user_id, item.category, item.channel, item.enabled)
        await audit(conn, ctx, "notification.preference.updated", "user", ctx.user_id,
                    after={"changes": [i.model_dump() for i in payload.items]})
    return await get_preferences(ctx)


# ================================================================== administration
class UserCreateIn(Model):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200)
    role_key: str
    phone: Optional[str] = None
    staff_id: Optional[uuid.UUID] = None


class UserUpdateIn(Model):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone: Optional[str] = None
    role_key: Optional[str] = None
    status: Optional[Literal["active", "inactive"]] = None


@router.get("/identity/users")
async def list_users(search: Optional[str] = None, role: Optional[str] = None, status: Optional[str] = None,
                     page: int = 1, page_size: int = 25, ctx: Ctx = Depends(require("identity.users.view", "identity.users.manage"))):
    w = Where("u.deleted_at IS NULL")
    if search:
        w.add("u.name ILIKE {0} OR u.email ILIKE {0}", f"%{search}%")
    if role:
        w.add("u.role_key = {0}", role)
    if status:
        w.add("u.status = {0}", status)
    limit, offset = db.page_args(page, page_size)
    async with ctx.conn() as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM users u WHERE {w.sql()}", *w.args)
        rows = await db.fetch_all(conn, f"""
            SELECT u.id, u.name, u.email, u.phone, u.role_key, r.name AS role_name, u.status, u.mfa_enabled,
                   u.last_login_at, u.locked_until, u.staff_id, u.student_id, u.guardian_id, u.created_at
            FROM users u JOIN roles r ON r.key = u.role_key WHERE {w.sql()}
            ORDER BY u.name LIMIT {limit} OFFSET {offset}""", *w.args)
    return paged(rows, total, page, page_size)


@router.post("/identity/users")
async def create_user(payload: UserCreateIn, ctx: Ctx = Depends(require("identity.users.manage"))):
    password = temporary_password()
    async with ctx.tx() as conn:
        role = await db.fetch_one(conn, "SELECT key, permissions FROM roles WHERE key = $1 AND deleted_at IS NULL",
                                  payload.role_key)
        if not role:
            raise bad_request("Unknown role")
        if "*" in (role["permissions"] or []) and not ctx.has("platform.tenants.manage"):
            raise forbidden("Only platform super admins can grant the super admin role")
        row = await db.insert(conn, "users", {
            "name": payload.name, "email": payload.email.lower(), "password_hash": hash_password(password),
            "role_key": payload.role_key, "phone": payload.phone, "staff_id": payload.staff_id,
            "created_by": ctx.user_id}, returning="id, name, email, role_key, status")
        await audit(conn, ctx, "user.created", "user", row["id"], after={"email": row["email"], "role": row["role_key"]})
        await notify(conn, ctx, event_code="role.assigned", severity="INFO", user_ids=[row["id"]],
                     title="Your account is ready", body="Sign in with the temporary password shared by your administrator.",
                     category="security")
    return {**row, "temporary_password": password}


@router.patch("/identity/users/{user_id}")
async def update_user(user_id: uuid.UUID, payload: UserUpdateIn, ctx: Ctx = Depends(require("identity.users.manage"))):
    data = payload.model_dump(exclude_unset=True)
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "users", user_id, lock=True), "User")
        if "role_key" in data and data["role_key"] != before["role_key"]:
            ctx.require("identity.roles.manage")
            role = await db.fetch_one(conn, "SELECT permissions FROM roles WHERE key = $1 AND deleted_at IS NULL", data["role_key"])
            if not role:
                raise bad_request("Unknown role")
            if "*" in (role["permissions"] or []) and not ctx.has("platform.tenants.manage"):
                raise forbidden("Only platform super admins can grant the super admin role")
        if data.get("status") == "inactive" and str(user_id) == ctx.user_id:
            raise bad_request("You cannot deactivate your own account")
        data["updated_by"] = ctx.user_id
        after = await db.update(conn, "users", user_id, data)
        if "role_key" in data and data["role_key"] != before["role_key"]:
            await audit(conn, ctx, "role.assigned", "user", user_id, before={"role": before["role_key"]},
                        after={"role": data["role_key"]})
            await notify(conn, ctx, event_code="role.assigned", severity="INFO", user_ids=[user_id],
                         title="Your access changed", body=f"Your role is now {data['role_key']}.", category="security")
        if data.get("status") == "inactive" and before["status"] != "inactive":
            await conn.execute("""UPDATE sessions SET revoked_at = now(), revoked_reason = 'deactivated'
                                  WHERE user_id = $1 AND revoked_at IS NULL""", user_id)
            await audit(conn, ctx, "user.deactivated", "user", user_id)
        await audit(conn, ctx, "user.updated", "user", user_id,
                    before={k: before.get(k) for k in data}, after={k: after.get(k) for k in data})
    return {k: after[k] for k in ("id", "name", "email", "phone", "role_key", "status")}


@router.post("/identity/users/{user_id}/reset-password")
async def admin_reset_password(user_id: uuid.UUID, ctx: Ctx = Depends(require("identity.users.manage"))):
    password = temporary_password()
    async with ctx.tx() as conn:
        must(await db.get_row(conn, "users", user_id), "User")
        await conn.execute("""UPDATE users SET password_hash = $1, password_changed_at = now(), failed_login_count = 0,
                              locked_until = NULL WHERE id = $2""", hash_password(password), user_id)
        await conn.execute("""UPDATE sessions SET revoked_at = now(), revoked_reason = 'admin_password_reset'
                              WHERE user_id = $1 AND revoked_at IS NULL""", user_id)
        await audit(conn, ctx, "auth.password.reset", "user", user_id, after={"by": "admin"})
        await notify(conn, ctx, event_code="auth.password.reset", severity="WARNING", user_ids=[user_id],
                     title="Your password was reset by an administrator", category="security")
    return {"temporary_password": password}


@router.post("/identity/users/{user_id}/unlock")
async def unlock_user(user_id: uuid.UUID, ctx: Ctx = Depends(require("identity.users.manage"))):
    async with ctx.tx() as conn:
        must(await db.get_row(conn, "users", user_id), "User")
        await conn.execute("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1", user_id)
        await audit(conn, ctx, "user.unlocked", "user", user_id)
    return {"status": "unlocked"}


@router.post("/identity/users/{user_id}/revoke-sessions")
async def revoke_user_sessions(user_id: uuid.UUID, ctx: Ctx = Depends(require("identity.users.manage"))):
    async with ctx.tx() as conn:
        count = await conn.fetchval("""WITH r AS (UPDATE sessions SET revoked_at = now(), revoked_reason = 'admin_forced'
                                       WHERE user_id = $1 AND revoked_at IS NULL RETURNING 1) SELECT count(*) FROM r""", user_id)
        await audit(conn, ctx, "auth.session.revoked", "user", user_id, after={"reason": "admin_forced", "count": count})
        await notify(conn, ctx, event_code="auth.session.revoked", severity="INFO", user_ids=[user_id],
                     title="You were signed out by an administrator", category="security")
    return {"revoked": count}


# ---------- roles
class RoleIn(Model):
    name: str = Field(min_length=3, max_length=80)
    description: Optional[str] = None
    permissions: list[str]


class RoleUpdateIn(Model):
    name: Optional[str] = Field(default=None, min_length=3, max_length=80)
    description: Optional[str] = None
    permissions: Optional[list[str]] = None


def _validate_permissions(perms: list[str]) -> list[str]:
    unknown = sorted(set(perms) - ALL_PERMISSIONS)
    if unknown:
        raise bad_request(f"Unknown permissions: {', '.join(unknown)}", "unknown_permission")
    if "platform.tenants.manage" in perms:
        raise forbidden("Tenant provisioning cannot be granted to custom roles")
    return sorted(set(perms))


@router.get("/identity/permissions")
async def permission_catalog(_ctx: Ctx = Depends(require("identity.roles.manage", "identity.users.view"))):
    return [{"group": g, "permissions": [{"key": k, "description": v} for k, v in perms.items()]}
            for g, perms in PERMISSION_CATALOG.items()]


@router.get("/identity/roles")
async def list_roles(ctx: Ctx = Depends(require("identity.users.view", "identity.roles.manage", "identity.users.manage"))):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """
            SELECT r.key, r.name, r.description, r.is_system, r.permissions,
                   (SELECT count(*) FROM users u WHERE u.role_key = r.key AND u.status = 'active') AS active_users
            FROM roles r WHERE r.deleted_at IS NULL ORDER BY r.is_system DESC, r.name""")


@router.post("/identity/roles")
async def create_role(payload: RoleIn, ctx: Ctx = Depends(require("identity.roles.manage"))):
    key = "custom_" + "".join(c if c.isalnum() else "_" for c in payload.name.lower()).strip("_")
    async with ctx.tx() as conn:
        if await conn.fetchval("SELECT 1 FROM roles WHERE key = $1", key):
            raise conflict("A role with a similar name already exists")
        row = await db.insert(conn, "roles", {"key": key, "name": payload.name, "description": payload.description,
                                              "is_system": False, "permissions": _validate_permissions(payload.permissions),
                                              "created_by": ctx.user_id})
        await audit(conn, ctx, "role.created", "role", key, after={"name": payload.name, "permissions": row["permissions"]})
    return row


@router.patch("/identity/roles/{role_key}")
async def update_role(role_key: str, payload: RoleUpdateIn, ctx: Ctx = Depends(require("identity.roles.manage"))):
    data = payload.model_dump(exclude_unset=True)
    async with ctx.tx() as conn:
        before = must(await db.fetch_one(conn, "SELECT * FROM roles WHERE key = $1 AND deleted_at IS NULL", role_key), "Role")
        if before["is_system"] and "permissions" in data:
            raise forbidden("System role permissions are managed by the platform. Create a custom role instead.")
        if "permissions" in data:
            data["permissions"] = _validate_permissions(data["permissions"])
        after = await db.update(conn, "roles", before["id"], {**data, "updated_by": ctx.user_id})
        await audit(conn, ctx, "role.updated", "role", role_key, before=before, after=after)
    return after


@router.delete("/identity/roles/{role_key}")
async def delete_role(role_key: str, ctx: Ctx = Depends(require("identity.roles.manage"))):
    async with ctx.tx() as conn:
        role = must(await db.fetch_one(conn, "SELECT * FROM roles WHERE key = $1 AND deleted_at IS NULL", role_key), "Role")
        if role["is_system"]:
            raise forbidden("System roles cannot be deleted")
        if await conn.fetchval("SELECT 1 FROM users WHERE role_key = $1 AND status = 'active' LIMIT 1", role_key):
            raise conflict("This role is assigned to active users. Reassign them first.")
        await conn.execute("UPDATE roles SET deleted_at = now(), updated_by = $1 WHERE id = $2", ctx.user_id, role["id"])
        await audit(conn, ctx, "role.deleted", "role", role_key)
    return {"status": "deleted"}


# ---------- impersonation
class ImpersonateIn(Model):
    user_id: uuid.UUID
    reason: str = Field(min_length=10, max_length=500)


@router.post("/identity/impersonate")
async def impersonate(payload: ImpersonateIn, ctx: Ctx = Depends(require("identity.impersonate"))):
    if ctx.impersonator_id:
        raise bad_request("End the current impersonation first")
    if str(payload.user_id) == ctx.user_id:
        raise bad_request("You cannot impersonate yourself")
    tenant = await tenancy.get_tenant(ctx.tenant_slug)
    async with ctx.tx() as conn:
        target = must(await db.fetch_one(conn, """SELECT u.*, r.permissions FROM users u JOIN roles r ON r.key = u.role_key
                                                  WHERE u.id = $1 AND u.deleted_at IS NULL""", payload.user_id), "User")
        if target["status"] != "active":
            raise bad_request("Only active users can be impersonated")
        if target["role_key"] in ("admin", "super_admin") or "*" in (target["permissions"] or []):
            raise forbidden("Administrators cannot be impersonated")
        jti, expires = await _new_session(conn, target["id"], ctx, IMPERSONATION_MINUTES / 60,
                                          impersonator_id=ctx.user_id, reason=payload.reason)
        await audit(conn, ctx, "identity.impersonation.started", "user", target["id"], reason=payload.reason,
                    after={"target": target["email"], "expires_at": expires})
        await notify(conn, ctx, event_code="identity.impersonation.started", severity="WARNING", user_ids=[target["id"]],
                     title="An administrator accessed your account",
                     body=f"{ctx.name} started a time-boxed support session. Reason: {payload.reason}", category="security")
        token = create_token(user_id=target["id"], tenant_slug=tenant["slug"], jti=jti,
                             expires_at_ts=int(expires.timestamp()), impersonator_id=ctx.user_id)
        profile = await build_profile(conn, target["id"], tenant, ctx.user_id)
    return {"access_token": token, "expires_at": expires, "user": profile}


@router.post("/auth/impersonation/end")
async def end_impersonation(ctx: Ctx = Depends(current_ctx)):
    if not ctx.impersonator_id:
        raise bad_request("This session is not an impersonation session")
    async with ctx.tx() as conn:
        await conn.execute("UPDATE sessions SET revoked_at = now(), revoked_reason = 'impersonation_ended' WHERE id = $1",
                           ctx.session_id)
        await audit(conn, ctx, "identity.impersonation.ended", "user", ctx.user_id)
    return {"status": "ended"}


# ---------- PII unmask
PII_FIELDS = {
    "student": {"table": "students", "fields": {"phone", "email", "dob", "address", "emergency_contact_phone"}},
    "guardian": {"table": "guardians", "fields": {"phone", "email", "address"}},
    "user": {"table": "users", "fields": {"phone", "email"}},
}


class UnmaskIn(Model):
    entity_type: Literal["student", "guardian", "user"]
    entity_id: uuid.UUID
    field: str


@router.post("/identity/pii/unmask")
async def unmask(payload: UnmaskIn, ctx: Ctx = Depends(require("identity.pii.unmask", "sis.students.manage"))):
    spec = PII_FIELDS[payload.entity_type]
    if payload.field not in spec["fields"]:
        raise bad_request("This field cannot be unmasked")
    async with ctx.tx() as conn:
        value = await conn.fetchval(f"SELECT {payload.field} FROM {spec['table']} WHERE id = $1 AND deleted_at IS NULL",
                                    payload.entity_id)
        await audit(conn, ctx, "pii.field.unmasked", payload.entity_type, payload.entity_id, after={"field": payload.field})
        recent = await conn.fetchval("""SELECT count(*) FROM audit_log WHERE event_code = 'pii.field.unmasked'
                                        AND actor_id = $1 AND created_at > now() - interval '10 minutes'""", ctx.user_id)
        if recent >= 15:
            admins = await recipients.with_permission(conn, "identity.users.manage")
            await notify(conn, ctx, event_code="pii.field.unmasked", severity="ACTION", user_ids=admins,
                         title=f"Review: bulk PII access by {ctx.name}", body=f"{recent} fields unmasked in 10 minutes",
                         category="security", throttle_key=f"pii-bulk:{ctx.user_id}", throttle_hours=1)
    return {"field": payload.field, "value": value.isoformat() if isinstance(value, date) else value}


def mask_fields(row: dict, fields: list[str], ctx: Ctx, *, full_access_perms=("sis.students.manage",)) -> dict:
    if ctx.has(*full_access_perms):
        return row
    for f in fields:
        if row.get(f):
            row[f] = mask(row[f], 3)
    row["masked"] = True
    return row


__all__ = ["router", "build_profile", "mask_fields", "SEVERITY_CHANNELS"]
