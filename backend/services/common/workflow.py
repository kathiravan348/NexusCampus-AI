"""
Workflow & Approval Engine (Build Spec §3.4).
- WorkflowDefinition: ordered steps, each gated by a permission; SLA per step.
- Four-eyes: submitter can't approve; a user can sign at most one step of an instance.
- Delegation: an active delegation lets the delegate act with the delegator's approval rights.
- Modules register handlers that apply the business effect on final approve / reject.
"""
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional

from . import recipients
from .audit import audit
from .db import fetch_all, fetch_one, insert
from .errors import bad_request, conflict, forbidden, not_found
from .notify import notify

Handler = Callable[..., Awaitable[Optional[dict]]]
HANDLERS: dict[str, dict[str, Optional[Handler]]] = {}


def register(wf_type: str, *, approved: Optional[Handler] = None, rejected: Optional[Handler] = None) -> None:
    HANDLERS[wf_type] = {"approved": approved, "rejected": rejected}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _delegate_ids(conn, user_ids: list[str]) -> list[str]:
    if not user_ids:
        return []
    rows = await conn.fetch(
        """SELECT DISTINCT to_user_id FROM workflow_delegations
           WHERE from_user_id = ANY($1::uuid[]) AND revoked_at IS NULL AND deleted_at IS NULL
             AND now() BETWEEN starts_at AND ends_at""", user_ids)
    return [str(r[0]) for r in rows]


async def approver_ids(conn, permission: str, exclude: list[str]) -> list[str]:
    holders = await recipients.with_permission(conn, permission)
    ids = holders + await _delegate_ids(conn, holders)
    return [i for i in dict.fromkeys(ids) if i not in set(exclude)]


async def has_delegated_permission(conn, user_id: str, permission: str) -> bool:
    return bool(await conn.fetchval(
        """SELECT 1 FROM workflow_delegations d JOIN users u ON u.id = d.from_user_id
           JOIN roles r ON r.key = u.role_key
           WHERE d.to_user_id = $1 AND d.revoked_at IS NULL AND d.deleted_at IS NULL
             AND now() BETWEEN d.starts_at AND d.ends_at AND r.permissions ? $2 LIMIT 1""", user_id, permission))


async def delegated_permissions(conn, user_id: str) -> set[str]:
    rows = await conn.fetch(
        """SELECT r.permissions FROM workflow_delegations d JOIN users u ON u.id = d.from_user_id
           JOIN roles r ON r.key = u.role_key
           WHERE d.to_user_id = $1 AND d.revoked_at IS NULL AND d.deleted_at IS NULL
             AND now() BETWEEN d.starts_at AND d.ends_at""", user_id)
    perms: set[str] = set()
    for r in rows:
        perms.update(r["permissions"] or [])
    return perms


async def _notify_step(conn, ctx, instance: dict, step: dict) -> None:
    exclude = [str(instance["submitted_by"])] if instance.get("submitted_by") else []
    decided = await conn.fetch("SELECT decided_by FROM workflow_steps WHERE instance_id = $1 AND decided_by IS NOT NULL",
                               instance["id"])
    exclude += [str(r[0]) for r in decided]
    users = await approver_ids(conn, step["approver_permission"], exclude)
    await notify(conn, ctx, event_code="workflow.submitted", severity="ACTION", user_ids=users,
                 title=f"Approval needed: {instance['title']}",
                 body=f"Step {step['step_no']} — {step['label']}", link=f"/approvals/{instance['id']}",
                 entity_type="workflow_instance", entity_id=instance["id"], category="workflow")


