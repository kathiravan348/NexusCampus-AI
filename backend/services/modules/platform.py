"""
M01 Platform Core + M27 Integrations (Build Spec §5.1, §3.3, §3.5; PRD M01/M27).
- Institution profile & branding, campuses, departments, academic years/terms (close = lock), holidays.
- Feature flags (module licensing; beyond-plan needs SUPER_ADMIN approval).
- API keys (shown once), webhooks (signed deliveries, auto-disable on repeated failure).
- Audit trail viewer/export (viewing is itself logged), background jobs, file storage with signed URLs.
"""
import csv
import io
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import Field

from ..common import db, recipients, tenancy, workflow
from ..common.audit import audit
from ..common.config import PUBLIC_API_BASE, STORAGE_DIR
from ..common.errors import AppError, bad_request, conflict, forbidden, not_found
from ..common.jobs import JOBS, job, run_job
from ..common.modules_catalog import CORE_MODULES
from ..common.notify import notify
from ..common.rbac import Ctx, current_ctx, require
from ..common.security import generate_api_key, sign_file, verify_file_signature, webhook_signature
from ._base import Model, Where, institution, must, paged, utcnow

router = APIRouter(prefix="/api/v1/platform", tags=["M01 Platform Core"])
files_router = APIRouter(prefix="/api/v1/files", tags=["Files"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv",
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}


async def _all_staff(conn) -> list[str]:
    return [str(r[0]) for r in await conn.fetch(
        "SELECT id FROM users WHERE staff_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL")]


# ================================================================== institution
class InstitutionIn(Model):
    name: Optional[str] = Field(default=None, min_length=3)
    legal_name: Optional[str] = None
    short_code: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    timezone: Optional[str] = None
    locale: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    secondary_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    domain: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    refund_approval_threshold: Optional[float] = Field(default=None, ge=0)
    fine_waiver_threshold: Optional[float] = Field(default=None, ge=0)
    po_approval_threshold: Optional[float] = Field(default=None, ge=0)
    attendance_cutoff_hour: Optional[int] = Field(default=None, ge=0, le=23)
    attendance_shortage_pct: Optional[float] = Field(default=None, ge=0, le=100)
    attendance_critical_pct: Optional[float] = Field(default=None, ge=0, le=100)
    fee_reminder_interval_days: Optional[int] = Field(default=None, ge=1)
    fee_overdue_warning_days: Optional[int] = Field(default=None, ge=1)
    defaulter_days: Optional[int] = Field(default=None, ge=1)
    library_fine_per_day: Optional[float] = Field(default=None, ge=0)
    library_loan_days: Optional[int] = Field(default=None, ge=1)
    library_max_loans: Optional[int] = Field(default=None, ge=1)
    admission_fee: Optional[float] = Field(default=None, ge=0)


BRANDING_FIELDS = {"logo_url", "primary_color", "secondary_color", "domain", "name"}


@router.get("/institution")
async def get_institution(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        inst = await institution(conn)
    if ctx.has("platform.settings.manage"):
        return inst
    return {k: inst.get(k) for k in ("id", "name", "short_code", "logo_url", "primary_color", "secondary_color",
                                     "currency", "timezone", "contact_email", "contact_phone", "address")}


@router.put("/institution")
async def update_institution(payload: InstitutionIn, ctx: Ctx = Depends(require("platform.settings.manage"))):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise bad_request("Nothing to update")
    async with ctx.tx() as conn:
        before = await institution(conn)
        after = await db.update(conn, "institution", before["id"], {**data, "updated_by": ctx.user_id})
        event = "branding.updated" if BRANDING_FIELDS & set(data) else "institution.updated"
        await audit(conn, ctx, event, "institution", before["id"], before=before, after=after)
    return after


# ================================================================== campuses & departments
class CampusIn(Model):
    code: str = Field(min_length=2, max_length=10)
    name: str = Field(min_length=2)
    address: Optional[str] = None
    city: Optional[str] = None
    is_main: bool = False


class CampusUpdateIn(Model):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    is_main: Optional[bool] = None


@router.get("/campuses")
async def list_campuses(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """
            SELECT c.*, (SELECT count(*) FROM students s WHERE s.campus_id = c.id AND s.status = 'active') AS active_students,
                   (SELECT count(*) FROM staff st WHERE st.campus_id = c.id AND st.status <> 'exited') AS active_staff
            FROM campuses c WHERE c.deleted_at IS NULL ORDER BY c.is_main DESC, c.name""")


@router.post("/campuses")
async def create_campus(payload: CampusIn, ctx: Ctx = Depends(require("platform.settings.manage"))):
    async with ctx.tx() as conn:
        row = await db.insert(conn, "campuses", {**payload.model_dump(), "code": payload.code.upper(), "created_by": ctx.user_id})
        await audit(conn, ctx, "campus.created", "campus", row["id"], after=row)
    return row


@router.patch("/campuses/{campus_id}")
async def update_campus(campus_id: uuid.UUID, payload: CampusUpdateIn, ctx: Ctx = Depends(require("platform.settings.manage"))):
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "campuses", campus_id), "Campus")
        after = await db.update(conn, "campuses", campus_id, {**payload.model_dump(exclude_unset=True), "updated_by": ctx.user_id})
        await audit(conn, ctx, "campus.updated", "campus", campus_id, before=before, after=after)
    return after


