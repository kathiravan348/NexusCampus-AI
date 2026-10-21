import json
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Header, HTTPException, Query
from ..common.models import StudentCreate, StaffCreate, InvoiceCreate, ModuleRecordCreate
from ..common.db_manager import db_manager

router = APIRouter(prefix="/api/v1/core", tags=["Core Campus Operations (Multi-Tenant)"])

def get_target_db(x_tenant_id: Optional[str] = None) -> str:
    return db_manager.resolve_tenant_db(x_tenant_id)

# ----------------------------------------------------
# Institution Settings
# ----------------------------------------------------
@router.get("/institution")
async def get_institution_settings(x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM institution_settings WHERE id = 1;")
        if not row:
            return {"institution_name": "NexusCampus Institute", "admin_email": "admin@nexuscampus.edu", "db_name": db_name}
        data = dict(row)
        data["db_name"] = db_name
        data["tenant_id"] = x_tenant_id or "default"
        return data

@router.put("/institution")
async def update_institution_settings(payload: Dict[str, Any], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE institution_settings
            SET institution_name = COALESCE($1, institution_name),
                campus_name = COALESCE($2, campus_name),
                updated_at = NOW()
            WHERE id = 1;
        """, payload.get("institution_name"), payload.get("campus_name"))
        return {"status": "success", "db_name": db_name}

# ----------------------------------------------------
# Students (M04 Student Management)
# ----------------------------------------------------
@router.get("/students")
async def list_students(
    search: Optional[str] = None,
    program: Optional[str] = None,
    status: Optional[str] = None,
    x_tenant_id: Optional[str] = Header(None)
):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        query = "SELECT * FROM students WHERE 1=1"
        params = []
        if search:
            params.append(f"%{search}%")
            query += f" AND (name ILIKE ${len(params)} OR email ILIKE ${len(params)} OR id ILIKE ${len(params)})"
        if program:
            params.append(f"%{program}%")
            query += f" AND program ILIKE ${len(params)}"
        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"
        query += " ORDER BY name ASC LIMIT 200;"
        rows = await conn.fetch(query, *params)
        students = []
        for r in rows:
            d = dict(r)
            if "gpa" in d and d["gpa"] is not None:
                d["gpa"] = float(d["gpa"])
            if "attendance_rate" in d and d["attendance_rate"] is not None:
                d["attendance_rate"] = float(d["attendance_rate"])
            if "outstanding_amount" in d and d["outstanding_amount"] is not None:
                d["outstanding_amount"] = float(d["outstanding_amount"])
            if "created_at" in d and d["created_at"] is not None:
                d["created_at"] = d["created_at"].isoformat()
            students.append(d)
        return students

@router.post("/students")
async def create_student(payload: StudentCreate, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    new_id = f"STU-{uuid.uuid4().hex[:6].upper()}"
    avatar = f"https://api.dicebear.com/7.x/avataaars/svg?seed={payload.name.replace(' ', '')}"
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO students (
                id, name, email, phone, avatar, program, cohort, semester, gpa,
                attendance_rate, fee_status, outstanding_amount, admissions_stage,
                advisor, guardian_name, guardian_phone, status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                95.0, $10, 0.0, 'enrolled',
                $11, 'Parent/Guardian', '+1-555-0100', 'active'
            )
        """, new_id, payload.name, payload.email, payload.phone, avatar,
             payload.program, payload.cohort, payload.semester, payload.gpa,
             payload.fee_status, payload.advisor)
        return {"id": new_id, "name": payload.name, "db_name": db_name, "status": "created"}

@router.delete("/students/{student_id}")
async def delete_student(student_id: str, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        res = await conn.execute("DELETE FROM students WHERE id = $1;", student_id)
        return {"student_id": student_id, "db_name": db_name, "result": res}

# ----------------------------------------------------
# Staff (M05 Staff Directory)
# ----------------------------------------------------
@router.get("/staff")
async def list_staff(x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM staff ORDER BY name ASC;")
        staff_list = []
        for r in rows:
            d = dict(r)
            if "created_at" in d and d["created_at"] is not None:
                d["created_at"] = d["created_at"].isoformat()
            staff_list.append(d)
        return staff_list

@router.post("/staff")
async def create_staff(payload: StaffCreate, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    new_id = f"STF-{uuid.uuid4().hex[:6].upper()}"
    avatar = f"https://api.dicebear.com/7.x/avataaars/svg?seed={payload.name.replace(' ', '')}"
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO staff (id, name, email, role, department, avatar, joining_date, salary_band, courses_count, status)
            VALUES ($1, $2, $3, $4, $5, $6, '2026-01-15', $7, 3, 'active')
        """, new_id, payload.name, payload.email, payload.role, payload.department, avatar, payload.salary_band)
        return {"id": new_id, "name": payload.name, "db_name": db_name, "status": "created"}

@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        res = await conn.execute("DELETE FROM staff WHERE id = $1;", staff_id)
        return {"staff_id": staff_id, "db_name": db_name, "result": res}

# ----------------------------------------------------
# Invoices (M07 Student Finance)
# ----------------------------------------------------
@router.get("/invoices")
async def list_invoices(x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM invoices ORDER BY created_at DESC;")
        invoices = []
        for r in rows:
            d = dict(r)
            if "amount" in d and d["amount"] is not None:
                d["amount"] = float(d["amount"])
            if "paid_amount" in d and d["paid_amount"] is not None:
                d["paid_amount"] = float(d["paid_amount"])
            if "created_at" in d and d["created_at"] is not None:
                d["created_at"] = d["created_at"].isoformat()
            invoices.append(d)
        return invoices

@router.post("/invoices")
async def create_invoice(payload: InvoiceCreate, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    new_id = f"INV-{uuid.uuid4().hex[:6].upper()}"
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO invoices (id, student_id, student_name, fee_type, amount, paid_amount, due_date, status)
            VALUES ($1, 'STU-NEW', $2, $3, $4, 0.0, $5, 'Pending')
        """, new_id, payload.student_name, payload.fee_type, payload.amount, payload.due_date)
        return {"id": new_id, "student_name": payload.student_name, "amount": payload.amount, "status": "Pending"}

@router.put("/invoices/{invoice_id}/status")
async def update_invoice_status(invoice_id: str, payload: Dict[str, str], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    new_status = payload.get("status", "Paid")
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        await conn.execute("UPDATE invoices SET status = $1, paid_amount = CASE WHEN $1 = 'Paid' THEN amount ELSE paid_amount END WHERE id = $2;", new_status, invoice_id)
        return {"invoice_id": invoice_id, "status": new_status, "db_name": db_name}

# ----------------------------------------------------
# 64 Modules Dynamic Records (M01 - M64)
# ----------------------------------------------------
@router.get("/modules/{module_code}/records")
async def list_module_records(module_code: str, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    clean_code = module_code.upper()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM module_records WHERE module_id = $1 ORDER BY updated_at DESC;", clean_code)
        records = []
        for r in rows:
            d = dict(r)
            if "updated_at" in d and d["updated_at"] is not None:
                d["updated_at"] = d["updated_at"].isoformat()
            if "tags" in d and isinstance(d["tags"], str):
                try:
                    d["tags"] = json.loads(d["tags"])
                except Exception:
                    d["tags"] = []
            records.append(d)
        return records

@router.post("/modules/{module_code}/records")
async def create_module_record(module_code: str, payload: ModuleRecordCreate, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    clean_code = module_code.upper()
    new_id = f"REC-{clean_code}-{uuid.uuid4().hex[:6].upper()}"
    tags_json = json.dumps([payload.category, "Custom"])
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO module_records (id, module_id, name, reference_code, scope, status, tags, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        """, new_id, clean_code, payload.name, payload.reference_code, payload.scope, payload.status, tags_json, payload.notes)
        return {"id": new_id, "module_id": clean_code, "name": payload.name, "status": payload.status}

@router.delete("/modules/{module_code}/records/{record_id}")
async def delete_module_record(module_code: str, record_id: str, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        res = await conn.execute("DELETE FROM module_records WHERE id = $1 AND module_id = $2;", record_id, module_code.upper())
        return {"record_id": record_id, "result": res}

@router.put("/modules/{module_code}/records/{record_id}/status")
async def update_module_record_status(module_code: str, record_id: str, payload: Dict[str, str], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    new_status = payload.get("status", "active")
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        await conn.execute("UPDATE module_records SET status = $1, updated_at = NOW() WHERE id = $2 AND module_id = $3;", new_status, record_id, module_code.upper())
        return {"record_id": record_id, "status": new_status}

# ----------------------------------------------------
# Courses (M08 LMS Course Builder) & Timetable (M06)
# ----------------------------------------------------
@router.get("/courses")
async def list_courses(x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM courses ORDER BY code ASC;")
        res = []
        for r in rows:
            d = dict(r)
            if "rating" in d and d["rating"] is not None:
                d["rating"] = float(d["rating"])
            if "created_at" in d and d["created_at"] is not None:
                d["created_at"] = d["created_at"].isoformat()
            res.append(d)
        return res

@router.get("/timetable")
async def list_timetable(x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM timetable_slots ORDER BY day_name, time_slot;")
        res = []
        for r in rows:
            d = dict(r)
            if "duration_hours" in d and d["duration_hours"] is not None:
                d["duration_hours"] = float(d["duration_hours"])
            res.append(d)
        return res

# ----------------------------------------------------
# M17 Library Management (Borrow Requests & Loans)
# ----------------------------------------------------
@router.get("/library/loans")
async def list_library_loans(student_id: Optional[str] = None, status: Optional[str] = None, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        query = "SELECT * FROM library_loans WHERE 1=1"
        params = []
        if student_id:
            params.append(student_id)
            query += f" AND student_id = ${len(params)}"
        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"
        query += " ORDER BY created_at DESC;"
        rows = await conn.fetch(query, *params)
        res = []
        for r in rows:
            d = dict(r)
            if "fine_amount" in d and d["fine_amount"] is not None:
                d["fine_amount"] = float(d["fine_amount"])
            if "created_at" in d and d["created_at"] is not None:
                d["created_at"] = d["created_at"].isoformat()
            res.append(d)
        return res

@router.post("/library/loans")
async def request_library_loan(payload: Dict[str, Any], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    loan_id = f"LN-{uuid.uuid4().hex[:6].upper()}"
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO library_loans (
                id, book_id, book_title, isbn, student_id, student_name,
                loan_days, issue_date, due_date, status, notes
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            )
        """, loan_id, payload["book_id"], payload["book_title"], payload.get("isbn", ""),
             payload["student_id"], payload["student_name"], int(payload.get("loan_days", 14)),
             payload.get("issue_date", "2026-09-14"), payload.get("due_date", "2026-09-28"),
             payload.get("status", "pending_approval"), payload.get("notes", ""))
        return {"id": loan_id, "status": payload.get("status", "pending_approval"), "book_title": payload["book_title"]}

@router.put("/library/loans/{loan_id}/status")
async def update_library_loan_status(loan_id: str, payload: Dict[str, Any], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    new_status = payload.get("status", "active")
    renewed = payload.get("renewed_count", 0)
    fine = payload.get("fine_amount", 0.0)
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE library_loans
            SET status = $1,
                renewed_count = GREATEST(renewed_count, $2),
                fine_amount = $3,
                due_date = COALESCE($4, due_date),
                return_date = CASE WHEN $1 = 'returned' THEN '2026-09-14' ELSE return_date END
            WHERE id = $5;
        """, new_status, int(renewed), float(fine), payload.get("due_date"), loan_id)
        return {"loan_id": loan_id, "status": new_status}

# ----------------------------------------------------
# M09 Attendance & Student Leave Applications
# ----------------------------------------------------
@router.get("/attendance/leaves")
async def list_student_leaves(student_id: Optional[str] = None, status: Optional[str] = None, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        query = "SELECT * FROM student_leaves WHERE 1=1"
        params = []
        if student_id:
            params.append(student_id)
            query += f" AND student_id = ${len(params)}"
        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"
        query += " ORDER BY created_at DESC;"
        rows = await conn.fetch(query, *params)
        res = []
        for r in rows:
            d = dict(r)
            if "created_at" in d and d["created_at"] is not None:
                d["created_at"] = d["created_at"].isoformat()
            res.append(d)
        return res

@router.post("/attendance/leaves")
async def apply_student_leave(payload: Dict[str, Any], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    leave_id = f"LV-{uuid.uuid4().hex[:6].upper()}"
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO student_leaves (id, student_id, student_name, leave_type, start_date, end_date, days_count, reason, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
        """, leave_id, payload["student_id"], payload["student_name"], payload.get("leave_type", "Personal"),
             payload["start_date"], payload["end_date"], int(payload.get("days_count", 1)), payload.get("reason", ""))
        return {"id": leave_id, "status": "pending", "student_name": payload["student_name"]}

@router.put("/attendance/leaves/{leave_id}/status")
async def update_leave_status(leave_id: str, payload: Dict[str, Any], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    new_status = payload.get("status", "approved")
    reviewer = payload.get("reviewed_by", "Faculty Dean")
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE student_leaves
            SET status = $1, reviewed_by = $2
            WHERE id = $3;
        """, new_status, reviewer, leave_id)
        return {"leave_id": leave_id, "status": new_status}

# ----------------------------------------------------
# M11 Academics & Gradebook Moderation
# ----------------------------------------------------
@router.get("/academics/grades")
async def list_course_grades(student_id: Optional[str] = None, course_code: Optional[str] = None, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        query = "SELECT * FROM course_grades WHERE 1=1"
        params = []
        if student_id:
            params.append(student_id)
            query += f" AND student_id = ${len(params)}"
        if course_code:
            params.append(course_code)
            query += f" AND course_code = ${len(params)}"
        query += " ORDER BY course_code ASC;"
        rows = await conn.fetch(query, *params)
        res = []
        for r in rows:
            d = dict(r)
            if "internal_score" in d and d["internal_score"] is not None:
                d["internal_score"] = float(d["internal_score"])
            if "final_score" in d and d["final_score"] is not None:
                d["final_score"] = float(d["final_score"])
            if "total_score" in d and d["total_score"] is not None:
                d["total_score"] = float(d["total_score"])
            if "gpa_points" in d and d["gpa_points"] is not None:
                d["gpa_points"] = float(d["gpa_points"])
            if "created_at" in d and d["created_at"] is not None:
                d["created_at"] = d["created_at"].isoformat()
            res.append(d)
        return res

@router.put("/academics/grades/publish")
async def publish_official_grades(payload: Dict[str, Any], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    moderator = payload.get("moderated_by", "Prof. Donald Knuth (Chief Examiner)")
    async with pool.acquire() as conn:
        await conn.execute("UPDATE course_grades SET status = 'published', moderated_by = $1;", moderator)
        return {"status": "published", "moderated_by": moderator}

# ----------------------------------------------------
# M56 Placement Hub & Career Drives
# ----------------------------------------------------
@router.get("/placement/drives")
async def list_placement_drives(x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM placement_drives ORDER BY drive_date ASC;")
        res = []
        for r in rows:
            d = dict(r)
            if "min_gpa" in d and d["min_gpa"] is not None:
                d["min_gpa"] = float(d["min_gpa"])
            res.append(d)
        return res

@router.get("/placement/applications")
async def list_placement_applications(student_id: Optional[str] = None, x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    async with pool.acquire() as conn:
        query = "SELECT * FROM placement_applications WHERE 1=1"
        params = []
        if student_id:
            params.append(student_id)
            query += f" AND student_id = ${len(params)}"
        query += " ORDER BY updated_at DESC;"
        rows = await conn.fetch(query, *params)
        res = []
        for r in rows:
            d = dict(r)
            if "updated_at" in d and d["updated_at"] is not None:
                d["updated_at"] = d["updated_at"].isoformat()
            res.append(d)
        return res

@router.post("/placement/applications")
async def apply_for_placement_drive(payload: Dict[str, Any], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    app_id = f"APP-{uuid.uuid4().hex[:6].upper()}"
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO placement_applications (
                id, drive_id, company_name, role_title, student_id, student_name, stage, offer_package, applied_date
            ) VALUES (
                $1, $2, $3, $4, $5, $6, 'applied', $7, '2026-09-14'
            )
        """, app_id, payload["drive_id"], payload["company_name"], payload["role_title"],
             payload["student_id"], payload["student_name"], payload.get("offer_package", ""))
        return {"id": app_id, "stage": "applied", "company_name": payload["company_name"]}

@router.put("/placement/applications/{app_id}/stage")
async def update_application_stage(app_id: str, payload: Dict[str, Any], x_tenant_id: Optional[str] = Header(None)):
    db_name = get_target_db(x_tenant_id)
    pool = await db_manager.get_async_pool(db_name)
    new_stage = payload.get("stage", "shortlisted")
    offer_pkg = payload.get("offer_package")
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE placement_applications
            SET stage = $1,
                offer_package = COALESCE($2, offer_package),
                updated_at = NOW()
            WHERE id = $3;
        """, new_stage, offer_pkg, app_id)
        return {"app_id": app_id, "stage": new_stage}
