"""
Identity context + RBAC/ABAC (Build Spec §3.1).
- Fixed permission catalog; roles (system or tenant-custom) compose permissions from it.
- Every request resolves: token -> tenant (must be active) -> live session -> active user -> role.
- Row-level scoping helpers (teacher sees own sections, guardian sees linked children).
"""
from dataclasses import dataclass, field
from typing import Optional

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

from . import db, tenancy
from .errors import AppError, forbidden
from .security import decode_token

PERMISSION_CATALOG: dict[str, dict[str, str]] = {
    "Platform Core (M01)": {
        "platform.settings.manage": "Manage institution profile, campuses, departments and branding",
        "platform.calendar.manage": "Manage academic years, terms and holidays",
        "platform.modules.manage": "Enable or disable modules for this tenant",
        "platform.integrations.manage": "Manage API keys and webhooks",
        "platform.audit.view": "View and export the audit trail",
        "platform.jobs.manage": "View and trigger background jobs",
        "platform.tenants.manage": "Provision, suspend and reset tenants (SUPER_ADMIN only)",
    },
    "Identity & Security (M02)": {
        "identity.users.view": "View user accounts",
        "identity.users.manage": "Create, edit and deactivate users; reset passwords",
        "identity.roles.manage": "Create custom roles and assign roles",
        "identity.impersonate": "Impersonate users (time-boxed, reason required, logged)",
        "identity.pii.unmask": "Unmask protected personal data fields",
    },
    "Admissions (M03)": {
        "admissions.enquiries.manage": "Capture and work enquiries",
        "admissions.applications.manage": "Process applications and documents",
        "admissions.offers.approve": "Sign off offer letters and seat overrides",
        "admissions.view_all": "View the full admissions funnel",
    },
    "Student Information (M04)": {
        "sis.students.view_all": "View all student records",
        "sis.students.view_class": "View students in own classes",
        "sis.students.manage": "Create and edit student records and guardians",
        "sis.students.status_approve": "Approve student status changes",
        "sis.students.merge": "Review and commit duplicate-record merges",
        "sis.health.view": "View student health records",
        "sis.health.manage": "Create and edit student health records",
        "sis.documents.manage": "Verify and issue student documents",
    },
    "HR (M05)": {
        "hr.staff.view": "View staff directory",
        "hr.staff.manage": "Create, edit and exit staff records",
        "hr.leave.request": "Request own leave",
        "hr.leave.approve": "Approve staff leave",
    },
    "Payroll (M06)": {
        "payroll.runs.manage": "Create and calculate payroll runs",
        "payroll.runs.approve": "First sign-off to lock a payroll run (finance)",
        "payroll.runs.disburse": "Second sign-off and disbursement (admin)",
        "payroll.payslips.view_own": "View own payslips",
    },
    "Academics (M07)": {
        "academics.catalog.manage": "Manage programmes, courses, sections and rooms",
        "academics.syllabus.edit": "Draft syllabus versions",
        "academics.syllabus.approve": "Approve syllabus publication (HOD)",
        "academics.timetable.manage": "Build timetables",
        "academics.timetable.approve": "Approve timetable publication",
        "academics.timetable.view": "View timetables",
        "academics.substitution.respond": "Request and respond to substitutions",
    },
    "Attendance (M08)": {
        "attendance.mark": "Mark attendance for own classes",
        "attendance.view_all": "View institution-wide attendance",
        "attendance.corrections.approve": "Approve post-cutoff attendance corrections",
        "attendance.view_own": "View own / child attendance",
    },
    "Examinations (M09)": {
        "exams.schedule.manage": "Schedule, reschedule and cancel exams",
        "exams.view": "View exam schedules and hall tickets",
        "exams.malpractice.decide": "Decide online-exam malpractice cases",
    },
    "Gradebook (M30)": {
        "grades.marks.enter": "Enter marks for own sections",
        "grades.review": "Review submitted marks (HOD/moderator)",
        "grades.publish": "Publish report cards",
        "grades.change.approve": "Approve post-publication grade changes",
        "grades.view_own": "View own / child report cards",
    },
    "LMS & Content (M11/M12)": {
        "lms.courses.author": "Author online courses and quizzes",
        "lms.courses.approve": "Approve course publication",
        "lms.learn": "Enrol in and study online courses",
        "content.author": "Draft content in the authoring studio",
        "content.review": "Review and publish content",
    },
    "Library (M14)": {
        "library.catalog.manage": "Manage the catalogue",
        "library.circulation.manage": "Issue, return and waive fines within limit",
        "library.waivers.approve": "Approve fine waivers above threshold",
        "library.borrow": "Request, renew and reserve items",
    },
    "Fees & Finance (M15)": {
        "fees.view_all": "View institution-wide ledgers",
        "fees.structures.manage": "Manage fee heads and structures",
        "fees.invoices.manage": "Create and adjust invoices",
        "fees.payments.record": "Record, reverse and refund payments",
        "fees.concessions.approve": "Approve concessions and scholarships",
        "fees.waivers.approve": "Approve fee waivers and write-offs",
        "fees.refunds.approve": "Approve refunds above threshold",
        "fees.pay_own": "View and pay own / child dues",
    },
    "Inventory (M16)": {
        "inventory.manage": "Manage stock, assets, POs and tickets",
        "inventory.approve": "Approve POs above threshold and write-offs",
        "inventory.request": "Raise requisitions and maintenance tickets",
    },
    "Transport (M17)": {
        "transport.manage": "Manage fleet, routes and allocations",
        "transport.trip.update": "Start/end trips, send location, trigger SOS",
        "transport.approve": "Approve mid-term route changes",
        "transport.view_own": "View own / child route and ETA",
    },
    "Hostel (M18)": {
        "hostel.manage": "Manage rooms, allotments, movements and complaints",
        "hostel.approve": "Approve room reassignments",
        "hostel.view_own": "View own / child hostel record",
    },
    "Communication (M19)": {
        "comms.announcements.publish": "Publish announcements and circulars",
        "comms.broadcast.send": "Send institution-wide broadcasts",
        "comms.emergency.approve": "Trigger or co-sign emergency broadcasts",
        "comms.chat.moderate": "Moderate chat",
        "comms.chat.use": "Use moderated chat",
        "comms.ptm.manage": "Schedule PTM slots",
        "comms.ptm.book": "Book PTM slots",
    },
    "Portal & Service Desk (M20/M57)": {
        "portal.self": "Use the parent / student portal",
        "portal.requests.decide": "Decide leave requests raised against you",
        "servicedesk.manage": "Work service-desk tickets",
    },
    "Wellbeing (M22)": {
        "wellbeing.cases.manage": "Manage incidents, counselling and watchlist requests",
        "wellbeing.watchlist.approve": "Approve watchlist changes",
        "wellbeing.summary.view": "Log incidents and view summaries for own students",
    },
    "Placement (M23)": {
        "placement.manage": "Manage companies, postings, drives and offers",
        "placement.apply": "Apply to postings and respond to offers",
    },
    "Accreditation (M24)": {
        "accreditation.manage": "Manage evidence, packs and policies",
        "accreditation.approve": "Approve submission-pack filing",
        "accreditation.acknowledge": "Acknowledge policies",
    },
    "Reports (M26)": {
        "reports.view_all": "Run all standard reports and benchmarks",
        "reports.academic": "Run academic reports",
        "reports.finance": "Run finance reports",
        "reports.hr": "Run HR reports",
        "reports.export": "Export reports",
        "reports.schedule": "Schedule report delivery",
        "reports.custom": "Build ad-hoc reports",
    },
    "Campus Card & Cafeteria (M37/M38)": {
        "cafeteria.manage": "Manage menu and POS",
        "wallet.manage": "Manage wallets and cards",
        "wallet.own": "View own / child wallet, top up, set limits",
    },
    "Visitor & Security (M40)": {
        "security.gate.manage": "Operate the gate log, patrols and incidents",
        "security.override": "Override watchlist blocks; manage watchlist",
        "security.preregister": "Pre-register own visitors",
    },
    "Other modules": {
        "modules.generic.view": "View records in catalogued modules",
        "modules.generic.manage": "Manage records in catalogued modules",
    },
}