@router.post("/campuses/{campus_id}/deactivate")
async def deactivate_campus(campus_id: uuid.UUID, ctx: Ctx = Depends(require("platform.settings.manage"))):
    async with ctx.tx() as conn:
        campus = must(await db.get_row(conn, "campuses", campus_id), "Campus")
        linked = await conn.fetchval("""SELECT (SELECT count(*) FROM students WHERE campus_id = $1 AND status = 'active')
                                             + (SELECT count(*) FROM staff WHERE campus_id = $1 AND status <> 'exited')""", campus_id)
        if linked:
            raise conflict(f"{linked} active students/staff are linked to this campus. Move them first.")
        await conn.execute("UPDATE campuses SET status = 'inactive', deleted_at = now(), updated_by = $1 WHERE id = $2",
                           ctx.user_id, campus_id)
        await audit(conn, ctx, "campus.deactivated", "campus", campus_id, before={"status": campus["status"]},
                    after={"status": "inactive"})
    return {"status": "inactive"}


class DepartmentIn(Model):
    code: str = Field(min_length=2, max_length=10)
    name: str
    head_staff_id: Optional[uuid.UUID] = None


class DepartmentUpdateIn(Model):
    name: Optional[str] = None
    head_staff_id: Optional[uuid.UUID] = None


@router.get("/departments")
async def list_departments(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """
            SELECT d.*, s.name AS head_name,
                   (SELECT count(*) FROM staff st WHERE st.department_id = d.id AND st.status <> 'exited') AS staff_count,
                   (SELECT count(*) FROM programmes p WHERE p.department_id = d.id AND p.status = 'active') AS programme_count
            FROM departments d LEFT JOIN staff s ON s.id = d.head_staff_id
            WHERE d.deleted_at IS NULL ORDER BY d.name""")


@router.post("/departments")
async def create_department(payload: DepartmentIn, ctx: Ctx = Depends(require("platform.settings.manage"))):
    async with ctx.tx() as conn:
        row = await db.insert(conn, "departments", {**payload.model_dump(), "code": payload.code.upper(), "created_by": ctx.user_id})
        await audit(conn, ctx, "department.created", "department", row["id"], after=row)
    return row


@router.patch("/departments/{department_id}")
async def update_department(department_id: uuid.UUID, payload: DepartmentUpdateIn,
                            ctx: Ctx = Depends(require("platform.settings.manage"))):
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "departments", department_id), "Department")
        after = await db.update(conn, "departments", department_id, {**payload.model_dump(exclude_unset=True), "updated_by": ctx.user_id})
        await audit(conn, ctx, "department.updated", "department", department_id, before=before, after=after)
    return after


@router.post("/departments/{department_id}/deactivate")
async def deactivate_department(department_id: uuid.UUID, ctx: Ctx = Depends(require("platform.settings.manage"))):
    async with ctx.tx() as conn:
        must(await db.get_row(conn, "departments", department_id), "Department")
        linked = await conn.fetchval("""SELECT (SELECT count(*) FROM staff WHERE department_id = $1 AND status <> 'exited')
                                             + (SELECT count(*) FROM programmes WHERE department_id = $1 AND status = 'active')""",
                                     department_id)
        if linked:
            raise conflict("Active staff or programmes are linked to this department")
        await conn.execute("UPDATE departments SET status = 'inactive', deleted_at = now() WHERE id = $1", department_id)
        await audit(conn, ctx, "department.deactivated", "department", department_id)
    return {"status": "inactive"}