async def submit(conn, ctx, wf_type: str, *, entity_type: str, entity_id, title: str, summary: str = "",
                 payload: Optional[dict] = None) -> dict:
    definition = await fetch_one(conn, "SELECT * FROM workflow_definitions WHERE type = $1 AND active AND deleted_at IS NULL",
                                 wf_type)
    if not definition:
        raise bad_request(f"Approval workflow '{wf_type}' is not configured")
    if await conn.fetchval("""SELECT 1 FROM workflow_instances WHERE type = $1 AND entity_id = $2 AND status = 'pending'
                              AND deleted_at IS NULL""", wf_type, str(entity_id)):
        raise conflict("An approval request is already pending for this record")
    instance = await insert(conn, "workflow_instances", {
        "type": wf_type, "entity_type": entity_type, "entity_id": str(entity_id), "title": title,
        "summary": summary, "status": "pending", "current_step": 1, "payload": payload or {},
        "submitted_by": ctx.user_id, "created_by": ctx.user_id})
    sla = timedelta(hours=float(definition["sla_hours"] or 24))
    first = None
    for number, step in enumerate(definition["steps"], start=1):
        row = await insert(conn, "workflow_steps", {
            "instance_id": instance["id"], "step_no": number, "label": step["label"],
            "approver_permission": step["permission"], "status": "pending" if number == 1 else "waiting",
            "due_at": _now() + sla if number == 1 else None})
        first = first or row
    await _notify_step(conn, ctx, instance, first)
    await audit(conn, ctx, "workflow.submitted", "workflow_instance", instance["id"],
                after={"type": wf_type, "entity_type": entity_type, "entity_id": str(entity_id), "title": title})
    return instance


