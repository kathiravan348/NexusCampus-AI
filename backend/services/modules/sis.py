"""
M04 Student Information System (Build Spec §5.3; PRD M04).
- Student 360 with role-scoped visibility (teacher: own classes; guardian: linked children only).
- Guardian links with custody/pickup/emergency rights; health records (encrypted, clinic-only edits).
- Status changes and duplicate merges go through approval; records are never hard-deleted.
- Documents wallet (verify / issue certificates), ID cards; compliance alerts job.
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
from ..common.rbac import Ctx, assert_student_access, current_ctx, module_guard, require
from ..common.security import decrypt_field, encrypt_field, hash_password, mask, temporary_password
from ._base import Model, Where, current_term, institution, must, paged

router = APIRouter(prefix="/api/v1/sis", tags=["M04 Student Information"], dependencies=[Depends(module_guard("M04"))])

TRANSITIONS = {
    "applicant": {"withdrawn"},
    "enrolled": {"active", "withdrawn"},
    "active": {"on_leave", "suspended", "withdrawn", "transferred_out", "alumni"},
    "on_leave": {"active", "withdrawn"},
    "suspended": {"active", "withdrawn"},
}
PII_FIELDS = ["phone", "email", "dob", "address", "emergency_contact_phone"]
CERTIFICATES = {"bonafide": "Bonafide Certificate", "transfer_certificate": "Transfer Certificate",
                "character_certificate": "Character Certificate", "transcript": "Official Transcript"}


def _scope(w: Where, ctx: Ctx) -> None:
    if ctx.has("sis.students.view_all"):
        return
    if ctx.staff_id and ctx.has("sis.students.view_class"):
        w.add("""s.id IN (SELECT e.student_id FROM enrollments e JOIN course_sections cs ON cs.id = e.section_id
                 JOIN courses c ON c.id = cs.course_id LEFT JOIN departments d ON d.id = c.department_id
                 WHERE e.deleted_at IS NULL AND (cs.teacher_staff_id = {0} OR d.head_staff_id = {0}))""", ctx.staff_id)
        return
    if ctx.linked_student_ids:
        w.add("s.id = ANY({0}::uuid[])", ctx.linked_student_ids)
        return
    raise forbidden()


def _mask_row(row: dict, ctx: Ctx, family: bool = False) -> dict:
    if ctx.has("sis.students.manage") or family:
        return row
    for f in PII_FIELDS:
        if row.get(f):
            row[f] = mask(row[f].isoformat() if isinstance(row[f], date) else row[f], 3)
    row["masked"] = True
    return row


# ================================================================== helpers reused by admissions
async def enroll_in_current_sections(conn, student_id, programme_id, semester) -> int:
    term = await current_term(conn)
    if not term:
        return 0
    rows = await conn.fetch("""
        INSERT INTO enrollments (section_id, student_id)
        SELECT cs.id, $1 FROM course_sections cs JOIN courses c ON c.id = cs.course_id
        WHERE cs.term_id = $2 AND c.programme_id = $3 AND c.semester = $4 AND cs.status = 'active' AND cs.deleted_at IS NULL
        ON CONFLICT (section_id, student_id) DO UPDATE SET status = 'active' RETURNING id""",
                            student_id, term["id"], programme_id, semester)
    return len(rows)


async def create_portal_user(conn, ctx, *, email: Optional[str], name: str, role: str, student_id=None,
                             guardian_id=None, phone=None) -> Optional[dict]:
    if not email:
        return None
    existing = await conn.fetchval("SELECT id FROM users WHERE lower(email) = lower($1)", email)
    if existing:
        if guardian_id:
            await conn.execute("UPDATE users SET guardian_id = coalesce(guardian_id, $1) WHERE id = $2", guardian_id, existing)
        return {"email": email, "existing_account": True}
    password = temporary_password()
    user = await db.insert(conn, "users", {
        "email": email.lower(), "name": name, "password_hash": hash_password(password), "role_key": role,
        "student_id": student_id, "guardian_id": guardian_id, "phone": phone, "created_by": ctx.user_id}, returning="id")
    await notify(conn, ctx, event_code="student.created", severity="INFO", user_ids=[user["id"]],
                 title="Welcome to the NexusCampus portal", body="Sign in with the temporary password from the admissions office.",
                 link="/portal", category="general")
    return {"email": email.lower(), "role": role, "temporary_password": password}


async def link_guardian(conn, ctx, student_id, guardian: dict, *, relationship: str, has_custody=True, can_pickup=True,
                        is_emergency_contact=True, portal_access=True, create_account=True) -> tuple[dict, Optional[dict]]:
    guardian_id = guardian.get("id")
    if not guardian_id:
        row = await db.insert(conn, "guardians", {k: guardian.get(k) for k in ("name", "email", "phone", "occupation", "address")}
                              | {"created_by": ctx.user_id})
        guardian_id = row["id"]
    link = await db.fetch_one(conn, """
        INSERT INTO guardian_student_links (guardian_id, student_id, relationship, has_custody, can_pickup,
                                            is_emergency_contact, portal_access, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (guardian_id, student_id) DO UPDATE SET status = 'active', relationship = EXCLUDED.relationship,
          has_custody = EXCLUDED.has_custody, can_pickup = EXCLUDED.can_pickup,
          is_emergency_contact = EXCLUDED.is_emergency_contact, portal_access = EXCLUDED.portal_access, deleted_at = NULL
        RETURNING *""", guardian_id, student_id, relationship, has_custody, can_pickup, is_emergency_contact,
                              portal_access, ctx.user_id)
    credentials = None
    if create_account and portal_access:
        g = await db.fetch_one(conn, "SELECT * FROM guardians WHERE id = $1", guardian_id)
        credentials = await create_portal_user(conn, ctx, email=g["email"], name=g["name"], role="parent",
                                               guardian_id=guardian_id, phone=g["phone"])
    return link, credentials


async def create_student_record(conn, ctx, data: dict, *, status: str = "active") -> dict:
    programme = must(await db.fetch_one(conn, "SELECT * FROM programmes WHERE id = $1 AND deleted_at IS NULL",
                                        data["programme_id"]), "Programme")
    cohort = data["cohort"]
    roll = await db.next_code(conn, f"roll:{cohort}:{programme['short_code']}", f"NC{cohort % 100:02d}{programme['short_code']}", 3)
    row = await db.insert(conn, "students", {
        **{k: data.get(k) for k in ("name", "email", "phone", "dob", "gender", "programme_id", "cohort", "current_semester",
                                    "address", "emergency_contact_name", "emergency_contact_phone", "campus_id")},
        "roll_no": roll, "status": status, "admission_date": data.get("admission_date") or date.today(),
        "created_by": ctx.user_id})
    return row


async def student_label(conn, student_id) -> dict:
    return must(await db.fetch_one(conn, """SELECT s.id, s.name, s.roll_no, s.programme_id, s.current_semester, s.status,
                                                   p.name AS programme_name
                                            FROM students s LEFT JOIN programmes p ON p.id = s.programme_id
                                            WHERE s.id = $1 AND s.deleted_at IS NULL""", student_id), "Student")


# ================================================================== list / stats / 360
@router.get("/students")
async def list_students(search: Optional[str] = None, programme_id: Optional[uuid.UUID] = None, status: Optional[str] = None,
                        semester: Optional[int] = None, cohort: Optional[int] = None, fee_status: Optional[str] = None,
                        page: int = 1, page_size: int = 25, ctx: Ctx = Depends(current_ctx)):
    w = Where("s.deleted_at IS NULL", "s.merged_into_id IS NULL")
    _scope(w, ctx)
    if search:
        w.add("s.name ILIKE {0} OR s.roll_no ILIKE {0} OR s.email ILIKE {0}", f"%{search}%")
    if programme_id:
        w.add("s.programme_id = {0}", programme_id)
    if status:
        w.add("s.status = {0}", status)
    else:
        w.add("s.status NOT IN ('applicant', 'enquiry')")
    if semester:
        w.add("s.current_semester = {0}", semester)
    if cohort:
        w.add("s.cohort = {0}", cohort)
    finance_ok = ctx.has("fees.view_all", "sis.students.manage") or bool(ctx.linked_student_ids)
    if fee_status == "overdue" and finance_ok:
        w.add("EXISTS (SELECT 1 FROM invoices i WHERE i.student_id = s.id AND i.status = 'overdue' AND i.deleted_at IS NULL)")
    limit, offset = db.page_args(page, page_size)
    async with ctx.conn() as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM students s WHERE {w.sql()}", *w.args)
        rows = await db.fetch_all(conn, f"""
            SELECT s.id, s.roll_no, s.name, s.email, s.phone, s.gender, s.cohort, s.current_semester, s.section, s.status,
                   s.cgpa, s.photo_url, s.admission_date, p.id AS programme_id, p.name AS programme_name, p.code AS programme_code,
                   COALESCE((SELECT sum(i.amount - i.concession_amount + i.fine_amount - i.paid_amount) FROM invoices i
                             WHERE i.student_id = s.id AND i.status IN ('generated','partially_paid','overdue')
                               AND i.deleted_at IS NULL), 0) AS outstanding,
                   EXISTS (SELECT 1 FROM invoices i WHERE i.student_id = s.id AND i.status = 'overdue' AND i.deleted_at IS NULL) AS has_overdue,
                   (SELECT round(100.0 * count(*) FILTER (WHERE ar.status IN ('present','late','excused')) / NULLIF(count(*), 0), 1)
                      FROM attendance_records ar WHERE ar.student_id = s.id AND ar.deleted_at IS NULL) AS attendance_pct
            FROM students s LEFT JOIN programmes p ON p.id = s.programme_id
            WHERE {w.sql()} ORDER BY s.name LIMIT {limit} OFFSET {offset}""", *w.args)
    for r in rows:
        family = str(r["id"]) in ctx.linked_student_ids
        _mask_row(r, ctx, family)
        if not finance_ok:
            r.pop("outstanding", None)
            r.pop("has_overdue", None)
    return paged(rows, total, page, page_size)


@router.get("/students/stats")
async def student_stats(ctx: Ctx = Depends(require("sis.students.view_all"))):
    async with ctx.conn() as conn:
        totals = await db.fetch_one(conn, """
            SELECT count(*) FILTER (WHERE status = 'active') AS active, count(*) FILTER (WHERE status = 'on_leave') AS on_leave,
                   count(*) FILTER (WHERE status = 'suspended') AS suspended, count(*) FILTER (WHERE status = 'alumni') AS alumni,
                   count(*) FILTER (WHERE status = 'applicant') AS applicants,
                   count(*) FILTER (WHERE status = 'active' AND admission_date >= CURRENT_DATE - 365) AS new_this_year
            FROM students WHERE deleted_at IS NULL AND merged_into_id IS NULL""")
        by_programme = await db.fetch_all(conn, """
            SELECT p.id, p.name, p.intake_capacity, count(s.id) FILTER (WHERE s.status = 'active') AS active
            FROM programmes p LEFT JOIN students s ON s.programme_id = p.id AND s.deleted_at IS NULL
            WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.name""")
        attendance = await conn.fetchval("""SELECT round(100.0 * count(*) FILTER (WHERE status IN ('present','late','excused'))
                                            / NULLIF(count(*), 0), 1) FROM attendance_records WHERE deleted_at IS NULL""")
    return {**totals, "by_programme": by_programme, "attendance_pct": attendance}


@router.get("/students/{student_id}")
async def student_360(student_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    sid = str(student_id)
    async with ctx.tx() as conn:
        await assert_student_access(conn, ctx, sid)
        student = must(await db.fetch_one(conn, """
            SELECT s.*, p.name AS programme_name, p.code AS programme_code, p.duration_years, c.name AS campus_name
            FROM students s LEFT JOIN programmes p ON p.id = s.programme_id LEFT JOIN campuses c ON c.id = s.campus_id
            WHERE s.id = $1 AND s.deleted_at IS NULL""", sid), "Student")
        family = sid in ctx.linked_student_ids
        manage = ctx.has("sis.students.manage")
        finance_ok = manage or family or ctx.has("fees.view_all")
        _mask_row(student, ctx, family)
        guardians = await db.fetch_all(conn, """
            SELECT l.id AS link_id, l.relationship, l.has_custody, l.can_pickup, l.is_emergency_contact, l.portal_access, l.status,
                   g.id AS guardian_id, g.name, g.email, g.phone, g.occupation,
                   EXISTS (SELECT 1 FROM users u WHERE u.guardian_id = g.id AND u.status = 'active') AS has_portal_account
            FROM guardian_student_links l JOIN guardians g ON g.id = l.guardian_id
            WHERE l.student_id = $1 AND l.deleted_at IS NULL ORDER BY l.status, g.name""", sid)
        if not (manage or family):
            for g in guardians:
                g["phone"] = mask(g["phone"], 3)
                g["email"] = mask(g["email"], 6)
        enrollments = await db.fetch_all(conn, """
            SELECT cs.id AS section_id, c.code, c.title, c.credits, st.name AS teacher_name, r.code AS room, gs.status AS grade_status,
                   t.name AS term_name,
                   (SELECT round(100.0 * count(*) FILTER (WHERE ar.status IN ('present','late','excused')) / NULLIF(count(*), 0), 1)
                      FROM attendance_records ar JOIN attendance_sessions ses ON ses.id = ar.session_id
                      WHERE ar.student_id = e.student_id AND ses.section_id = cs.id) AS attendance_pct
            FROM enrollments e JOIN course_sections cs ON cs.id = e.section_id JOIN courses c ON c.id = cs.course_id
            JOIN terms t ON t.id = cs.term_id LEFT JOIN staff st ON st.id = cs.teacher_staff_id LEFT JOIN rooms r ON r.id = cs.room_id
            LEFT JOIN grade_sheets gs ON gs.section_id = cs.id
            WHERE e.student_id = $1 AND e.status = 'active' AND e.deleted_at IS NULL ORDER BY c.code""", sid)
        attendance = await db.fetch_one(conn, """
            SELECT count(*) AS sessions, count(*) FILTER (WHERE status = 'present') AS present,
                   count(*) FILTER (WHERE status = 'absent') AS absent, count(*) FILTER (WHERE status = 'late') AS late,
                   count(*) FILTER (WHERE status = 'excused') AS excused,
                   round(100.0 * count(*) FILTER (WHERE status IN ('present','late','excused')) / NULLIF(count(*), 0), 1) AS pct
            FROM attendance_records WHERE student_id = $1 AND deleted_at IS NULL""", sid)
        recent_attendance = await db.fetch_all(conn, """
            SELECT ses.session_date, c.code, ar.status, ar.corrected FROM attendance_records ar
            JOIN attendance_sessions ses ON ses.id = ar.session_id JOIN course_sections cs ON cs.id = ses.section_id
            JOIN courses c ON c.id = cs.course_id WHERE ar.student_id = $1 AND ar.deleted_at IS NULL
            ORDER BY ses.session_date DESC, c.code LIMIT 40""", sid)
        report_cards = await db.fetch_all(conn, """
            SELECT id, term_label, version_no, gpa, credits, published_at, change_reason, data
            FROM report_cards WHERE student_id = $1 AND status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC""", sid)
        finance = None
        if finance_ok:
            finance = await db.fetch_one(conn, """
                SELECT COALESCE(sum(amount - concession_amount + fine_amount), 0) AS billed, COALESCE(sum(paid_amount), 0) AS paid,
                       COALESCE(sum(amount - concession_amount + fine_amount - paid_amount)
                                FILTER (WHERE status IN ('generated','partially_paid','overdue')), 0) AS outstanding,
                       count(*) FILTER (WHERE status = 'overdue') AS overdue_count
                FROM invoices WHERE student_id = $1 AND deleted_at IS NULL AND status NOT IN ('waived','written_off')""", sid)
            finance["invoices"] = await db.fetch_all(conn, """
                SELECT id, invoice_no, description, amount, concession_amount, fine_amount, paid_amount, due_date, status,
                       amount - concession_amount + fine_amount - paid_amount AS balance
                FROM invoices WHERE student_id = $1 AND deleted_at IS NULL ORDER BY due_date DESC LIMIT 20""", sid)
        leaves = await db.fetch_all(conn, """SELECT id, request_no, kind, leave_type, start_date, end_date, days, reason, status,
                                                    review_comment, created_at FROM leave_requests
                                             WHERE student_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10""", sid)
        loans = await db.fetch_all(conn, """SELECT l.id, l.loan_no, l.status, l.due_date, l.issued_at, li.title, l.fine_amount
                                            FROM library_loans l JOIN library_items li ON li.id = l.item_id
                                            WHERE l.student_id = $1 AND l.status IN ('requested','issued') ORDER BY l.due_date""", sid)
        placements = await db.fetch_all(conn, """SELECT pa.id, pa.stage, jp.title, co.name AS company, jp.kind FROM placement_applications pa
                                                 JOIN job_postings jp ON jp.id = pa.posting_id JOIN companies co ON co.id = jp.company_id
                                                 WHERE pa.student_id = $1 ORDER BY pa.updated_at DESC""", sid)
        documents = await db.fetch_all(conn, """SELECT id, doc_type, title, direction, mandatory, status, verified_at, remarks,
                                                       reference_no, file_id, created_at FROM student_documents
                                                WHERE student_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC""", sid)
        health_row = await db.fetch_one(conn, "SELECT * FROM health_records WHERE student_id = $1 AND deleted_at IS NULL", sid)
        health = None
        if health_row:
            if ctx.has("sis.health.view") or family:
                health = {"blood_group": health_row["blood_group"], "allergies": decrypt_field(health_row["allergies_enc"]),
                          "conditions": decrypt_field(health_row["conditions_enc"]), "immunisations": health_row["immunisations"],
                          "severity": health_row["severity"], "clinic_acknowledged_at": health_row["clinic_acknowledged_at"],
                          "updated_at": health_row["updated_at"]}
                if ctx.has("sis.health.view") and not family:
                    await audit(conn, ctx, "health_record.viewed", "student", sid)
            else:
                health = {"restricted": True, "severity": health_row["severity"],
                          "note": "Critical health alert on file — contact the campus clinic before activities"
                          if health_row["severity"] == "critical" else None}
        history = await db.fetch_all(conn, """SELECT from_status, to_status, reason, effective_date, created_at
                                              FROM student_status_history WHERE student_id = $1 ORDER BY created_at DESC""", sid)
        hostel = await db.fetch_one(conn, """SELECT hb.name AS block, hr.room_no, ra.bed_no, ra.from_date FROM room_allotments ra
                                             JOIN hostel_rooms hr ON hr.id = ra.room_id JOIN hostel_blocks hb ON hb.id = hr.block_id
                                             WHERE ra.student_id = $1 AND ra.status = 'active'""", sid)
        transport = await db.fetch_one(conn, """SELECT r.code AS route_code, r.name AS route_name, rs.name AS stop_name, rs.pickup_time
                                                FROM transport_allocations ta JOIN routes r ON r.id = ta.route_id
                                                JOIN route_stops rs ON rs.id = ta.stop_id
                                                WHERE ta.student_id = $1 AND ta.status = 'active'""", sid)
        wallet = await db.fetch_one(conn, "SELECT id, card_no, balance, daily_limit, status FROM wallets WHERE student_id = $1", sid)
        id_card = await db.fetch_one(conn, """SELECT card_no, issued_at, valid_until, status FROM id_cards
                                              WHERE student_id = $1 AND status = 'active' ORDER BY issued_at DESC LIMIT 1""", sid)
        pending_status = await workflow.pending_for_entity(conn, "student_status_change", sid)
        if family and ctx.guardian_id:
            await audit(conn, ctx, "portal.viewed", "student", sid)
    return {"student": student, "guardians": guardians, "enrollments": enrollments, "attendance": attendance,
            "recent_attendance": recent_attendance, "report_cards": report_cards, "finance": finance, "leaves": leaves,
            "library_loans": loans, "placements": placements, "documents": documents, "health": health,
            "status_history": history, "hostel": hostel, "transport": transport, "wallet": wallet, "id_card": id_card,
            "pending_status_change": pending_status,
            "permissions": {"manage": manage, "family": family, "finance": finance_ok,
                            "health_manage": ctx.has("sis.health.manage"), "documents_manage": ctx.has("sis.documents.manage")}}


# ================================================================== create / update
class GuardianIn(Model):
    name: str = Field(min_length=2)
    email: Optional[str] = None
    phone: Optional[str] = None
    occupation: Optional[str] = None
    relationship: str = "Guardian"


class StudentCreateIn(Model):
    name: str = Field(min_length=2, max_length=120)
    email: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[Literal["F", "M", "X"]] = None
    programme_id: uuid.UUID
    cohort: int = Field(ge=2000, le=2100)
    current_semester: int = Field(ge=1, le=12)
    admission_date: Optional[date] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    campus_id: Optional[uuid.UUID] = None
    guardian: Optional[GuardianIn] = None
    create_portal_accounts: bool = True


@router.post("/students")
async def create_student(payload: StudentCreateIn, ctx: Ctx = Depends(require("sis.students.manage"))):
    data = payload.model_dump(exclude={"guardian", "create_portal_accounts"})
    credentials = []
    async with ctx.tx() as conn:
        student = await create_student_record(conn, ctx, data)
        enrolled = await enroll_in_current_sections(conn, student["id"], student["programme_id"], student["current_semester"])
        if payload.create_portal_accounts:
            cred = await create_portal_user(conn, ctx, email=payload.email, name=payload.name, role="student",
                                            student_id=student["id"], phone=payload.phone)
            if cred:
                credentials.append(cred)
        if payload.guardian:
            g = payload.guardian.model_dump()
            _link, cred = await link_guardian(conn, ctx, student["id"], g, relationship=g.pop("relationship"),
                                              create_account=payload.create_portal_accounts)
            if cred:
                credentials.append(cred)
        await audit(conn, ctx, "student.created", "student", student["id"],
                    after={"roll_no": student["roll_no"], "name": student["name"], "enrolled_sections": enrolled})
    return {"student": student, "enrolled_sections": enrolled, "portal_credentials": credentials}


class StudentUpdateIn(Model):
    name: Optional[str] = Field(default=None, min_length=2)
    email: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[Literal["F", "M", "X"]] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    current_semester: Optional[int] = Field(default=None, ge=1, le=12)
    section: Optional[str] = None
    campus_id: Optional[uuid.UUID] = None
    photo_url: Optional[str] = None


@router.patch("/students/{student_id}")
async def update_student(student_id: uuid.UUID, payload: StudentUpdateIn, ctx: Ctx = Depends(require("sis.students.manage"))):
    data = payload.model_dump(exclude_unset=True)
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "students", student_id, lock=True), "Student")
        after = await db.update(conn, "students", student_id, {**data, "updated_by": ctx.user_id})
        await audit(conn, ctx, "student.updated", "student", student_id, before=before, after=after)
    return after


class ContactUpdateIn(Model):
    phone: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


@router.patch("/students/{student_id}/contact")
async def update_contact(student_id: uuid.UUID, payload: ContactUpdateIn, ctx: Ctx = Depends(current_ctx)):
    sid = str(student_id)
    if sid not in ctx.linked_student_ids and not ctx.has("sis.students.manage"):
        raise forbidden("You can only update contact details for your own record")
    data = payload.model_dump(exclude_unset=True)
    async with ctx.tx() as conn:
        before = must(await db.get_row(conn, "students", sid, lock=True), "Student")
        after = await db.update(conn, "students", sid, {**data, "updated_by": ctx.user_id})
        await audit(conn, ctx, "profile.updated", "student", sid, before=before, after=after)
        if {"emergency_contact_name", "emergency_contact_phone"} & set(data) and not ctx.has("sis.students.manage"):
            admins = await recipients.with_permission(conn, "sis.students.manage")
            await notify(conn, ctx, event_code="profile.updated", severity="INFO", user_ids=admins,
                         title=f"Emergency contact changed for {before['name']}", body=f"Updated by {ctx.name} — please review.",
                         link=f"/students/{sid}", entity_type="student", entity_id=sid, category="general")
    return {k: after[k] for k in ("id", "phone", "address", "emergency_contact_name", "emergency_contact_phone")}


# ================================================================== status changes (approval)
class StatusChangeIn(Model):
    to_status: Literal["active", "on_leave", "suspended", "withdrawn", "transferred_out", "alumni"]
    reason: str = Field(min_length=5)
    effective_date: date


@router.post("/students/{student_id}/status-change")
async def request_status_change(student_id: uuid.UUID, payload: StatusChangeIn, ctx: Ctx = Depends(require("sis.students.manage"))):
    async with ctx.tx() as conn:
        student = must(await db.get_row(conn, "students", student_id), "Student")
        if payload.to_status not in TRANSITIONS.get(student["status"], set()):
            raise bad_request(f"Cannot move a student from '{student['status']}' to '{payload.to_status}'", "invalid_transition")
        return await workflow.submit(conn, ctx, "student_status_change", entity_type="student", entity_id=student_id,
                                     title=f"{student['name']}: {student['status']} → {payload.to_status}",
                                     summary=payload.reason,
                                     payload={"from": student["status"], "to": payload.to_status, "reason": payload.reason,
                                              "effective_date": payload.effective_date.isoformat()})


async def _status_change_approved(conn, ctx, instance, _comment):
    p = instance["payload"]
    sid = instance["entity_id"]
    student = await db.get_row(conn, "students", sid, lock=True)
    if student["status"] != p["from"]:
        raise conflict(f"Student status changed to {student['status']} since the request was raised")
    await conn.execute("UPDATE students SET status = $1, updated_by = $2 WHERE id = $3", p["to"], ctx.user_id, sid)
    await db.insert(conn, "student_status_history", {"student_id": sid, "from_status": p["from"], "to_status": p["to"],
                                                     "reason": p["reason"], "effective_date": date.fromisoformat(p["effective_date"]),
                                                     "workflow_instance_id": instance["id"]})
    if p["to"] in ("withdrawn", "transferred_out", "alumni"):
        await conn.execute("UPDATE enrollments SET status = 'dropped' WHERE student_id = $1 AND status = 'active'", sid)
    users = (await recipients.guardians_of(conn, sid) + await recipients.with_permission(conn, "fees.payments.record")
             + await recipients.teachers_of(conn, sid))
    await notify(conn, ctx, event_code="student.status_changed", severity="WARNING", user_ids=users,
                 title=f"Student status changed: {student['name']} is now {p['to'].replace('_', ' ')}",
                 body=p["reason"], link=f"/students/{sid}", entity_type="student", entity_id=sid, category="academic_record")
    await audit(conn, ctx, "student.alumni_converted" if p["to"] == "alumni" else "student.status_changed", "student", sid,
                before={"status": p["from"]}, after={"status": p["to"]}, reason=p["reason"])
    return {"status": p["to"]}


workflow.register("student_status_change", approved=_status_change_approved)


# ================================================================== guardians
class LinkGuardianIn(Model):
    guardian_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    occupation: Optional[str] = None
    relationship: str = "Guardian"
    has_custody: bool = True
    can_pickup: bool = True
    is_emergency_contact: bool = False
    portal_access: bool = True
    create_account: bool = True


class LinkUpdateIn(Model):
    has_custody: Optional[bool] = None
    can_pickup: Optional[bool] = None
    is_emergency_contact: Optional[bool] = None
    portal_access: Optional[bool] = None
    relationship: Optional[str] = None


class ReasonIn(Model):
    reason: str = Field(min_length=3)


@router.get("/guardians")
async def search_guardians(search: str = "", ctx: Ctx = Depends(require("sis.students.manage"))):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """SELECT g.id, g.name, g.email, g.phone,
                                                  (SELECT string_agg(s.name, ', ') FROM guardian_student_links l JOIN students s ON s.id = l.student_id
                                                   WHERE l.guardian_id = g.id AND l.status = 'active') AS children
                                           FROM guardians g WHERE g.deleted_at IS NULL AND (g.name ILIKE $1 OR g.email ILIKE $1)
                                           ORDER BY g.name LIMIT 20""", f"%{search}%")


@router.post("/students/{student_id}/guardians")
async def add_guardian(student_id: uuid.UUID, payload: LinkGuardianIn, ctx: Ctx = Depends(require("sis.students.manage"))):
    if not payload.guardian_id and not payload.name:
        raise bad_request("Choose an existing guardian or provide a name")
    async with ctx.tx() as conn:
        student = must(await db.get_row(conn, "students", student_id), "Student")
        existing = await recipients.guardians_of(conn, student_id)
        guardian = {"id": payload.guardian_id} if payload.guardian_id else payload.model_dump(
            include={"name", "email", "phone", "occupation"})
        link, cred = await link_guardian(conn, ctx, student_id, guardian, relationship=payload.relationship,
                                         has_custody=payload.has_custody, can_pickup=payload.can_pickup,
                                         is_emergency_contact=payload.is_emergency_contact, portal_access=payload.portal_access,
                                         create_account=payload.create_account)
        await audit(conn, ctx, "guardian.linked", "student", student_id, after={"guardian_id": link["guardian_id"],
                                                                                "custody": payload.has_custody})
        if payload.has_custody and existing:
            await notify(conn, ctx, event_code="guardian.linked", severity="WARNING", user_ids=existing,
                         title=f"A guardian with custody rights was added for {student['name']}",
                         body="Contact the school office if you did not expect this change.", category="safety",
                         entity_type="student", entity_id=student_id)
    return {"link": link, "portal_credentials": cred}


@router.patch("/students/{student_id}/guardians/{link_id}")
async def update_guardian_link(student_id: uuid.UUID, link_id: uuid.UUID, payload: LinkUpdateIn,
                               ctx: Ctx = Depends(require("sis.students.manage"))):
    data = payload.model_dump(exclude_unset=True)
    async with ctx.tx() as conn:
        before = must(await db.fetch_one(conn, "SELECT * FROM guardian_student_links WHERE id = $1 AND student_id = $2",
                                         link_id, student_id), "Guardian link")
        after = await db.update(conn, "guardian_student_links", link_id, {**data, "updated_by": ctx.user_id})
        await audit(conn, ctx, "guardian.link_updated", "student", student_id, before=before, after=after)
        if "has_custody" in data and data["has_custody"] != before["has_custody"]:
            users = await recipients.guardians_of(conn, student_id)
            await notify(conn, ctx, event_code="guardian.link_updated", severity="WARNING", user_ids=users,
                         title="Custody rights changed on a guardian link", category="safety",
                         entity_type="student", entity_id=student_id)
    return after


@router.post("/students/{student_id}/guardians/{link_id}/unlink")
async def unlink_guardian(student_id: uuid.UUID, link_id: uuid.UUID, payload: ReasonIn,
                          ctx: Ctx = Depends(require("sis.students.manage"))):
    async with ctx.tx() as conn:
        link = must(await db.fetch_one(conn, "SELECT * FROM guardian_student_links WHERE id = $1 AND student_id = $2 AND status = 'active'",
                                       link_id, student_id), "Active guardian link")
        await conn.execute("UPDATE guardian_student_links SET status = 'inactive', updated_by = $1 WHERE id = $2", ctx.user_id, link_id)
        await audit(conn, ctx, "guardian.unlinked", "student", student_id, before={"guardian_id": link["guardian_id"]},
                    reason=payload.reason)
        users = await recipients.guardians_of(conn, student_id)
        await notify(conn, ctx, event_code="guardian.unlinked", severity="WARNING", user_ids=users,
                     title="A guardian was unlinked from your child's record", body=payload.reason, category="safety",
                     entity_type="student", entity_id=student_id)
    return {"status": "unlinked"}


# ================================================================== health
class HealthIn(Model):
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    conditions: Optional[str] = None
    immunisations: list[dict] = []
    severity: Literal["normal", "critical"] = "normal"


@router.put("/students/{student_id}/health")
async def upsert_health(student_id: uuid.UUID, payload: HealthIn, ctx: Ctx = Depends(require("sis.health.manage"))):
    async with ctx.tx() as conn:
        student = must(await db.get_row(conn, "students", student_id), "Student")
        before = await db.fetch_one(conn, "SELECT severity, blood_group FROM health_records WHERE student_id = $1", student_id)
        row = await db.fetch_one(conn, """
            INSERT INTO health_records (student_id, blood_group, allergies_enc, conditions_enc, immunisations, severity,
                                        clinic_acknowledged_at, clinic_acknowledged_by, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'critical' THEN NULL ELSE now() END, $7, $7)
            ON CONFLICT (student_id) DO UPDATE SET blood_group = EXCLUDED.blood_group, allergies_enc = EXCLUDED.allergies_enc,
              conditions_enc = EXCLUDED.conditions_enc, immunisations = EXCLUDED.immunisations, severity = EXCLUDED.severity,
              clinic_acknowledged_at = CASE WHEN EXCLUDED.severity = 'critical' THEN NULL ELSE now() END,
              clinic_acknowledged_by = EXCLUDED.clinic_acknowledged_by, updated_by = EXCLUDED.created_by
            RETURNING id, severity""", student_id, payload.blood_group, encrypt_field(payload.allergies),
                                 encrypt_field(payload.conditions), payload.immunisations, payload.severity, ctx.user_id)
        await audit(conn, ctx, "health_record.updated", "student", student_id,
                    before={"severity": (before or {}).get("severity")},
                    after={"severity": payload.severity, "fields_changed": ["allergies", "conditions", "immunisations"]})
        if payload.severity == "critical":
            users = await recipients.teachers_of(conn, student_id) + await recipients.with_permission(conn, "sis.health.manage")
            await notify(conn, ctx, event_code="health_record.updated", severity="ACTION", user_ids=users,
                         title=f"Critical health alert: {student['name']}",
                         body="Review the student's health record and emergency plan before activities.",
                         link=f"/students/{student_id}", entity_type="student", entity_id=student_id, category="safety")
    return row


@router.post("/students/{student_id}/health/acknowledge")
async def acknowledge_health(student_id: uuid.UUID, ctx: Ctx = Depends(require("sis.health.manage"))):
    async with ctx.tx() as conn:
        updated = await conn.fetchval("""UPDATE health_records SET clinic_acknowledged_at = now(), clinic_acknowledged_by = $1
                                         WHERE student_id = $2 RETURNING id""", ctx.user_id, student_id)
        if not updated:
            raise bad_request("No health record on file")
        await audit(conn, ctx, "health_record.acknowledged", "student", student_id)
    return {"status": "acknowledged"}


# ================================================================== ID cards & documents
@router.post("/students/{student_id}/id-card")
async def generate_id_card(student_id: uuid.UUID, ctx: Ctx = Depends(require("sis.students.manage", "sis.documents.manage"))):
    async with ctx.tx() as conn:
        student = must(await db.get_row(conn, "students", student_id), "Student")
        programme = await db.fetch_one(conn, "SELECT duration_years FROM programmes WHERE id = $1", student["programme_id"])
        await conn.execute("UPDATE id_cards SET status = 'revoked' WHERE student_id = $1 AND status = 'active'", student_id)
        card = await db.insert(conn, "id_cards", {
            "student_id": student_id, "card_no": await db.next_code(conn, "idcard", "IDC-"),
            "valid_until": date((student["cohort"] or date.today().year) + (programme or {}).get("duration_years", 4), 6, 30),
            "created_by": ctx.user_id})
        await audit(conn, ctx, "id_card.generated", "student", student_id, after={"card_no": card["card_no"]})
    return card


class DocumentIn(Model):
    doc_type: str = Field(min_length=2)
    title: str = Field(min_length=2)
    file_id: Optional[uuid.UUID] = None
    mandatory: bool = False


class VerifyIn(Model):
    status: Literal["verified", "rejected"]
    remarks: Optional[str] = None


class IssueDocumentIn(Model):
    doc_type: Literal["bonafide", "transfer_certificate", "character_certificate", "transcript"]
    purpose: str = Field(min_length=3)
    ticket_id: Optional[uuid.UUID] = None


@router.post("/students/{student_id}/documents")
async def submit_document(student_id: uuid.UUID, payload: DocumentIn, ctx: Ctx = Depends(current_ctx)):
    sid = str(student_id)
    if sid not in ctx.linked_student_ids and not ctx.has("sis.documents.manage", "sis.students.manage"):
        raise forbidden()
    async with ctx.tx() as conn:
        must(await db.get_row(conn, "students", sid), "Student")
        row = await db.insert(conn, "student_documents", {**payload.model_dump(), "student_id": sid, "direction": "submitted",
                                                          "status": "pending", "created_by": ctx.user_id})
        await audit(conn, ctx, "document.submitted", "student", sid, after={"doc_type": payload.doc_type})
    return row


@router.post("/documents/{document_id}/verify")
async def verify_document(document_id: uuid.UUID, payload: VerifyIn, ctx: Ctx = Depends(require("sis.documents.manage"))):
    async with ctx.tx() as conn:
        doc = must(await db.get_row(conn, "student_documents", document_id, lock=True), "Document")
        if doc["direction"] != "submitted":
            raise bad_request("Only submitted documents can be verified")
        after = await db.update(conn, "student_documents", document_id, {
            "status": payload.status, "remarks": payload.remarks, "verified_by": ctx.user_id,
            "verified_at": db_now(), "updated_by": ctx.user_id})
        await audit(conn, ctx, f"document.{payload.status}", "student_document", document_id,
                    before={"status": doc["status"]}, after={"status": payload.status}, reason=payload.remarks)
        if payload.status == "rejected":
            users = await recipients.student_and_guardians(conn, doc["student_id"])
            await notify(conn, ctx, event_code="document.rejected", severity="WARNING", user_ids=users,
                         title=f"Document rejected: {doc['title']}", body=payload.remarks or "Please upload a valid copy.",
                         link="/portal", entity_type="student", entity_id=doc["student_id"], category="compliance")
    return after


def db_now():
    from ._base import utcnow
    return utcnow()


@router.post("/students/{student_id}/documents/issue")
async def issue_document(student_id: uuid.UUID, payload: IssueDocumentIn, ctx: Ctx = Depends(require("sis.documents.manage"))):
    async with ctx.tx() as conn:
        student = must(await db.get_row(conn, "students", student_id), "Student")
        if payload.doc_type == "transcript" and not await conn.fetchval(
                "SELECT 1 FROM report_cards WHERE student_id = $1 AND status = 'published'", student_id):
            raise bad_request("No published report cards — a transcript cannot be issued yet")
        row = await db.insert(conn, "student_documents", {
            "student_id": student_id, "doc_type": payload.doc_type, "title": CERTIFICATES[payload.doc_type],
            "direction": "issued", "status": "issued", "remarks": payload.purpose,
            "reference_no": await db.next_code(conn, "certificate_doc", "DOC-"), "verified_by": ctx.user_id,
            "verified_at": db_now(), "created_by": ctx.user_id})
        if payload.ticket_id:
            await conn.execute("""UPDATE service_tickets SET status = 'resolved', resolved_at = now(),
                                  resolution = $1, updated_by = $2 WHERE id = $3 AND status IN ('open','in_progress')""",
                               f"{CERTIFICATES[payload.doc_type]} issued ({row['reference_no']})", ctx.user_id, payload.ticket_id)
        await audit(conn, ctx, "document.issued", "student", student_id,
                    after={"doc_type": payload.doc_type, "reference_no": row["reference_no"], "purpose": payload.purpose})
        users = await recipients.student_and_guardians(conn, student_id)
        await notify(conn, ctx, event_code="document.issued", severity="INFO", user_ids=users,
                     title=f"{CERTIFICATES[payload.doc_type]} issued for {student['name']}",
                     body=f"Reference {row['reference_no']}", link=f"/students/{student_id}", entity_type="student",
                     entity_id=student_id, category="academic_record")
    return row


@router.get("/documents/{document_id}/certificate")
async def certificate_data(document_id: uuid.UUID, ctx: Ctx = Depends(current_ctx)):
    async with ctx.conn() as conn:
        doc = must(await db.get_row(conn, "student_documents", document_id), "Document")
        if doc["direction"] != "issued":
            raise bad_request("Not an issued certificate")
        await assert_student_access(conn, ctx, str(doc["student_id"]))
        student = await db.fetch_one(conn, """SELECT s.name, s.roll_no, s.dob, s.cohort, s.current_semester, s.status, s.admission_date,
                                                     p.name AS programme_name FROM students s
                                              LEFT JOIN programmes p ON p.id = s.programme_id WHERE s.id = $1""", doc["student_id"])
        inst = await institution(conn)
        cards = []
        if doc["doc_type"] == "transcript":
            cards = await db.fetch_all(conn, """SELECT term_label, gpa, credits, data FROM report_cards WHERE student_id = $1
                                                AND status = 'published' ORDER BY published_at""", doc["student_id"])
    return {"document": doc, "student": student, "report_cards": cards,
            "institution": {k: inst.get(k) for k in ("name", "legal_name", "address", "contact_email", "logo_url")}}


# ================================================================== merge duplicates
class MergeIn(Model):
    primary_id: uuid.UUID
    duplicate_id: uuid.UUID
    reason: str = Field(min_length=5)


MERGE_SIMPLE_TABLES = ["invoices", "payments", "leave_requests", "library_loans", "student_documents", "discipline_incidents",
                       "counselling_sessions", "service_tickets", "appointments", "report_cards", "concessions",
                       "hostel_movements", "hostel_complaints"]


@router.get("/students-duplicates")
async def possible_duplicates(ctx: Ctx = Depends(require("sis.students.merge"))):
    async with ctx.conn() as conn:
        return await db.fetch_all(conn, """
            SELECT a.id AS primary_id, a.name AS primary_name, a.roll_no AS primary_roll,
                   b.id AS duplicate_id, b.name AS duplicate_name, b.roll_no AS duplicate_roll
            FROM students a JOIN students b ON a.id < b.id AND b.merged_into_id IS NULL AND a.merged_into_id IS NULL
             AND (lower(a.name) = lower(b.name) AND (a.dob = b.dob OR lower(a.email) = lower(b.email)))
            WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL LIMIT 50""")


@router.post("/students/merge")
async def request_merge(payload: MergeIn, ctx: Ctx = Depends(require("sis.students.manage", "sis.students.merge"))):
    if payload.primary_id == payload.duplicate_id:
        raise bad_request("Choose two different records")
    async with ctx.tx() as conn:
        primary = must(await db.get_row(conn, "students", payload.primary_id), "Primary student")
        duplicate = must(await db.get_row(conn, "students", payload.duplicate_id), "Duplicate student")
        instance = await workflow.submit(conn, ctx, "student_merge", entity_type="student", entity_id=payload.duplicate_id,
                                         title=f"Merge {duplicate['name']} ({duplicate['roll_no']}) into {primary['roll_no']}",
                                         summary=payload.reason, payload={"primary_id": str(payload.primary_id),
                                                                          "duplicate_id": str(payload.duplicate_id)})
        reviewers = await recipients.with_permission(conn, "sis.students.merge")
        await notify(conn, ctx, event_code="student.merged", severity="CRITICAL", user_ids=[r for r in reviewers if r != ctx.user_id],
                     title="Review required: irreversible student record merge", body=instance["title"],
                     link=f"/approvals/{instance['id']}", category="compliance")
    return instance


async def _merge_approved(conn, ctx, instance, _comment):
    primary, duplicate = instance["payload"]["primary_id"], instance["payload"]["duplicate_id"]
    moved = {}
    for table in MERGE_SIMPLE_TABLES:
        result = await conn.execute(f"UPDATE {table} SET student_id = $1 WHERE student_id = $2", primary, duplicate)
        moved[table] = int(result.split()[-1])
    for table, key in [("enrollments", "section_id"), ("marks", "assessment_id"), ("guardian_student_links", "guardian_id"),
                       ("placement_applications", "posting_id"), ("lms_enrollments", "course_id")]:
        result = await conn.execute(f"""UPDATE {table} t SET student_id = $1 WHERE t.student_id = $2 AND NOT EXISTS
                                        (SELECT 1 FROM {table} x WHERE x.student_id = $1 AND x.{key} = t.{key})""", primary, duplicate)
        moved[table] = int(result.split()[-1])
    await conn.execute("UPDATE students SET status = 'withdrawn', merged_into_id = $1, updated_by = $2 WHERE id = $3",
                       primary, ctx.user_id, duplicate)
    await conn.execute("UPDATE users SET status = 'inactive' WHERE student_id = $1", duplicate)
    await audit(conn, ctx, "student.merged", "student", primary, after={"merged": duplicate, "moved": moved})
    return {"moved": moved}


workflow.register("student_merge", approved=_merge_approved)


# ================================================================== compliance job
@job("sis.compliance_scan", "SIS compliance alerts", 1440)
async def compliance_scan(conn, ctx, _tenant):
    doc_admins = await recipients.with_permission(conn, "sis.documents.manage")
    missing_docs = await db.fetch_all(conn, """
        SELECT s.id, s.name, count(*) AS missing FROM student_documents d JOIN students s ON s.id = d.student_id
        WHERE d.mandatory AND d.status IN ('pending','rejected') AND d.deleted_at IS NULL AND s.status = 'active'
          AND s.admission_date < CURRENT_DATE - 30 GROUP BY s.id""")
    for row in missing_docs:
        await notify(conn, ctx, event_code="student.document.missing", severity="ACTION", user_ids=doc_admins,
                     title=f"Mandatory documents pending: {row['name']}", body=f"{row['missing']} document(s) not verified",
                     link=f"/students/{row['id']}", entity_type="student", entity_id=row["id"], category="compliance",
                     throttle_key=f"missing-docs:{row['id']}", throttle_hours=168)
    no_contact = await db.fetch_all(conn, """SELECT id, name FROM students WHERE status = 'active' AND deleted_at IS NULL
                                             AND (emergency_contact_phone IS NULL OR emergency_contact_phone = '')""")
    for row in no_contact:
        users = doc_admins + await recipients.student_and_guardians(conn, row["id"])
        await notify(conn, ctx, event_code="student.emergency_contact.missing", severity="WARNING", user_ids=users,
                     title=f"Emergency contact missing: {row['name']}", body="Add a reachable emergency contact.",
                     link=f"/students/{row['id']}", entity_type="student", entity_id=row["id"], category="safety",
                     throttle_key=f"no-emergency:{row['id']}", throttle_hours=168)
    unacknowledged = await db.fetch_all(conn, """
        SELECT s.id, s.name FROM health_records h JOIN students s ON s.id = h.student_id
        WHERE h.severity = 'critical' AND h.clinic_acknowledged_at IS NULL AND h.updated_at < now() - interval '24 hours'""")
    clinic = await recipients.with_permission(conn, "sis.health.manage")
    admins = await recipients.with_permission(conn, "sis.students.manage")
    for row in unacknowledged:
        await notify(conn, ctx, event_code="health_record.unacknowledged", severity="CRITICAL", user_ids=clinic + admins,
                     title=f"Critical health record not acknowledged: {row['name']}", body="Flagged critical over 24 hours ago.",
                     link=f"/students/{row['id']}", entity_type="student", entity_id=row["id"], category="safety",
                     throttle_key=f"health-ack:{row['id']}", throttle_hours=12)
    return {"missing_documents": len(missing_docs), "missing_emergency_contact": len(no_contact),
            "unacknowledged_critical_health": len(unacknowledged)}