# ================================================================== academic calendar
class AcademicYearIn(Model):
    name: str = Field(pattern=r"^\d{4}-\d{4}$")
    start_date: date
    end_date: date


class TermIn(Model):
    academic_year_id: uuid.UUID
    name: str
    start_date: date
    end_date: date


class TermUpdateIn(Model):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class CloseYearIn(Model):
    confirm_text: str


class HolidayIn(Model):
    holiday_date: date
    name: str
    kind: Literal["holiday", "exam_break", "event"] = "holiday"


@router.get("/academic-years")
async def list_years(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        years = await db.fetch_all(conn, "SELECT * FROM academic_years WHERE deleted_at IS NULL ORDER BY start_date DESC")
        terms = await db.fetch_all(conn, "SELECT * FROM terms WHERE deleted_at IS NULL ORDER BY start_date")
    for y in years:
        y["terms"] = [t for t in terms if t["academic_year_id"] == y["id"]]
    return years


@router.post("/academic-years")
async def create_year(payload: AcademicYearIn, ctx: Ctx = Depends(require("platform.calendar.manage"))):
    if payload.end_date <= payload.start_date:
        raise bad_request("End date must be after start date")
    async with ctx.tx() as conn:
        row = await db.insert(conn, "academic_years", {**payload.model_dump(), "status": "planned", "created_by": ctx.user_id})
        await audit(conn, ctx, "academic_year.created", "academic_year", row["id"], after=row)
        await notify(conn, ctx, event_code="academic_year.created", severity="INFO", user_ids=await _all_staff(conn),
                     title=f"Academic year {row['name']} created", link="/core/calendar", category="academic")
    return row


@router.post("/academic-years/{year_id}/activate")
async def activate_year(year_id: uuid.UUID, ctx: Ctx = Depends(require("platform.calendar.manage"))):
    async with ctx.tx() as conn:
        year = must(await db.get_row(conn, "academic_years", year_id, lock=True), "Academic year")
        if year["status"] != "planned":
            raise conflict(f"Academic year is {year['status']}")
        if await conn.fetchval("SELECT 1 FROM academic_years WHERE status = 'active' AND deleted_at IS NULL"):
            raise conflict("Close the current active academic year before activating a new one")
        await conn.execute("UPDATE academic_years SET status = 'active', updated_by = $1 WHERE id = $2", ctx.user_id, year_id)
        await audit(conn, ctx, "academic_year.activated", "academic_year", year_id)
    return {"status": "active"}


@router.post("/academic-years/{year_id}/close")
async def close_year(year_id: uuid.UUID, payload: CloseYearIn, ctx: Ctx = Depends(require("platform.calendar.manage"))):
    async with ctx.tx() as conn:
        year = must(await db.get_row(conn, "academic_years", year_id, lock=True), "Academic year")
        if year["status"] == "closed":
            raise conflict("Academic year is already closed")
        if payload.confirm_text.strip() != f"CLOSE {year['name']}":
            raise bad_request(f"Type 'CLOSE {year['name']}' to confirm. This locks grade and attendance edits.",
                              "confirmation_required")
        await conn.execute("UPDATE academic_years SET status = 'closed', closed_at = now(), closed_by = $1 WHERE id = $2",
                           ctx.user_id, year_id)
        await audit(conn, ctx, "academic_year.closed", "academic_year", year_id, before={"status": year["status"]},
                    after={"status": "closed"})
        await notify(conn, ctx, event_code="academic_year.closed", severity="WARNING", user_ids=await _all_staff(conn),
                     title=f"Academic year {year['name']} closed",
                     body=f"Grade and attendance edits for {year['name']} are now locked.", category="academic")
    return {"status": "closed"}


@router.post("/terms")
async def create_term(payload: TermIn, ctx: Ctx = Depends(require("platform.calendar.manage"))):
    async with ctx.tx() as conn:
        year = must(await db.get_row(conn, "academic_years", payload.academic_year_id), "Academic year")
        if year["status"] == "closed":
            raise conflict("Cannot add terms to a closed academic year")
        if not (year["start_date"] <= payload.start_date < payload.end_date <= year["end_date"]):
            raise bad_request("Term dates must fall within the academic year")
        row = await db.insert(conn, "terms", {**payload.model_dump(), "created_by": ctx.user_id})
        await audit(conn, ctx, "term.created", "term", row["id"], after=row)
    return row


@router.patch("/terms/{term_id}")
async def update_term(term_id: uuid.UUID, payload: TermUpdateIn, ctx: Ctx = Depends(require("platform.calendar.manage"))):
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "terms", term_id), "Term")
        if await conn.fetchval("SELECT status = 'closed' FROM academic_years WHERE id = $1", before["academic_year_id"]):
            raise conflict("This term belongs to a closed academic year")
        after = await db.update(conn, "terms", term_id, {**payload.model_dump(exclude_unset=True), "updated_by": ctx.user_id})
        if after["end_date"] <= after["start_date"]:
            raise bad_request("End date must be after start date")
        await audit(conn, ctx, "term.updated", "term", term_id, before=before, after=after)
    return after


