"""
Approvals inbox (workflow engine endpoints) + in-app notifications inbox.
"""
import uuid
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import Field

from ..common import db, workflow
from ..common.audit import audit
from ..common.errors import bad_request, forbidden, not_found
from ..common.notify import notify
from ..common.rbac import Ctx, current_ctx, require
from ._base import Model, must, utcnow

router = APIRouter(prefix="/api/v1/approvals", tags=["Workflow & Approvals"])
notifications_router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


async def _effective_perms(conn, ctx: Ctx) -> set[str]:
    return set(ctx.permissions) | await workflow.delegated_permissions(conn, ctx.user_id)


def _can(perms: set[str], permission: str) -> bool:
    return "*" in perms or permission in perms


@router.get("/inbox")
async def inbox(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        perms = await _effective_perms(conn, ctx)
        rows = await db.fetch_all(conn, """
            SELECT wi.id, wi.type, wi.title, wi.summary, wi.entity_type, wi.entity_id, wi.created_at, wi.payload,
                   wi.submitted_by, u.name AS submitted_by_name, wd.name AS workflow_name,
                   ws.step_no, ws.label AS step_label, ws.approver_permission, ws.due_at, ws.escalated_at,
                   (SELECT count(*) FROM workflow_steps x WHERE x.instance_id = wi.id) AS total_steps,
                   EXISTS (SELECT 1 FROM workflow_steps x WHERE x.instance_id = wi.id AND x.decided_by = $1) AS already_signed
            FROM workflow_instances wi
            JOIN workflow_steps ws ON ws.instance_id = wi.id AND ws.status = 'pending'
            LEFT JOIN users u ON u.id = wi.submitted_by
            LEFT JOIN workflow_definitions wd ON wd.type = wi.type
            WHERE wi.status = 'pending' AND wi.deleted_at IS NULL AND (wi.submitted_by IS NULL OR wi.submitted_by <> $1)
            ORDER BY ws.due_at NULLS LAST, wi.created_at""", ctx.user_id)
    now = utcnow()
    items = [dict(r, overdue=bool(r["due_at"] and r["due_at"] < now)) for r in rows
             if _can(perms, r["approver_permission"]) and not r["already_signed"]]
    return {"items": items, "count": len(items)}


@router.get("/mine")
async def my_requests(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """
            SELECT wi.id, wi.type, wi.title, wi.summary, wi.status, wi.current_step, wi.created_at, wi.decided_at,
                   wd.name AS workflow_name,
                   (SELECT label FROM workflow_steps ws WHERE ws.instance_id = wi.id AND ws.status = 'pending' LIMIT 1) AS waiting_on
            FROM workflow_instances wi LEFT JOIN workflow_definitions wd ON wd.type = wi.type
            WHERE wi.submitted_by = $1 AND wi.deleted_at IS NULL ORDER BY wi.created_at DESC LIMIT 100""", ctx.user_id)


@router.get("/history")
async def decided_by_me(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """
            SELECT wi.id, wi.type, wi.title, wi.status, ws.status AS my_decision, ws.comment, ws.decided_at,
                   u.name AS submitted_by_name, wd.name AS workflow_name
            FROM workflow_steps ws JOIN workflow_instances wi ON wi.id = ws.instance_id
            LEFT JOIN users u ON u.id = wi.submitted_by LEFT JOIN workflow_definitions wd ON wd.type = wi.type
            WHERE ws.decided_by = $1 ORDER BY ws.decided_at DESC LIMIT 100""", ctx.user_id)


@router.get("/definitions")
async def definitions(ctx: Ctx = Depends(require("platform.settings.manage"))):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, "SELECT * FROM workflow_definitions WHERE deleted_at IS NULL ORDER BY name")


class DefinitionUpdateIn(Model):
    sla_hours: Optional[float] = Field(default=None, gt=0, le=720)
    active: Optional[bool] = None