ALL_PERMISSIONS: set[str] = {p for group in PERMISSION_CATALOG.values() for p in group}

_STAFF_COMMON = ["hr.leave.request", "payroll.payslips.view_own", "accreditation.acknowledge", "library.borrow",
                 "security.preregister", "inventory.request", "comms.chat.use", "academics.timetable.view"]

SYSTEM_ROLES: dict[str, tuple[str, str, list[str]]] = {
    "super_admin": ("Platform Super Admin", "NexusCampus platform operations team", ["*"]),
    "admin": ("Institution Admin", "Full institution control (no clinic detail, no tenant provisioning)",
              sorted(ALL_PERMISSIONS - {"platform.tenants.manage", "sis.health.view", "sis.health.manage"})),
    "hod": ("Head of Department", "Reviews marks, approves syllabus and staff leave", _STAFF_COMMON + [
        "academics.syllabus.edit", "academics.syllabus.approve", "grades.marks.enter", "grades.review",
        "attendance.mark", "sis.students.view_class", "hr.leave.approve", "content.author", "content.review",
        "lms.courses.author", "lms.courses.approve", "comms.announcements.publish", "comms.ptm.manage",
        "reports.academic", "portal.requests.decide", "wellbeing.summary.view", "exams.view",
        "academics.substitution.respond", "modules.generic.view"]),
    "teacher": ("Teacher / Faculty", "Teaches sections, marks attendance, enters marks", _STAFF_COMMON + [
        "grades.marks.enter", "attendance.mark", "sis.students.view_class", "academics.syllabus.edit",
        "academics.substitution.respond", "comms.announcements.publish", "comms.ptm.manage",
        "lms.courses.author", "content.author", "portal.requests.decide", "reports.academic",
        "wellbeing.summary.view", "exams.view"]),
    "exam_controller": ("Chief Examiner", "Schedules exams and publishes results", _STAFF_COMMON + [
        "exams.schedule.manage", "exams.view", "exams.malpractice.decide", "grades.publish",
        "sis.students.view_all", "attendance.view_all", "reports.academic", "modules.generic.view"]),
    "accountant": ("Accountant", "Invoices, payments and payroll finance sign-off", _STAFF_COMMON + [
        "fees.view_all", "fees.structures.manage", "fees.invoices.manage", "fees.payments.record",
        "payroll.runs.manage", "payroll.runs.approve", "reports.finance", "reports.export",
        "sis.students.view_all", "wallet.manage", "modules.generic.view"]),
    "hr_manager": ("HR Manager", "Staff lifecycle, leave and payroll preparation", _STAFF_COMMON + [
        "hr.staff.view", "hr.staff.manage", "hr.leave.approve", "payroll.runs.manage", "reports.hr",
        "reports.export", "identity.users.view", "modules.generic.view"]),
    "placement_officer": ("Placement Officer", "Companies, drives and offers", _STAFF_COMMON + [
        "placement.manage", "sis.students.view_all", "reports.academic"]),
    "librarian": ("Librarian", "Catalogue and circulation", _STAFF_COMMON + [
        "library.catalog.manage", "library.circulation.manage"]),
    "counsellor": ("Student Counsellor", "Discipline and wellbeing casework", _STAFF_COMMON + [
        "wellbeing.cases.manage", "wellbeing.summary.view", "sis.students.view_all"]),
    "admissions_counsellor": ("Admissions Counsellor", "Works assigned enquiries", _STAFF_COMMON + [
        "admissions.enquiries.manage", "admissions.applications.manage"]),
    "clinic_staff": ("Clinic Staff", "Health records", _STAFF_COMMON + [
        "sis.health.view", "sis.health.manage", "sis.students.view_all"]),
    "warden": ("Hostel Warden", "Block-level hostel operations", _STAFF_COMMON + ["hostel.manage", "hostel.approve"]),
    "transport_manager": ("Transport Manager", "Fleet, routes and trips", _STAFF_COMMON + [
        "transport.manage", "transport.trip.update", "transport.approve"]),
    "security_head": ("Security Head", "Gate, watchlist and incidents", _STAFF_COMMON + [
        "security.gate.manage", "security.override"]),
    "store_manager": ("Store Manager", "Stock and GRN", _STAFF_COMMON + ["inventory.manage"]),
    "canteen_vendor": ("Canteen Manager", "Menu and cashless POS", ["cafeteria.manage", "comms.chat.use"]),
    "student": ("Student", "Own academic record and portal", [
        "portal.self", "attendance.view_own", "grades.view_own", "fees.pay_own", "library.borrow",
        "placement.apply", "lms.learn", "hostel.view_own", "transport.view_own", "wallet.own",
        "academics.timetable.view", "exams.view", "comms.chat.use"]),
    "parent": ("Parent / Guardian", "Linked children only", [
        "portal.self", "attendance.view_own", "grades.view_own", "fees.pay_own", "comms.ptm.book",
        "hostel.view_own", "transport.view_own", "wallet.own", "academics.timetable.view", "exams.view",
        "comms.chat.use"]),
}