@router.get("/holidays")
async def list_holidays(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, "SELECT * FROM holidays WHERE deleted_at IS NULL ORDER BY holiday_date")


@router.post("/holidays")
async def add_holiday(payload: HolidayIn, ctx: Ctx = Depends(require("platform.calendar.manage"))):
    async with ctx.tx() as conn:
        row = await db.insert(conn, "holidays", {**payload.model_dump(), "created_by": ctx.user_id})
        await audit(conn, ctx, "calendar.updated", "holiday", row["id"], after=row)
        users = [str(r[0]) for r in await conn.fetch("SELECT id FROM users WHERE status = 'active' AND deleted_at IS NULL")]
        await notify(conn, ctx, event_code="calendar.updated", severity="INFO", user_ids=users,
                     title=f"Calendar updated: {payload.name} on {payload.holiday_date:%d %b %Y}", category="academic",
                     throttle_key=f"calendar:{payload.holiday_date}", throttle_hours=12)
    return row


@router.delete("/holidays/{holiday_id}")
async def remove_holiday(holiday_id: uuid.UUID, ctx: Ctx = Depends(require("platform.calendar.manage"))):
    async with ctx.tx() as conn:
        row = must(await db.get_row(conn, "holidays", holiday_id), "Holiday")
        await conn.execute("UPDATE holidays SET deleted_at = now(), updated_by = $1 WHERE id = $2", ctx.user_id, holiday_id)
        await audit(conn, ctx, "calendar.updated", "holiday", holiday_id, before=row, after={"removed": True})
    return {"status": "removed"}


# ================================================================== feature flags / licensing
class ModuleToggleIn(Model):
    enabled: bool