async def decide(conn, ctx, instance_id: str, decision: str, comment: Optional[str] = None) -> dict:
    if decision not in ("approve", "reject", "return"):
        raise bad_request("Decision must be approve, reject or return")
    instance = await fetch_one(conn, "SELECT * FROM workflow_instances WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                               instance_id)
    if not instance:
        raise not_found("Approval request")
    if instance["status"] != "pending":
        raise conflict(f"This request is already {instance['status']}")
    step = await fetch_one(conn, """SELECT * FROM workflow_steps WHERE instance_id = $1 AND status = 'pending'
                                    ORDER BY step_no LIMIT 1""", instance_id)
    if not step:
        raise conflict("No pending step")
    permission = step["approver_permission"]
    if not (ctx.has(permission) or await has_delegated_permission(conn, ctx.user_id, permission)):
        raise forbidden("You are not an approver for this step")
    if instance["submitted_by"] and str(instance["submitted_by"]) == ctx.user_id:
        raise forbidden("Four-eyes rule: you cannot approve your own request")
    if await conn.fetchval("SELECT 1 FROM workflow_steps WHERE instance_id = $1 AND decided_by = $2",
                           instance_id, ctx.user_id):
        raise forbidden("Four-eyes rule: a different approver must sign this step")
    if decision != "approve" and not (comment or "").strip():
        raise bad_request("A comment is required when rejecting or returning a request")

    step_status = {"approve": "approved", "reject": "rejected", "return": "returned"}[decision]
    await conn.execute("""UPDATE workflow_steps SET status = $1, decided_by = $2, comment = $3, decided_at = now()
                          WHERE id = $4""", step_status, ctx.user_id, comment, step["id"])
    next_step = await fetch_one(conn, "SELECT * FROM workflow_steps WHERE instance_id = $1 AND step_no = $2",
                                instance_id, step["step_no"] + 1)
    submitter = [str(instance["submitted_by"])] if instance["submitted_by"] else []

    if decision == "approve" and next_step:
        definition = await fetch_one(conn, "SELECT sla_hours FROM workflow_definitions WHERE type = $1", instance["type"])
        due = _now() + timedelta(hours=float((definition or {}).get("sla_hours") or 24))
        await conn.execute("UPDATE workflow_steps SET status = 'pending', due_at = $1 WHERE id = $2", due, next_step["id"])
        await conn.execute("UPDATE workflow_instances SET current_step = $1 WHERE id = $2", next_step["step_no"], instance_id)
        next_step["status"] = "pending"
        await _notify_step(conn, ctx, instance, next_step)
        await notify(conn, ctx, event_code="workflow.decided", severity="INFO", user_ids=submitter,
                     title=f"Step {step['step_no']} approved: {instance['title']}",
                     body=f"Signed by {ctx.name}. Awaiting: {next_step['label']}", link=f"/approvals/{instance_id}",
                     entity_type="workflow_instance", entity_id=instance_id, category="workflow")
        final_status = "pending"
    else:
        final_status = step_status
        handler = HANDLERS.get(instance["type"], {}).get("approved" if decision == "approve" else "rejected")
        result = await handler(conn, ctx, instance, comment) if handler else None
        await conn.execute("""UPDATE workflow_instances SET status = $1, decided_at = now(), result = $2
                              WHERE id = $3""", final_status, result or {}, instance_id)
        await conn.execute("UPDATE workflow_steps SET status = 'skipped' WHERE instance_id = $1 AND status = 'waiting'",
                           instance_id)
        await notify(conn, ctx, event_code="workflow.decided", severity="INFO", user_ids=submitter,
                     title=f"Request {final_status}: {instance['title']}",
                     body=(comment or f"Decided by {ctx.name}"), link=f"/approvals/{instance_id}",
                     entity_type="workflow_instance", entity_id=instance_id, category="workflow")

    await audit(conn, ctx, "workflow.decided", "workflow_instance", instance_id,
                after={"type": instance["type"], "decision": decision, "step": step["step_no"],
                       "status": final_status}, reason=comment)
    return await get_instance(conn, instance_id)


async def withdraw(conn, ctx, instance_id: str) -> dict:
    instance = await fetch_one(conn, "SELECT * FROM workflow_instances WHERE id = $1 FOR UPDATE", instance_id)
    if not instance:
        raise not_found("Approval request")
    if str(instance["submitted_by"]) != ctx.user_id:
        raise forbidden("Only the submitter can withdraw this request")
    if instance["status"] != "pending":
        raise conflict(f"This request is already {instance['status']}")
    await conn.execute("UPDATE workflow_instances SET status = 'withdrawn', decided_at = now() WHERE id = $1", instance_id)
    await conn.execute("UPDATE workflow_steps SET status = 'skipped' WHERE instance_id = $1 AND status IN ('pending','waiting')",
                       instance_id)
    handler = HANDLERS.get(instance["type"], {}).get("rejected")
    if handler:
        await handler(conn, ctx, instance, "Withdrawn by submitter")
    step = await fetch_one(conn, "SELECT approver_permission FROM workflow_steps WHERE instance_id = $1 AND step_no = $2",
                           instance_id, instance["current_step"])
    if step:
        users = await approver_ids(conn, step["approver_permission"], [ctx.user_id])
        await notify(conn, ctx, event_code="workflow.withdrawn", severity="INFO", user_ids=users,
                     title=f"Request withdrawn: {instance['title']}", link=f"/approvals/{instance_id}",
                     entity_type="workflow_instance", entity_id=instance_id, category="workflow")
    await audit(conn, ctx, "workflow.withdrawn", "workflow_instance", instance_id)
    return await get_instance(conn, instance_id)


async def get_instance(conn, instance_id: str) -> dict:
    instance = await fetch_one(conn, """SELECT wi.*, u.name AS submitted_by_name, wd.name AS workflow_name
                                        FROM workflow_instances wi
                                        LEFT JOIN users u ON u.id = wi.submitted_by
                                        LEFT JOIN workflow_definitions wd ON wd.type = wi.type
                                        WHERE wi.id = $1""", instance_id)
    if not instance:
        raise not_found("Approval request")
    instance["steps"] = await fetch_all(conn, """SELECT ws.*, u.name AS decided_by_name FROM workflow_steps ws
                                                 LEFT JOIN users u ON u.id = ws.decided_by
                                                 WHERE ws.instance_id = $1 ORDER BY ws.step_no""", instance_id)
    return instance


async def pending_for_entity(conn, wf_type: str, entity_id) -> Optional[dict]:
    return await fetch_one(conn, """SELECT id, status, title FROM workflow_instances WHERE type = $1 AND entity_id = $2
                                    AND status = 'pending' AND deleted_at IS NULL""", wf_type, str(entity_id))


async def escalate_overdue(conn, ctx) -> int:
    rows = await fetch_all(conn, """SELECT ws.*, wi.title, wi.submitted_by FROM workflow_steps ws
                                    JOIN workflow_instances wi ON wi.id = ws.instance_id
                                    WHERE ws.status = 'pending' AND ws.due_at < now() AND ws.escalated_at IS NULL
                                      AND wi.status = 'pending'""")
    for step in rows:
        approvers = await approver_ids(conn, step["approver_permission"], [str(step["submitted_by"])])
        admins = await recipients.with_permission(conn, "platform.settings.manage")
        await notify(conn, ctx, event_code="workflow.escalated", severity="WARNING", user_ids=admins,
                     title=f"Approval SLA breached: {step['title']}", body=f"Step {step['step_no']} — {step['label']}",
                     link=f"/approvals/{step['instance_id']}", entity_type="workflow_instance",
                     entity_id=step["instance_id"], category="workflow")
        await notify(conn, ctx, event_code="workflow.escalated", severity="ACTION", user_ids=approvers,
                     title=f"Reminder — overdue approval: {step['title']}", link=f"/approvals/{step['instance_id']}",
                     entity_type="workflow_instance", entity_id=step["instance_id"], category="workflow")
        await conn.execute("UPDATE workflow_steps SET escalated_at = now() WHERE id = $1", step["id"])
        await audit(conn, ctx, "workflow.escalated", "workflow_instance", step["instance_id"],
                    after={"step": step["step_no"]})
    return len(rows)


# Default definitions seeded into every tenant (type, name, steps, sla_hours)
DEFAULT_DEFINITIONS = [
    ("student_status_change", "Student status change", [("sis.students.status_approve", "Admin approval")], 48),
    ("student_merge", "Duplicate student merge", [("sis.students.merge", "Admin review before commit")], 48),
    ("admission_offer", "Admission offer letter", [("admissions.offers.approve", "Admissions head sign-off")], 24),
    ("admission_withdrawal", "Withdrawal after confirmation", [("fees.payments.record", "Accountant sign-off")], 48),
    ("syllabus_publish", "Syllabus publication", [("academics.syllabus.approve", "HOD sign-off")], 72),
    ("timetable_publish", "Timetable publication", [("academics.timetable.approve", "Coordinator sign-off")], 48),
    ("attendance_correction", "Post-cutoff attendance correction", [("attendance.corrections.approve", "Admin approval")], 24),
    ("grade_change", "Post-publication grade change", [("grades.change.approve", "Admin approval")], 24),
    ("fee_concession", "Fee concession / scholarship", [("fees.concessions.approve", "Admin approval")], 48),
    ("fee_waiver", "Fee waiver", [("fees.waivers.approve", "Admin approval")], 48),
    ("fee_refund", "Refund above threshold", [("fees.refunds.approve", "Admin sign-off")], 48),
    ("emergency_broadcast", "Emergency broadcast", [("comms.emergency.approve", "Second approver (two-person rule)")], 1),
    ("payroll_lock", "Payroll lock & disbursement",
     [("payroll.runs.approve", "Accountant sign-off"), ("payroll.runs.disburse", "Admin sign-off")], 48),
    ("staff_leave", "Staff leave request", [("hr.leave.approve", "Manager approval")], 48),
    ("module_license", "Module beyond plan", [("platform.tenants.manage", "SUPER_ADMIN sign-off")], 72),
    ("library_fine_waiver", "Library fine waiver above threshold", [("library.waivers.approve", "Admin sign-off")], 48),
    ("hostel_reassignment", "Hostel room reassignment", [("hostel.approve", "Warden approval")], 48),
    ("transport_change", "Mid-term transport change", [("transport.approve", "Transport manager approval")], 48),
    ("purchase_order", "Purchase order above threshold", [("inventory.approve", "Admin approval")], 48),
    ("asset_write_off", "Asset write-off", [("inventory.approve", "Admin sign-off")], 72),
    ("wellbeing_watchlist", "Wellbeing watchlist change", [("wellbeing.watchlist.approve", "Admin sign-off")], 24),
    ("accreditation_filing", "Accreditation submission pack", [("accreditation.approve", "Compliance head sign-off")], 72),
    ("lms_course_publish", "Online course publication", [("lms.courses.approve", "Content review")], 72),
    ("content_publish", "Authoring studio publication", [("content.review", "Reviewer approval")], 72),
]
