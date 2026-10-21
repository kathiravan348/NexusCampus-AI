"""
M03 Admissions & Enrolment (PRD M03; Build Spec §6 catalog row expanded).
- Enquiry → application → document verification → shortlist → offer (approval) → acceptance
  → admission fee paid → confirmation (roll number, enrolment, portal accounts, fee invoices).
- Counsellors see assigned leads only; seat over-allotment is blocked and raises a CRITICAL alert.
"""
import uuid
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import Field

from ..common import db, recipients, workflow
from ..common.audit import audit
from ..common.errors import bad_request, conflict, forbidden
from ..common.jobs import job
from ..common.notify import notify
from ..common.rbac import Ctx, module_guard, require
from ._base import Model, Where, current_term, institution, must, paged
from .sis import create_portal_user, create_student_record, enroll_in_current_sections, link_guardian

router = APIRouter(prefix="/api/v1/admissions", tags=["M03 Admissions"], dependencies=[Depends(module_guard("M03"))])
ANY_ADMISSIONS = ("admissions.enquiries.manage", "admissions.applications.manage", "admissions.view_all", "admissions.offers.approve")

APP_TRANSITIONS = {
    "submitted": {"under_review", "rejected"},
    "under_review": {"documents_verified", "rejected", "waitlisted"},
    "documents_verified": {"shortlisted", "waitlisted", "rejected"},
    "waitlisted": {"shortlisted", "rejected"},
    "shortlisted": {"waitlisted", "rejected"},
}


# ================================================================== enquiries
class EnquiryIn(Model):
    name: str = Field(min_length=2)
    email: Optional[str] = None
    phone: Optional[str] = None
    source_channel: Literal["web", "walk_in", "call", "campaign", "referral"] = "web"
    programme_id: Optional[uuid.UUID] = None
    counsellor_user_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class EnquiryUpdateIn(Model):
    stage: Optional[Literal["new", "contacted"]] = None
    notes: Optional[str] = None
    programme_id: Optional[uuid.UUID] = None
    counsellor_user_id: Optional[uuid.UUID] = None


class ReasonIn(Model):
    reason: str = Field(min_length=3)


@router.get("/enquiries")
async def list_enquiries(stage: Optional[str] = None, search: Optional[str] = None, page: int = 1, page_size: int = 50,
                         ctx: Ctx = Depends(require("admissions.enquiries.manage", "admissions.view_all"))):
    w = Where("e.deleted_at IS NULL")
    if not ctx.has("admissions.view_all"):
        w.add("e.counsellor_user_id = {0}", ctx.user_id)
    if stage:
        w.add("e.stage = {0}", stage)
    if search:
        w.add("e.name ILIKE {0} OR e.email ILIKE {0} OR e.phone ILIKE {0}", f"%{search}%")
    limit, offset = db.page_args(page, page_size)
    async with ctx.conn() as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM enquiries e WHERE {w.sql()}", *w.args)
        rows = await db.fetch_all(conn, f"""
            SELECT e.*, p.name AS programme_name, u.name AS counsellor_name,
                   (SELECT a.id FROM applications a WHERE a.enquiry_id = e.id LIMIT 1) AS application_id
            FROM enquiries e LEFT JOIN programmes p ON p.id = e.programme_id LEFT JOIN users u ON u.id = e.counsellor_user_id
            WHERE {w.sql()} ORDER BY e.created_at DESC LIMIT {limit} OFFSET {offset}""", *w.args)
    return paged(rows, total, page, page_size)


@router.post("/enquiries")
async def create_enquiry(payload: EnquiryIn, ctx: Ctx = Depends(require("admissions.enquiries.manage", "admissions.view_all"))):
    data = payload.model_dump()
    if not ctx.has("admissions.view_all"):
        data["counsellor_user_id"] = ctx.user_id
    async with ctx.tx() as conn:
        row = await db.insert(conn, "enquiries", {**data, "enquiry_no": await db.next_code(conn, "enquiry", "ENQ-"),
                                                  "created_by": ctx.user_id})
        await audit(conn, ctx, "enquiry.created", "enquiry", row["id"], after={"name": row["name"], "source": row["source_channel"]})
        if row["counsellor_user_id"] and str(row["counsellor_user_id"]) != ctx.user_id:
            await notify(conn, ctx, event_code="lead.assigned", severity="INFO", user_ids=[row["counsellor_user_id"]],
                         title=f"New enquiry assigned: {row['name']}", link="/admissions", category="general")
    return row