@router.get("/modules")
async def list_modules(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        rows = await db.fetch_all(conn, "SELECT module_code, name, portal, kind, enabled, in_plan FROM feature_flags "
                                        "WHERE deleted_at IS NULL ORDER BY module_code")
        pending = {r["entity_id"] for r in await conn.fetch(
            "SELECT entity_id FROM workflow_instances WHERE type = 'module_license' AND status = 'pending'")}
    for r in rows:
        r["license_request_pending"] = r["module_code"] in pending
        r["core"] = r["module_code"] in CORE_MODULES
    return rows


@router.put("/modules/{module_code}")
async def toggle_module(module_code: str, payload: ModuleToggleIn, ctx: Ctx = Depends(require("platform.modules.manage"))):
    code = module_code.upper()
    async with ctx.tx() as conn:
        flag = must(await db.fetch_one(conn, "SELECT * FROM feature_flags WHERE module_code = $1 AND deleted_at IS NULL", code),
                    "Module")
        if not payload.enabled and code in CORE_MODULES:
            raise bad_request("Core modules cannot be disabled")
        if payload.enabled and not flag["in_plan"] and not ctx.has("platform.tenants.manage"):
            instance = await workflow.submit(conn, ctx, "module_license", entity_type="module", entity_id=code,
                                             title=f"Enable {code} {flag['name']} (beyond plan)",
                                             summary="Requires SUPER_ADMIN sign-off", payload={"module_code": code})
            return {"status": "approval_requested", "workflow_instance_id": instance["id"]}
        await conn.execute("UPDATE feature_flags SET enabled = $1, in_plan = in_plan OR $1, updated_by = $2 WHERE id = $3",
                           payload.enabled, ctx.user_id, flag["id"])
        await audit(conn, ctx, "module.enabled" if payload.enabled else "module.disabled", "module", code,
                    before={"enabled": flag["enabled"]}, after={"enabled": payload.enabled})
        admins = await recipients.with_permission(conn, "platform.modules.manage")
        await notify(conn, ctx, event_code="module.enabled" if payload.enabled else "module.disabled", severity="INFO",
                     user_ids=admins, title=f"{code} {flag['name']} {'enabled' if payload.enabled else 'disabled'}",
                     category="system")
    return {"status": "enabled" if payload.enabled else "disabled"}


async def _license_approved(conn, ctx, instance, _comment):
    code = instance["payload"]["module_code"]
    await conn.execute("UPDATE feature_flags SET enabled = true, in_plan = true WHERE module_code = $1", code)
    await audit(conn, ctx, "module.enabled", "module", code, after={"enabled": True, "via": "license_approval"})
    return {"module_code": code, "enabled": True}


workflow.register("module_license", approved=_license_approved)


# ================================================================== API keys & webhooks
class ApiKeyIn(Model):
    name: str = Field(min_length=3)
    scopes: list[str] = []
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=730)


class WebhookIn(Model):
    url: str = Field(pattern=r"^https?://")
    event_codes: list[str] = Field(min_length=1)


class WebhookUpdateIn(Model):
    status: Optional[Literal["active", "disabled"]] = None
    event_codes: Optional[list[str]] = None


@router.get("/api-keys")
async def list_api_keys(ctx: Ctx = Depends(require("platform.integrations.manage"))):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """SELECT id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at
                                           FROM api_keys WHERE deleted_at IS NULL ORDER BY created_at DESC""")


@router.post("/api-keys")
async def create_api_key(payload: ApiKeyIn, ctx: Ctx = Depends(require("platform.integrations.manage"))):
    raw, prefix, digest = generate_api_key()
    async with ctx.tx() as conn:
        row = await db.insert(conn, "api_keys", {
            "name": payload.name, "key_prefix": prefix, "key_hash": digest, "scopes": payload.scopes,
            "expires_at": utcnow() + timedelta(days=payload.expires_in_days) if payload.expires_in_days else None,
            "created_by": ctx.user_id}, returning="id, name, key_prefix, scopes, created_at, expires_at")
        await audit(conn, ctx, "api_key.created", "api_key", row["id"], after={"name": payload.name, "prefix": prefix})
        admins = await recipients.with_permission(conn, "platform.integrations.manage")
        await notify(conn, ctx, event_code="api_key.created", severity="WARNING", user_ids=admins,
                     title=f"New API key created: {payload.name}", body=f"Created by {ctx.name}", category="security")
    return {**row, "api_key": raw, "notice": "Copy this key now. It will not be shown again."}


@router.post("/api-keys/{key_id}/revoke")
async def revoke_api_key(key_id: uuid.UUID, ctx: Ctx = Depends(require("platform.integrations.manage"))):
    async with ctx.tx() as conn:
        updated = await conn.fetchval("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id",
                                      key_id)
        if not updated:
            raise not_found("Active API key")
        await audit(conn, ctx, "api_key.revoked", "api_key", key_id)
    return {"status": "revoked"}


@router.get("/webhooks")
async def list_webhooks(ctx: Ctx = Depends(require("platform.integrations.manage"))):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """
            SELECT w.id, w.url, w.event_codes, w.status, w.failure_count, w.last_delivery_at, w.created_at,
                   (SELECT count(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'delivered') AS delivered,
                   (SELECT count(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed') AS failed,
                   (SELECT count(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'pending') AS pending
            FROM webhooks w WHERE w.deleted_at IS NULL ORDER BY w.created_at DESC""")