@router.patch("/definitions/{wf_type}")
async def update_definition(wf_type: str, payload: DefinitionUpdateIn, ctx: Ctx = Depends(require("platform.settings.manage"))):
    async with ctx.tx() as conn:
        before = must(await db.fetch_one(conn, "SELECT * FROM workflow_definitions WHERE type = $1", wf_type), "Workflow")
        after = await db.update(conn, "workflow_definitions", before["id"], {**payload.model_dump(exclude_unset=True),
                                                                             "updated_by": ctx.user_id})
        await audit(conn, ctx, "workflow.definition.updated", "workflow_definition", wf_type, before=before, after=after)
    return after


@router.get("/delegations")
async def delegations(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """
            SELECT d.*, fu.name AS from_name, tu.name AS to_name,
                   (d.revoked_at IS NULL AND now() BETWEEN d.starts_at AND d.ends_at) AS active
            FROM workflow_delegations d JOIN users fu ON fu.id = d.from_user_id JOIN users tu ON tu.id = d.to_user_id
            WHERE (d.from_user_id = $1 OR d.to_user_id = $1) AND d.deleted_at IS NULL ORDER BY d.starts_at DESC""", ctx.user_id)


@router.get("/delegates")
async def delegate_candidates(search: Optional[str] = None, ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """
            SELECT u.id, u.name, u.email, r.name AS role_name FROM users u JOIN roles r ON r.key = u.role_key
            WHERE u.staff_id IS NOT NULL AND u.status = 'active' AND u.id <> $1
              AND ($2::text IS NULL OR u.name ILIKE '%' || $2 || '%') ORDER BY u.name LIMIT 30""", ctx.user_id, search)


class DelegationIn(Model):
    to_user_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    reason: str = Field(min_length=3)


@router.post("/delegations")
async def create_delegation(payload: DelegationIn, ctx: Ctx = Depends(current_ctx)):
    if payload.ends_at <= payload.starts_at:
        raise bad_request("End must be after start")
    if str(payload.to_user_id) == ctx.user_id:
        raise bad_request("You cannot delegate to yourself")
    async with ctx.tx() as conn:
        approval_perms = {s["permission"] for d in await conn.fetch("SELECT steps FROM workflow_definitions") for s in d["steps"]}
        if not any(ctx.has(p) for p in approval_perms):
            raise forbidden("You do not hold any approval authority to delegate")
        delegate = must(await db.fetch_one(conn, "SELECT id, name, staff_id FROM users WHERE id = $1 AND status = 'active'",
                                           payload.to_user_id), "User")
        if not delegate["staff_id"]:
            raise bad_request("Approval authority can only be delegated to staff")
        row = await db.insert(conn, "workflow_delegations", {**payload.model_dump(), "from_user_id": ctx.user_id,
                                                             "created_by": ctx.user_id})
        await audit(conn, ctx, "workflow.delegated", "workflow_delegation", row["id"],
                    after={"to": delegate["name"], "starts_at": payload.starts_at, "ends_at": payload.ends_at})
        await notify(conn, ctx, event_code="workflow.delegated", severity="INFO", user_ids=[payload.to_user_id],
                     title=f"{ctx.name} delegated approval authority to you",
                     body=f"{payload.starts_at:%d %b} – {payload.ends_at:%d %b}: {payload.reason}", link="/approvals",
                     category="workflow")
    return row