@router.patch("/enquiries/{enquiry_id}")
async def update_enquiry(enquiry_id: uuid.UUID, payload: EnquiryUpdateIn,
                         ctx: Ctx = Depends(require("admissions.enquiries.manage", "admissions.view_all"))):
    data = payload.model_dump(exclude_unset=True)
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "enquiries", enquiry_id, lock=True), "Enquiry")
        if not ctx.has("admissions.view_all"):
            if str(before["counsellor_user_id"]) != ctx.user_id:
                raise forbidden("This enquiry is assigned to another counsellor")
            if "counsellor_user_id" in data:
                raise forbidden("Only the admissions head can reassign enquiries")
        if before["stage"] in ("converted", "lost"):
            raise conflict(f"Enquiry is already {before['stage']}")
        if data.get("stage") == "contacted":
            data["last_contacted_at"] = db_now()
        after = await db.update(conn, "enquiries", enquiry_id, {**data, "updated_by": ctx.user_id})
        if "counsellor_user_id" in data and data["counsellor_user_id"] != before["counsellor_user_id"]:
            await audit(conn, ctx, "lead.assigned", "enquiry", enquiry_id, before={"counsellor": before["counsellor_user_id"]},
                        after={"counsellor": data["counsellor_user_id"]})
            await notify(conn, ctx, event_code="lead.assigned", severity="INFO", user_ids=[data["counsellor_user_id"]],
                         title=f"Enquiry assigned to you: {before['name']}", link="/admissions", category="general")
        await audit(conn, ctx, "enquiry.updated", "enquiry", enquiry_id, before=before, after=after)
    return after


def db_now():
    from ._base import utcnow
    return utcnow()