@router.post("/webhooks")
async def create_webhook(payload: WebhookIn, ctx: Ctx = Depends(require("platform.integrations.manage"))):
    secret = uuid.uuid4().hex
    async with ctx.tx() as conn:
        row = await db.insert(conn, "webhooks", {"url": payload.url, "event_codes": payload.event_codes, "secret": secret,
                                                 "created_by": ctx.user_id})
        await audit(conn, ctx, "webhook.subscribed", "webhook", row["id"], after={"url": payload.url, "events": payload.event_codes})
    return {**row, "notice": "Use the secret to verify the X-Nexus-Signature header (HMAC-SHA256 of the body)."}


@router.patch("/webhooks/{webhook_id}")
async def update_webhook(webhook_id: uuid.UUID, payload: WebhookUpdateIn, ctx: Ctx = Depends(require("platform.integrations.manage"))):
    data = payload.model_dump(exclude_unset=True)
    if data.get("status") == "active":
        data["failure_count"] = 0
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "webhooks", webhook_id), "Webhook")
        after = await db.update(conn, "webhooks", webhook_id, {**data, "updated_by": ctx.user_id})
        await audit(conn, ctx, "webhook.updated", "webhook", webhook_id, before=before, after=after)
    return after


@router.post("/webhooks/{webhook_id}/test")
async def test_webhook(webhook_id: uuid.UUID, ctx: Ctx = Depends(require("platform.integrations.manage"))):
    async with ctx.tx() as conn:
        must(await db.get_row(conn, "webhooks", webhook_id), "Webhook")
        row = await db.insert(conn, "webhook_deliveries", {
            "webhook_id": webhook_id, "event_code": "webhook.test", "status": "pending", "next_attempt_at": utcnow(),
            "payload": {"event_code": "webhook.test", "tenant": ctx.tenant_slug, "sent_by": ctx.name}})
    return {"status": "queued", "delivery_id": row["id"]}


@router.get("/webhooks/{webhook_id}/deliveries")
async def webhook_deliveries(webhook_id: uuid.UUID, ctx: Ctx = Depends(require("platform.integrations.manage"))):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """SELECT id, event_code, status, attempts, response_code, response_body, created_at,
                                                  next_attempt_at FROM webhook_deliveries WHERE webhook_id = $1
                                           ORDER BY created_at DESC LIMIT 50""", webhook_id)


@job("webhook.dispatch", "Webhook dispatcher", 1)
async def dispatch_webhooks(conn, ctx, _tenant):
    rows = await db.fetch_all(conn, """
        SELECT d.id, d.webhook_id, d.event_code, d.payload, d.attempts, w.url, w.secret, w.failure_count
        FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
        WHERE d.status = 'pending' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now()) AND w.status = 'active'
        ORDER BY d.created_at LIMIT 25""")
    delivered = failed = 0
    async with httpx.AsyncClient(timeout=5) as client:
        for d in rows:
            body = db.dumps(d["payload"]).encode()
            try:
                response = await client.post(d["url"], content=body, headers={
                    "Content-Type": "application/json", "X-Nexus-Event": d["event_code"],
                    "X-Nexus-Signature": webhook_signature(d["secret"], body)})
                ok = 200 <= response.status_code < 300
                code, text = response.status_code, response.text[:500]
            except httpx.HTTPError as exc:
                ok, code, text = False, None, str(exc)[:500]
            attempts = d["attempts"] + 1
            if ok:
                delivered += 1
                await conn.execute("""UPDATE webhook_deliveries SET status = 'delivered', attempts = $1, response_code = $2,
                                      response_body = $3 WHERE id = $4""", attempts, code, text, d["id"])
                await conn.execute("UPDATE webhooks SET failure_count = 0, last_delivery_at = now() WHERE id = $1", d["webhook_id"])
                await audit(conn, ctx, "webhook.delivered", "webhook", d["webhook_id"], after={"event": d["event_code"]})
                continue
            failed += 1
            final = attempts >= 5
            await conn.execute("""UPDATE webhook_deliveries SET status = $1, attempts = $2, response_code = $3, response_body = $4,
                                  next_attempt_at = now() + make_interval(mins => $5) WHERE id = $6""",
                               "failed" if final else "pending", attempts, code, text, 2 ** attempts, d["id"])
            failures = await conn.fetchval("UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = $1 RETURNING failure_count",
                                           d["webhook_id"])
            if failures >= 5:
                await conn.execute("UPDATE webhooks SET status = 'disabled' WHERE id = $1", d["webhook_id"])
                admins = await recipients.with_permission(conn, "platform.integrations.manage")
                await notify(conn, ctx, event_code="webhook.disabled", severity="WARNING", user_ids=admins,
                             title="Webhook disabled after repeated failures", body=d["url"], link="/core/integrations",
                             category="system", throttle_key=f"webhook-disabled:{d['webhook_id']}", throttle_hours=24)
                await audit(conn, ctx, "webhook.disabled", "webhook", d["webhook_id"], after={"failures": failures})
    return {"delivered": delivered, "failed": failed}