@dataclass
class Ctx:
    user_id: str
    name: str
    email: str
    role: str
    role_name: str
    permissions: frozenset
    tenant_id: str
    tenant_slug: str
    tenant_name: str
    db_name: str
    session_id: str
    staff_id: Optional[str] = None
    student_id: Optional[str] = None
    guardian_id: Optional[str] = None
    linked_student_ids: list = field(default_factory=list)
    impersonator_id: Optional[str] = None
    disabled_modules: frozenset = frozenset()
    request_id: Optional[str] = None
    ip: Optional[str] = None
    device: Optional[str] = None
    source: str = "manual"

    def has(self, *perms: str) -> bool:
        return "*" in self.permissions or any(p in self.permissions for p in perms)

    def require(self, *perms: str) -> None:
        if not self.has(*perms):
            raise forbidden()

    def tx(self):
        return db.transaction(self.db_name)

    def conn(self):
        return db.connection(self.db_name)

    @property
    def is_family(self) -> bool:
        return self.role in ("student", "parent") or bool(self.guardian_id or self.student_id) and not self.staff_id


_bearer = HTTPBearer(auto_error=False)


async def current_ctx(request: Request, credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> Ctx:
    if not credentials or not credentials.credentials:
        raise AppError(401, "unauthenticated", "Authentication required")
    try:
        payload = decode_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise AppError(401, "session_expired", "Your session has expired. Please sign in again.")
    except jwt.PyJWTError:
        raise AppError(401, "invalid_token", "Invalid session token")

    tenant = await tenancy.get_tenant(payload.get("tid", ""))
    if not tenant:
        raise AppError(401, "invalid_token", "Unknown tenant")
    if tenant["status"] != "active":
        raise AppError(403, "tenant_inactive", f"This institution is {tenant['status']}. Contact support.")
    header_tenant = request.headers.get("x-tenant-id")
    if header_tenant and header_tenant != tenant["slug"]:
        raise AppError(403, "tenant_mismatch", "X-Tenant-Id does not match the authenticated tenant")

    async with db.connection(tenant["db_name"]) as conn:
        row = await conn.fetchrow(
            """SELECT s.id AS session_id, s.revoked_at, s.expires_at < now() AS expired, s.impersonator_user_id,
                      u.id, u.name, u.email, u.status, u.role_key, u.staff_id, u.student_id, u.guardian_id,
                      r.name AS role_name, r.permissions
               FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.key = u.role_key
               WHERE s.jti = $1""", payload.get("jti"))
        if not row or row["revoked_at"] or row["expired"]:
            raise AppError(401, "session_revoked", "Your session is no longer valid. Please sign in again.")
        if row["status"] != "active":
            raise AppError(401, "account_inactive", "This account is inactive")
        linked: list[str] = []
        if row["guardian_id"]:
            linked = [str(r["student_id"]) for r in await conn.fetch(
                """SELECT student_id FROM guardian_student_links
                   WHERE guardian_id = $1 AND status = 'active' AND deleted_at IS NULL""", row["guardian_id"])]
        elif row["student_id"]:
            linked = [str(row["student_id"])]
        disabled = frozenset(r["module_code"] for r in await conn.fetch(
            "SELECT module_code FROM feature_flags WHERE enabled = false AND deleted_at IS NULL"))

    ctx = Ctx(
        user_id=str(row["id"]), name=row["name"], email=row["email"], role=row["role_key"],
        role_name=row["role_name"], permissions=frozenset(row["permissions"] or []),
        tenant_id=str(tenant["id"]), tenant_slug=tenant["slug"], tenant_name=tenant["name"],
        db_name=tenant["db_name"], session_id=str(row["session_id"]),
        staff_id=str(row["staff_id"]) if row["staff_id"] else None,
        student_id=str(row["student_id"]) if row["student_id"] else None,
        guardian_id=str(row["guardian_id"]) if row["guardian_id"] else None,
        linked_student_ids=linked,
        impersonator_id=str(row["impersonator_user_id"]) if row["impersonator_user_id"] else None,
        disabled_modules=disabled,
        request_id=getattr(request.state, "request_id", None),
        ip=request.client.host if request.client else None,
        device=(request.headers.get("user-agent") or "")[:200],
    )
    request.state.tenant_slug = ctx.tenant_slug
    request.state.user_id = ctx.user_id
    return ctx


def require(*perms: str):
    """Dependency: authenticated user holding ANY of the given permissions."""
    async def dependency(ctx: Ctx = Depends(current_ctx)) -> Ctx:
        if perms and not ctx.has(*perms):
            raise forbidden()
        return ctx
    return dependency


def module_guard(module_code: str):
    """Router dependency: blocks access when a module is disabled for the tenant."""
    async def dependency(ctx: Ctx = Depends(current_ctx)) -> None:
        if module_code in ctx.disabled_modules:
            raise AppError(403, "module_disabled", f"Module {module_code} is disabled for this institution")
    return dependency


# --- row-level scoping helpers --------------------------------------------------------
async def can_view_student(conn, ctx: Ctx, student_id: str) -> bool:
    if ctx.has("sis.students.view_all"):
        return True
    if str(student_id) in ctx.linked_student_ids:
        return True
    if ctx.staff_id and ctx.has("sis.students.view_class"):
        return bool(await conn.fetchval(
            """SELECT 1 FROM enrollments e JOIN course_sections cs ON cs.id = e.section_id
               LEFT JOIN courses c ON c.id = cs.course_id
               LEFT JOIN departments d ON d.id = c.department_id
               WHERE e.student_id = $1 AND e.deleted_at IS NULL
                 AND (cs.teacher_staff_id = $2 OR d.head_staff_id = $2) LIMIT 1""", student_id, ctx.staff_id))
    return False


async def assert_student_access(conn, ctx: Ctx, student_id: str) -> None:
    if not await can_view_student(conn, ctx, student_id):
        raise forbidden("You do not have access to this student")


def assert_family_scope(ctx: Ctx, student_id: str) -> None:
    """For self-service actions: the student must be the user or a linked child."""
    if str(student_id) not in ctx.linked_student_ids:
        raise forbidden("You can only act for your own / linked student")