@router.post("/delegations/{delegation_id}/revoke")
async def revoke_delegation(delegation_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        updated = await conn.fetchval("""UPDATE workflow_delegations SET revoked_at = now() WHERE id = $1 AND from_user_id = $2
                                         AND revoked_at IS NULL RETURNING id""", delegation_id, ctx.user_id)
        if not updated:
            raise not_found("Active delegation")
        await audit(conn, ctx, "workflow.delegation.revoked", "workflow_delegation", delegation_id)
    return {"status": "revoked"}


@router.get("/{instance_id}")
async def detail(instance_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        instance = await workflow.get_instance(conn, instance_id)
        perms = await _effective_perms(conn, ctx)
    step_perms = {s["approver_permission"] for s in instance["steps"]}
    is_submitter = instance["submitted_by"] and str(instance["submitted_by"]) == ctx.user_id
    if not (is_submitter or any(_can(perms, p) for p in step_perms) or ctx.has("platform.audit.view")):
        raise forbidden("You do not have access to this request")
    pending = next((s for s in instance["steps"] if s["status"] == "pending"), None)
    signed = any(s["decided_by"] and str(s["decided_by"]) == ctx.user_id for s in instance["steps"])
    instance["can_decide"] = bool(pending and instance["status"] == "pending" and not is_submitter and not signed
                                  and _can(perms, pending["approver_permission"]))
    instance["can_withdraw"] = bool(is_submitter and instance["status"] == "pending")
    return instance


class DecisionIn(Model):
    decision: Literal["approve", "reject", "return"]
    comment: Optional[str] = Field(default=None, max_length=1000)


@router.post("/{instance_id}/decide")
async def decide(instance_id: uuid.UUID, payload: DecisionIn, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        return await workflow.decide(conn, ctx, str(instance_id), payload.decision, payload.comment)


@router.post("/{instance_id}/withdraw")
async def withdraw(instance_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        return await workflow.withdraw(conn, ctx, str(instance_id))


# ================================================================== notifications
@notifications_router.get("")
async def my_notifications(unread: bool = False, severity: Optional[str] = None, limit: int = 30, before: Optional[datetime] = None,
                           ctx: Ctx = Depends(current_ctx)):
    limit = max(1, min(limit, 100))
    async with ctx.conn() as conn:
        rows = await db.fetch_all(conn, """
            SELECT n.id, n.event_code, n.severity, n.category, n.title, n.body, n.link, n.entity_type, n.entity_id,
                   n.read_at, n.acknowledged_at, n.created_at,
                   (SELECT json_agg(json_build_object('channel', d.channel, 'status', d.status, 'response', d.provider_response))
                      FROM notification_deliveries d WHERE d.notification_id = n.id) AS deliveries
            FROM notifications n
            WHERE n.user_id = $1 AND ($2 = false OR n.read_at IS NULL) AND ($3::text IS NULL OR n.severity = $3)
              AND ($4::timestamptz IS NULL OR n.created_at < $4)
            ORDER BY n.created_at DESC LIMIT """ + str(limit), ctx.user_id, unread, severity, before)
        counts = await db.fetch_one(conn, """
            SELECT count(*) FILTER (WHERE read_at IS NULL) AS unread,
                   count(*) FILTER (WHERE read_at IS NULL AND severity = 'CRITICAL') AS critical,
                   count(*) FILTER (WHERE read_at IS NULL AND severity = 'ACTION') AS action
            FROM notifications WHERE user_id = $1""", ctx.user_id)
    return {"items": rows, **counts}


@notifications_router.get("/unread-count")
async def unread_count(ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        return await db.fetch_one(conn, """
            SELECT count(*) FILTER (WHERE read_at IS NULL) AS unread,
                   count(*) FILTER (WHERE read_at IS NULL AND severity = 'CRITICAL') AS critical
            FROM notifications WHERE user_id = $1""", ctx.user_id)


@notifications_router.post("/{notification_id}/read")
async def mark_read(notification_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        await conn.execute("UPDATE notifications SET read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2",
                           notification_id, ctx.user_id)
    return {"status": "read"}


@notifications_router.post("/read-all")
async def mark_all_read(ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        await conn.execute("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", ctx.user_id)
    return {"status": "read"}


@notifications_router.post("/{notification_id}/acknowledge")
async def acknowledge(notification_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    async with ctx.tx() as conn:
        row = await db.fetch_one(conn, """UPDATE notifications SET acknowledged_at = now(), read_at = coalesce(read_at, now())
                                          WHERE id = $1 AND user_id = $2 RETURNING id, event_code, severity""",
                                 notification_id, ctx.user_id)
        if not row:
            raise not_found("Notification")
        await audit(conn, ctx, "notification.acknowledged", "notification", notification_id,
                    after={"event_code": row["event_code"], "severity": row["severity"]})
    return {"status": "acknowledged"}