@router.post("/enquiries/{enquiry_id}/lost")
async def mark_lost(enquiry_id: uuid.UUID, payload: ReasonIn, ctx: Ctx = Depends(require("admissions.enquiries.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "enquiries", enquiry_id, lock=True), "Enquiry")
        if before["stage"] in ("converted", "lost"):
            raise conflict(f"Enquiry is already {before['stage']}")
        await conn.execute("UPDATE enquiries SET stage = 'lost', lost_reason = $1, updated_by = $2 WHERE id = $3",
                           payload.reason, ctx.user_id, enquiry_id)
        await audit(conn, ctx, "enquiry.lost", "enquiry", enquiry_id, reason=payload.reason)
    return {"stage": "lost"}


# ================================================================== applications
class ApplicationIn(Model):
    enquiry_id: Optional[uuid.UUID] = None
    applicant_name: str = Field(min_length=2)
    email: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[Literal["F", "M", "X"]] = None
    programme_id: uuid.UUID
    guardian_name: Optional[str] = None
    guardian_email: Optional[str] = None
    guardian_phone: Optional[str] = None
    prior_score: Optional[float] = Field(default=None, ge=0, le=100)
    quota: Literal["general", "sports", "scholarship", "management"] = "general"


class ApplicationUpdateIn(Model):
    email: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[date] = None
    guardian_name: Optional[str] = None
    guardian_email: Optional[str] = None
    guardian_phone: Optional[str] = None
    prior_score: Optional[float] = Field(default=None, ge=0, le=100)


class TransitionIn(Model):
    to: Literal["under_review", "documents_verified", "shortlisted", "waitlisted", "rejected"]
    reason: Optional[str] = None
    merit_rank: Optional[int] = Field(default=None, ge=1)


class AppDocumentIn(Model):
    doc_type: Literal["previous_marksheet", "id_proof", "photograph", "transfer_certificate", "other"]
    file_id: Optional[uuid.UUID] = None


class VerifyIn(Model):
    status: Literal["verified", "rejected"]
    remarks: Optional[str] = None


class OfferIn(Model):
    quota: Literal["general", "sports", "scholarship", "management"] = "general"
    offer_notes: Optional[str] = None


@router.get("/applications")
async def list_applications(status: Optional[str] = None, programme_id: Optional[uuid.UUID] = None, search: Optional[str] = None,
                            page: int = 1, page_size: int = 50, ctx: Ctx = Depends(require(*ANY_ADMISSIONS))):
    w = Where("a.deleted_at IS NULL")
    if not ctx.has("admissions.view_all", "admissions.offers.approve"):
        w.add("a.enquiry_id IS NULL OR a.enquiry_id IN (SELECT id FROM enquiries WHERE counsellor_user_id = {0})", ctx.user_id)
    if status:
        w.add("a.status = {0}", status)
    if programme_id:
        w.add("a.programme_id = {0}", programme_id)
    if search:
        w.add("a.applicant_name ILIKE {0} OR a.application_no ILIKE {0}", f"%{search}%")
    limit, offset = db.page_args(page, page_size)
    async with ctx.conn() as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM applications a WHERE {w.sql()}", *w.args)
        rows = await db.fetch_all(conn, f"""
            SELECT a.*, p.name AS programme_name,
                   (SELECT count(*) FROM application_documents d WHERE d.application_id = a.id AND d.deleted_at IS NULL) AS documents_total,
                   (SELECT count(*) FROM application_documents d WHERE d.application_id = a.id AND d.status = 'verified') AS documents_verified,
                   (SELECT i.status FROM invoices i JOIN fee_heads h ON h.id = i.fee_head_id
                     WHERE i.student_id = a.student_id AND h.code = 'ADM' ORDER BY i.created_at DESC LIMIT 1) AS admission_fee_status
            FROM applications a JOIN programmes p ON p.id = a.programme_id
            WHERE {w.sql()} ORDER BY a.created_at DESC LIMIT {limit} OFFSET {offset}""", *w.args)
    return paged(rows, total, page, page_size)


@router.get("/applications/{application_id}")
async def application_detail(application_id: uuid.UUID, ctx: Ctx = Depends(require(*ANY_ADMISSIONS))):
    async with ctx.conn() as conn:
        app = must(await db.fetch_one(conn, """SELECT a.*, p.name AS programme_name, p.intake_capacity, e.enquiry_no,
                                                      s.roll_no AS student_roll_no, s.status AS student_status
                                               FROM applications a JOIN programmes p ON p.id = a.programme_id
                                               LEFT JOIN enquiries e ON e.id = a.enquiry_id LEFT JOIN students s ON s.id = a.student_id
                                               WHERE a.id = $1 AND a.deleted_at IS NULL""", application_id), "Application")
        app["documents"] = await db.fetch_all(conn, """SELECT d.*, u.name AS verified_by_name FROM application_documents d
                                                       LEFT JOIN users u ON u.id = d.verified_by WHERE d.application_id = $1
                                                       AND d.deleted_at IS NULL ORDER BY d.created_at""", application_id)
        app["admission_invoice"] = await db.fetch_one(conn, """
            SELECT i.id, i.invoice_no, i.amount, i.paid_amount, i.status, i.due_date FROM invoices i JOIN fee_heads h ON h.id = i.fee_head_id
            WHERE i.student_id = $1 AND h.code = 'ADM' ORDER BY i.created_at DESC LIMIT 1""", app["student_id"]) if app["student_id"] else None
        app["pending_approval"] = await workflow.pending_for_entity(conn, "admission_offer", application_id) or \
            await workflow.pending_for_entity(conn, "admission_withdrawal", application_id)
        app["seats"] = await _seat_usage(conn, app["programme_id"])
    return app


async def _seat_usage(conn, programme_id) -> dict:
    row = await db.fetch_one(conn, """
        SELECT p.intake_capacity,
               (SELECT count(*) FROM applications a WHERE a.programme_id = p.id AND a.status IN ('offered','accepted','confirmed')
                  AND a.created_at > now() - interval '365 days') AS allotted
        FROM programmes p WHERE p.id = $1""", programme_id)
    return {"capacity": row["intake_capacity"], "allotted": row["allotted"], "available": row["intake_capacity"] - row["allotted"]}


@router.post("/applications")
async def create_application(payload: ApplicationIn, ctx: Ctx = Depends(require("admissions.applications.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        if payload.enquiry_id:
            enquiry = must(await db.get_row(conn, "enquiries", payload.enquiry_id, lock=True), "Enquiry")
            if enquiry["stage"] in ("lost", "converted"):
                raise conflict(f"Enquiry is {enquiry['stage']}")
            await conn.execute("UPDATE enquiries SET stage = 'applied', updated_by = $1 WHERE id = $2", ctx.user_id, payload.enquiry_id)
        row = await db.insert(conn, "applications", {**payload.model_dump(), "status": "submitted",
                                                     "application_no": await db.next_code(conn, "application", "APP-"),
                                                     "created_by": ctx.user_id})
        for doc_type in ("previous_marksheet", "id_proof", "photograph"):
            await db.insert(conn, "application_documents", {"application_id": row["id"], "doc_type": doc_type,
                                                            "created_by": ctx.user_id})
        await audit(conn, ctx, "application.submitted", "application", row["id"],
                    after={"application_no": row["application_no"], "applicant": row["applicant_name"]})
    return row


@router.patch("/applications/{application_id}")
async def update_application(application_id: uuid.UUID, payload: ApplicationUpdateIn,
                             ctx: Ctx = Depends(require("admissions.applications.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "applications", application_id, lock=True), "Application")
        if before["status"] in ("confirmed", "withdrawn", "rejected"):
            raise conflict(f"Application is {before['status']}")
        after = await db.update(conn, "applications", application_id, {**payload.model_dump(exclude_unset=True), "updated_by": ctx.user_id})
        await audit(conn, ctx, "application.updated", "application", application_id, before=before, after=after)
    return after


@router.post("/applications/{application_id}/documents")
async def add_application_document(application_id: uuid.UUID, payload: AppDocumentIn,
                                   ctx: Ctx = Depends(require("admissions.applications.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        must(await db.get_row(conn, "applications", application_id), "Application")
        row = await db.insert(conn, "application_documents", {**payload.model_dump(), "application_id": application_id,
                                                              "created_by": ctx.user_id})
        await audit(conn, ctx, "application.document.added", "application", application_id, after={"doc_type": payload.doc_type})
    return row


@router.post("/applications/{application_id}/documents/{document_id}/verify")
async def verify_application_document(application_id: uuid.UUID, document_id: uuid.UUID, payload: VerifyIn,
                                      ctx: Ctx = Depends(require("admissions.applications.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        app = must(await db.get_row(conn, "applications", application_id, lock=True), "Application")
        doc = must(await db.fetch_one(conn, "SELECT * FROM application_documents WHERE id = $1 AND application_id = $2",
                                      document_id, application_id), "Document")
        await conn.execute("""UPDATE application_documents SET status = $1, remarks = $2, verified_by = $3, verified_at = now()
                              WHERE id = $4""", payload.status, payload.remarks, ctx.user_id, document_id)
        await audit(conn, ctx, f"document.{payload.status}", "application", application_id,
                    before={"doc_type": doc["doc_type"], "status": doc["status"]}, after={"status": payload.status},
                    reason=payload.remarks)
        if payload.status == "rejected":
            counsellors = await recipients.with_permission(conn, "admissions.applications.manage")
            await notify(conn, ctx, event_code="document.rejected", severity="WARNING", user_ids=counsellors,
                         title=f"Document rejected for {app['applicant_name']}: {doc['doc_type'].replace('_', ' ')}",
                         body=payload.remarks or "", link=f"/admissions/applications/{application_id}", category="compliance")
        pending = await conn.fetchval("""SELECT count(*) FROM application_documents WHERE application_id = $1
                                         AND status <> 'verified' AND deleted_at IS NULL""", application_id)
        new_status = app["status"]
        if pending == 0 and app["status"] in ("submitted", "under_review"):
            new_status = "documents_verified"
            await conn.execute("UPDATE applications SET status = 'documents_verified' WHERE id = $1", application_id)
            await audit(conn, ctx, "application.status_changed", "application", application_id,
                        before={"status": app["status"]}, after={"status": new_status})
    return {"document_status": payload.status, "application_status": new_status}


@router.post("/applications/{application_id}/transition")
async def transition(application_id: uuid.UUID, payload: TransitionIn,
                     ctx: Ctx = Depends(require("admissions.applications.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        app = must(await db.get_row(conn, "applications", application_id, lock=True), "Application")
        if payload.to not in APP_TRANSITIONS.get(app["status"], set()):
            raise bad_request(f"Cannot move an application from '{app['status']}' to '{payload.to}'", "invalid_transition")
        if payload.to == "documents_verified" and await conn.fetchval(
                "SELECT count(*) FROM application_documents WHERE application_id = $1 AND status <> 'verified'", application_id):
            raise bad_request("All documents must be verified first")
        if payload.to == "rejected" and not payload.reason:
            raise bad_request("A reason is required to reject an application")
        data = {"status": payload.to, "updated_by": ctx.user_id}
        if payload.merit_rank:
            data["merit_rank"] = payload.merit_rank
        if payload.to == "rejected":
            data["rejection_reason"] = payload.reason
        await db.update(conn, "applications", application_id, data)
        await audit(conn, ctx, "application.status_changed", "application", application_id,
                    before={"status": app["status"]}, after={"status": payload.to}, reason=payload.reason)
    return {"status": payload.to}


@router.post("/applications/{application_id}/offer")
async def request_offer(application_id: uuid.UUID, payload: OfferIn,
                        ctx: Ctx = Depends(require("admissions.applications.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        app = must(await db.get_row(conn, "applications", application_id, lock=True), "Application")
        if app["status"] not in ("shortlisted", "waitlisted"):
            raise bad_request("Only shortlisted or waitlisted applicants can receive an offer")
        seats = await _seat_usage(conn, app["programme_id"])
        if seats["available"] <= 0 and payload.quota == "general":
            admins = await recipients.with_permission(conn, "admissions.offers.approve")
            await notify(conn, ctx, event_code="admission.seat.over_allotment", severity="CRITICAL", user_ids=admins,
                         title="Seat over-allotment blocked", body=f"No general seats left for {app['applicant_name']}'s programme",
                         link=f"/admissions/applications/{application_id}", category="compliance",
                         throttle_key=f"seats:{app['programme_id']}", throttle_hours=6)
            raise conflict("No seats available in this programme. Use a quota override (requires approval) or waitlist.",
                           "seats_exhausted")
        await conn.execute("UPDATE applications SET status = 'offer_pending', quota = $1, offer_notes = $2 WHERE id = $3",
                           payload.quota, payload.offer_notes, application_id)
        instance = await workflow.submit(
            conn, ctx, "admission_offer", entity_type="application", entity_id=application_id,
            title=f"Issue admission offer to {app['applicant_name']}" + (f" ({payload.quota} quota override)" if seats["available"] <= 0 else ""),
            summary=payload.offer_notes or f"Quota: {payload.quota}", payload={"quota": payload.quota, "previous_status": app["status"]})
    return instance


async def _offer_approved(conn, ctx, instance, _comment):
    await conn.execute("UPDATE applications SET status = 'offered', offer_issued_at = now() WHERE id = $1", instance["entity_id"])
    app = await db.get_row(conn, "applications", instance["entity_id"])
    await audit(conn, ctx, "offer.issued", "application", instance["entity_id"], after={"quota": app["quota"]})
    counsellors = await recipients.with_permission(conn, "admissions.applications.manage")
    await notify(conn, ctx, event_code="offer.issued", severity="INFO", user_ids=counsellors,
                 title=f"Offer issued: {app['applicant_name']}", body="Record the applicant's acceptance when received.",
                 link=f"/admissions/applications/{instance['entity_id']}", category="general")
    return {"status": "offered"}


async def _offer_rejected(conn, ctx, instance, _comment):
    await conn.execute("UPDATE applications SET status = $1 WHERE id = $2 AND status = 'offer_pending'",
                       instance["payload"].get("previous_status", "shortlisted"), instance["entity_id"])
    return {"status": instance["payload"].get("previous_status", "shortlisted")}


workflow.register("admission_offer", approved=_offer_approved, rejected=_offer_rejected)


@router.post("/applications/{application_id}/accept")
async def record_acceptance(application_id: uuid.UUID, ctx: Ctx = Depends(require("admissions.applications.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        app = must(await db.get_row(conn, "applications", application_id, lock=True), "Application")
        if app["status"] != "offered":
            raise bad_request("Only offered applications can be accepted")
        term = await current_term(conn)
        cohort = int(term["academic_year_name"][:4]) if term else date.today().year
        student = await db.insert(conn, "students", {
            "name": app["applicant_name"], "email": app["email"], "phone": app["phone"], "dob": app["dob"],
            "gender": app["gender"], "programme_id": app["programme_id"], "cohort": cohort, "current_semester": 1,
            "status": "applicant", "created_by": ctx.user_id})
        if app["guardian_name"]:
            await link_guardian(conn, ctx, student["id"], {"name": app["guardian_name"], "email": app["guardian_email"],
                                                           "phone": app["guardian_phone"]},
                                relationship="Guardian", is_emergency_contact=True, create_account=False)
        inst = await institution(conn)
        head = await conn.fetchval("SELECT id FROM fee_heads WHERE code = 'ADM'")
        invoice = await db.insert(conn, "invoices", {
            "invoice_no": await db.next_code(conn, "invoice", "INV-", 6), "student_id": student["id"], "fee_head_id": head,
            "description": "Admission Fee", "amount": inst.get("admission_fee") or 0, "due_date": date.today() + timedelta(days=7),
            "origin_module": "admissions", "created_by": ctx.user_id})
        await conn.execute("UPDATE applications SET status = 'accepted', accepted_at = now(), student_id = $1 WHERE id = $2",
                           student["id"], application_id)
        await audit(conn, ctx, "application.accepted", "application", application_id,
                    after={"student_id": student["id"], "admission_invoice": invoice["invoice_no"]})
        accountants = await recipients.with_permission(conn, "fees.payments.record")
        await notify(conn, ctx, event_code="application.accepted", severity="INFO", user_ids=accountants,
                     title=f"Admission fee due: {app['applicant_name']}", body=f"Invoice {invoice['invoice_no']}",
                     link="/finance", category="financial")
    return {"status": "accepted", "student_id": student["id"], "invoice": invoice}


@router.post("/applications/{application_id}/confirm")
async def confirm_admission(application_id: uuid.UUID, ctx: Ctx = Depends(require("admissions.applications.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        app = must(await db.get_row(conn, "applications", application_id, lock=True), "Application")
        if app["status"] != "accepted" or not app["student_id"]:
            raise bad_request("Only accepted applications can be confirmed")
        unpaid = await conn.fetchval("""SELECT count(*) FROM invoices i JOIN fee_heads h ON h.id = i.fee_head_id
                                        WHERE i.student_id = $1 AND h.code = 'ADM' AND i.status NOT IN ('paid','waived')""",
                                     app["student_id"])
        if unpaid:
            raise conflict("The admission fee has not been paid yet. Record the payment in Fees first.", "admission_fee_unpaid")
        student = await db.get_row(conn, "students", app["student_id"], lock=True)
        programme = await db.fetch_one(conn, "SELECT short_code FROM programmes WHERE id = $1", student["programme_id"])
        roll = await db.next_code(conn, f"roll:{student['cohort']}:{programme['short_code']}",
                                  f"NC{student['cohort'] % 100:02d}{programme['short_code']}", 3)
        await conn.execute("""UPDATE students SET roll_no = $1, status = 'active', admission_date = CURRENT_DATE, updated_by = $2
                              WHERE id = $3""", roll, ctx.user_id, student["id"])
        await db.insert(conn, "student_status_history", {"student_id": student["id"], "from_status": "applicant",
                                                         "to_status": "active", "reason": f"Admission confirmed ({app['application_no']})",
                                                         "effective_date": date.today()})
        enrolled = await enroll_in_current_sections(conn, student["id"], student["programme_id"], 1)
        credentials = []
        cred = await create_portal_user(conn, ctx, email=student["email"], name=student["name"], role="student",
                                        student_id=student["id"], phone=student["phone"])
        if cred:
            credentials.append(cred)
        guardian = await db.fetch_one(conn, """SELECT g.* FROM guardian_student_links l JOIN guardians g ON g.id = l.guardian_id
                                               WHERE l.student_id = $1 AND l.status = 'active' LIMIT 1""", student["id"])
        if guardian:
            cred = await create_portal_user(conn, ctx, email=guardian["email"], name=guardian["name"], role="parent",
                                            guardian_id=guardian["id"], phone=guardian["phone"])
            if cred:
                credentials.append(cred)
        term = await current_term(conn)
        invoices = await conn.fetch("""
            INSERT INTO invoices (invoice_no, student_id, structure_item_id, fee_head_id, description, amount, due_date, created_by)
            SELECT 'INV-' || lpad((nextval_code.v)::text, 6, '0'), $1, i.id, i.fee_head_id, i.description, i.amount,
                   greatest(i.due_date, CURRENT_DATE + 14), $2
            FROM fee_structures fs JOIN fee_structure_items i ON i.structure_id = fs.id AND i.deleted_at IS NULL
            CROSS JOIN LATERAL (SELECT 0 AS v) nextval_code
            WHERE fs.status = 'assigned' AND fs.programme_id = $3 AND fs.academic_year_id = $4 AND i.due_date >= CURRENT_DATE - 60
              AND false
            RETURNING id""", student["id"], ctx.user_id, student["programme_id"], term["academic_year_id"] if term else None)
        created = 0
        items = await db.fetch_all(conn, """SELECT i.* FROM fee_structures fs JOIN fee_structure_items i ON i.structure_id = fs.id
                                            WHERE fs.status = 'assigned' AND fs.programme_id = $1 AND fs.academic_year_id = $2
                                              AND i.deleted_at IS NULL AND fs.deleted_at IS NULL""",
                                   student["programme_id"], term["academic_year_id"] if term else None)
        for item in items:
            await db.insert(conn, "invoices", {
                "invoice_no": await db.next_code(conn, "invoice", "INV-", 6), "student_id": student["id"],
                "structure_item_id": item["id"], "fee_head_id": item["fee_head_id"], "description": item["description"],
                "amount": item["amount"], "due_date": max(item["due_date"], date.today() + timedelta(days=14)),
                "created_by": ctx.user_id})
            created += 1
        await conn.execute("UPDATE applications SET status = 'confirmed', confirmed_at = now() WHERE id = $1", application_id)
        if app["enquiry_id"]:
            await conn.execute("UPDATE enquiries SET stage = 'converted' WHERE id = $1", app["enquiry_id"])
        await audit(conn, ctx, "admission.confirmed", "application", application_id,
                    after={"roll_no": roll, "student_id": student["id"], "enrolled_sections": enrolled, "invoices": created + len(invoices)})
        families = await recipients.student_and_guardians(conn, student["id"])
        await notify(conn, ctx, event_code="admission.confirmed", severity="INFO", user_ids=families,
                     title=f"Admission confirmed — welcome, {student['name']}!", body=f"Roll number {roll}", link="/portal",
                     category="general")
    return {"status": "confirmed", "roll_no": roll, "student_id": student["id"], "enrolled_sections": enrolled,
            "fee_invoices_created": created, "portal_credentials": credentials}


@router.post("/applications/{application_id}/withdraw")
async def withdraw_application(application_id: uuid.UUID, payload: ReasonIn,
                               ctx: Ctx = Depends(require("admissions.applications.manage", "admissions.view_all"))):
    async with ctx.tx() as conn:
        app = must(await db.get_row(conn, "applications", application_id, lock=True), "Application")
        if app["status"] in ("withdrawn", "rejected"):
            raise conflict(f"Application is already {app['status']}")
        if app["status"] == "confirmed":
            return await workflow.submit(conn, ctx, "admission_withdrawal", entity_type="application", entity_id=application_id,
                                         title=f"Withdraw confirmed admission: {app['applicant_name']}", summary=payload.reason,
                                         payload={"reason": payload.reason})
        await conn.execute("UPDATE applications SET status = 'withdrawn', rejection_reason = $1 WHERE id = $2",
                           payload.reason, application_id)
        if app["student_id"]:
            await conn.execute("UPDATE students SET status = 'withdrawn' WHERE id = $1 AND status = 'applicant'", app["student_id"])
        await audit(conn, ctx, "application.withdrawn", "application", application_id, reason=payload.reason)
    return {"status": "withdrawn"}


async def _withdrawal_approved(conn, ctx, instance, _comment):
    app = await db.get_row(conn, "applications", instance["entity_id"], lock=True)
    await conn.execute("UPDATE applications SET status = 'withdrawn', rejection_reason = $1 WHERE id = $2",
                       instance["payload"]["reason"], app["id"])
    await conn.execute("UPDATE students SET status = 'withdrawn' WHERE id = $1", app["student_id"])
    await conn.execute("UPDATE enrollments SET status = 'dropped' WHERE student_id = $1", app["student_id"])
    await audit(conn, ctx, "admission.withdrawn", "application", app["id"], reason=instance["payload"]["reason"])
    return {"status": "withdrawn"}


workflow.register("admission_withdrawal", approved=_withdrawal_approved)


@router.get("/funnel")
async def funnel(ctx: Ctx = Depends(require(*ANY_ADMISSIONS))):
    async with ctx.conn() as conn:
        enquiries = await db.fetch_all(conn, "SELECT stage, count(*) AS count FROM enquiries WHERE deleted_at IS NULL GROUP BY stage")
        applications = await db.fetch_all(conn, "SELECT status, count(*) AS count FROM applications WHERE deleted_at IS NULL GROUP BY status")
        programmes = await db.fetch_all(conn, """
            SELECT p.id, p.name, p.intake_capacity,
                   count(a.id) FILTER (WHERE a.status IN ('offered','accepted','confirmed')) AS allotted,
                   count(a.id) FILTER (WHERE a.status = 'confirmed') AS confirmed,
                   count(a.id) AS applications
            FROM programmes p LEFT JOIN applications a ON a.programme_id = p.id AND a.deleted_at IS NULL
            WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.name""")
        sources = await db.fetch_all(conn, """SELECT source_channel, count(*) AS count,
                                                     count(*) FILTER (WHERE stage = 'converted') AS converted
                                              FROM enquiries WHERE deleted_at IS NULL GROUP BY source_channel""")
    return {"enquiries": enquiries, "applications": applications, "programmes": programmes, "sources": sources}


@router.get("/counsellors")
async def counsellors(ctx: Ctx = Depends(require(*ANY_ADMISSIONS))):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """SELECT u.id, u.name FROM users u JOIN roles r ON r.key = u.role_key
                                           WHERE u.status = 'active' AND r.permissions ? 'admissions.enquiries.manage'
                                             AND u.staff_id IS NOT NULL ORDER BY u.name""")


@job("admissions.unassigned_scan", "Unassigned enquiry alerts", 60)
async def unassigned_scan(conn, ctx, _tenant):
    rows = await db.fetch_all(conn, """SELECT id, name FROM enquiries WHERE stage = 'new' AND counsellor_user_id IS NULL
                                       AND created_at < now() - interval '24 hours' AND deleted_at IS NULL""")
    if rows:
        heads = await recipients.with_permission(conn, "admissions.view_all")
        await notify(conn, ctx, event_code="enquiry.unassigned", severity="ACTION", user_ids=heads,
                     title=f"{len(rows)} enquiries unassigned for over 24 hours", body=", ".join(r["name"] for r in rows[:5]),
                     link="/admissions", category="general", throttle_key="enquiries-unassigned", throttle_hours=24)
    return {"unassigned_over_24h": len(rows)}