@job("workflow.escalation", "Approval SLA escalation", 15)
async def escalate_workflows(conn, ctx, _tenant):
    return {"escalated": await workflow.escalate_overdue(conn, ctx)}


# ================================================================== audit trail
@router.get("/audit")
async def audit_trail(entity_type: Optional[str] = None, entity_id: Optional[str] = None, actor_id: Optional[uuid.UUID] = None,
                      event_code: Optional[str] = None, date_from: Optional[date] = None, date_to: Optional[date] = None,
                      page: int = 1, page_size: int = 50, ctx: Ctx = Depends(require("platform.audit.view"))):
    w = Where()
    if entity_type:
        w.add("a.entity_type = {0}", entity_type)
    if entity_id:
        w.add("a.entity_id = {0}", entity_id)
    if actor_id:
        w.add("a.actor_id = {0}", actor_id)
    if event_code:
        w.add("a.event_code ILIKE {0}", f"{event_code}%")
    if date_from:
        w.add("a.created_at >= {0}", datetime.combine(date_from, datetime.min.time()))
    if date_to:
        w.add("a.created_at < {0}", datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    limit, offset = db.page_args(page, page_size)
    async with ctx.tx() as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM audit_log a WHERE {w.sql()}", *w.args)
        rows = await db.fetch_all(conn, f"""
            SELECT a.*, u.name AS actor_name, iu.name AS impersonator_name FROM audit_log a
            LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN users iu ON iu.id = a.impersonator_id
            WHERE {w.sql()} ORDER BY a.created_at DESC, a.id DESC LIMIT {limit} OFFSET {offset}""", *w.args)
        await audit(conn, ctx, "audit.trail.viewed", entity_type or "audit_log", entity_id,
                    after={"filters": {"event_code": event_code, "actor_id": actor_id, "page": page}})
    return paged(rows, total, page, page_size)


@router.get("/audit/export")
async def export_audit(event_code: Optional[str] = None, date_from: Optional[date] = None, date_to: Optional[date] = None,
                       ctx: Ctx = Depends(require("platform.audit.view"))):
    w = Where()
    if event_code:
        w.add("a.event_code ILIKE {0}", f"{event_code}%")
    if date_from:
        w.add("a.created_at >= {0}", datetime.combine(date_from, datetime.min.time()))
    if date_to:
        w.add("a.created_at < {0}", datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    async with ctx.tx() as conn:
        rows = await conn.fetch(f"""SELECT a.created_at, a.event_code, u.name AS actor, a.actor_role, a.entity_type, a.entity_id,
                                           a.reason, a.ip, a.source, a.before, a.after
                                    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE {w.sql()}
                                    ORDER BY a.created_at DESC LIMIT 10000""", *w.args)
        await audit(conn, ctx, "audit.trail.exported", "audit_log", None, after={"rows": len(rows), "event_code": event_code})
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["timestamp", "event_code", "actor", "role", "entity_type", "entity_id", "reason", "ip", "source",
                     "before", "after"])
    for r in rows:
        writer.writerow([r["created_at"].isoformat(), r["event_code"], r["actor"] or "system", r["actor_role"],
                         r["entity_type"], r["entity_id"], r["reason"], r["ip"], r["source"],
                         db.dumps(r["before"]) if r["before"] else "", db.dumps(r["after"]) if r["after"] else ""])
    return Response(buffer.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=audit-{ctx.tenant_slug}-{date.today()}.csv"})


# ================================================================== background jobs
@router.get("/jobs")
async def list_jobs(ctx: Ctx = Depends(require("platform.jobs.manage"))):
    async with ctx.conn() as conn:
        last = {r["job_code"]: r for r in await db.fetch_all(conn, """
            SELECT DISTINCT ON (job_code) job_code, status, started_at, finished_at, summary, error
            FROM job_runs ORDER BY job_code, started_at DESC""")}
        recent = await db.fetch_all(conn, "SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 30")
    return {"jobs": [{"code": code, "name": spec["name"], "interval_minutes": spec["interval_minutes"], "last_run": last.get(code)}
                     for code, spec in sorted(JOBS.items())], "recent_runs": recent}


@router.post("/jobs/{job_code}/run")
async def trigger_job(job_code: str, ctx: Ctx = Depends(require("platform.jobs.manage"))):
    if job_code not in JOBS:
        raise not_found("Job")
    tenant = await tenancy.get_tenant(ctx.tenant_slug)
    return await run_job(tenant, job_code, actor=ctx)


# ================================================================== files
@router.post("/files")
async def upload_file(request: Request, file: UploadFile = File(...), category: str = Form("general"),
                      owner_type: Optional[str] = Form(None), owner_id: Optional[str] = Form(None),
                      ctx: Ctx = Depends(current_ctx)):
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_TYPES:
        raise bad_request("Unsupported file type. Upload PDF, image, text, CSV, DOCX or XLSX.", "unsupported_file")
    file_id = uuid.uuid4()
    folder = STORAGE_DIR / ctx.tenant_slug
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / str(file_id)
    size = 0
    with path.open("wb") as out:
        while chunk := await file.read(1024 * 256):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                path.unlink(missing_ok=True)
                raise bad_request("File exceeds the 10 MB limit", "file_too_large")
            out.write(chunk)
    async with ctx.tx() as conn:
        row = await db.insert(conn, "files", {
            "id": file_id, "filename": Path(file.filename or "upload").name[:200], "content_type": content_type,
            "size_bytes": size, "storage_key": f"{ctx.tenant_slug}/{file_id}", "category": category,
            "owner_type": owner_type, "owner_id": owner_id, "uploaded_by": ctx.user_id, "created_by": ctx.user_id})
        await audit(conn, ctx, "file.uploaded", "file", file_id, after={"filename": row["filename"], "category": category})
    exp, sig = sign_file(ctx.tenant_slug, str(file_id))
    return {**row, "url": f"{PUBLIC_API_BASE}/api/v1/files/{ctx.tenant_slug}/{file_id}?exp={exp}&sig={sig}"}


FILE_READ_PERMS = ("platform.settings.manage", "sis.documents.manage", "admissions.applications.manage",
                   "accreditation.manage", "sis.students.manage")


@router.get("/files/{file_id}/link")
async def file_link(file_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        row = must(await db.get_row(conn, "files", file_id), "File")
    if str(row["uploaded_by"]) != ctx.user_id and not ctx.has(*FILE_READ_PERMS):
        raise forbidden("You do not have access to this file")
    exp, sig = sign_file(ctx.tenant_slug, str(file_id))
    return {"url": f"{PUBLIC_API_BASE}/api/v1/files/{ctx.tenant_slug}/{file_id}?exp={exp}&sig={sig}", "expires": exp,
            "filename": row["filename"]}


@files_router.get("/{tenant_slug}/{file_id}")
async def download_file(tenant_slug: str, file_id: uuid.UUID, exp: int = Query(...), sig: str = Query(...)):
    if not verify_file_signature(tenant_slug, str(file_id), exp, sig):
        raise AppError(403, "invalid_signature", "This download link is invalid or has expired")
    tenant = await tenancy.get_tenant(tenant_slug)
    if not tenant or tenant["status"] != "active":
        raise not_found("File")
    async with db.transaction(tenant["db_name"]) as conn:
        row = must(await db.get_row(conn, "files", file_id), "File")
        from ..common.audit import SystemCtx
        await audit(conn, SystemCtx(tenant), "file.downloaded", "file", file_id, after={"filename": row["filename"]})
    path = STORAGE_DIR / row["storage_key"]
    if not path.exists():
        raise not_found("File content")
    return FileResponse(path, media_type=row["content_type"], filename=row["filename"])
