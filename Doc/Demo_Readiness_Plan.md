# NexusCampus AI — Demo Readiness Analysis & Plan (non-AI)

> Analysis date: 2026-09-14 · Scope: everything **except** AI integrations
> Goal: a demo where **every number, row and button is backed by PostgreSQL via the API** — no hardcoded arrays, no `alert()` fakes, no silent fallbacks.

---

## 1. Current State — Verified Facts

### 1.1 Infrastructure
- **PostgreSQL 15 (Docker):** running, healthy. DBs: `nexus_master`, `nexus_default_demo` (template), `nexus_tenant_greenwood`, `nexus_tenant_oxfordbay`.
- **Backend:** one FastAPI process (`services.gateway.main`) mounting 4 routers. "Microservice" ports 8001–8003 in `config.py` are unused.
- **Frontend:** Vite + React 18 + TS + Tailwind. `tsc -b` **passes**. ESLint: **96 problems** (75 `no-explicit-any`, 17 unused vars, 4 fast-refresh).
- **mock-platform:** 64 JSON files + TS types; imported directly into the frontend via `@mock-platform` alias.

### 1.2 Backend API (what exists in code)
| Area | Endpoints | Gaps |
| :--- | :--- | :--- |
| Auth | login, me, demo-accounts, logout | JWT never enforced on any other route |
| Tenants | onboard (clone), list, reset | Unauthenticated; anyone can clone/drop DBs |
| Students / Staff | list, create, delete | No GET-by-id, no update |
| Invoices | list, create, update status | **Status update 500s (bug, see §2)**; create writes `student_id='STU-NEW'` |
| Module records (M01–M64) | list, create, delete, status | Not used by the frontend; `module_workflows` has no endpoint |
| Courses / Timetable | GET only | `timetable_slots` table has **0 rows** |
| Library loans, Leaves, Grades, Placement | list/create/status | No books table; grades seeded only for 1 student |
| Admissions | — | `admissions_leads` table exists, **0 rows, no endpoint** |

### 1.3 Seed data (per tenant DB)
students 5 · staff 6 · courses 4 · invoices 6 · leads 0 · timetable 0 · module_records 320 · workflows 192 · users 7 · loans 3 · leaves 2 · grades 4 · drives 5 · applications 2

**Seed inconsistencies:**
- Grades use course codes `CS-101`, `AI-201`, `MA-201`, which don't exist in `courses`. `CS-301` is a different course title in each table.
- Invoice `INV-2026-006` references `STU-1008 Sophia Martinez`, who is not in `students`.
- Hostel UI references `STU-1006…1009`, which are not in the DB.
- No foreign keys anywhere, so nothing prevents orphan rows.

### 1.4 Frontend page data-source matrix
| Status | Pages |
| :--- | :--- |
| **API-backed but with static seed + silent fallback** | StudentDirectory, StaffDirectory, Finance, LibraryCatalog (loans only), DailyAttendance (leaves only; roll-call uses `MOCK_STUDENTS`), Gradebook (roster from `MOCK_STUDENTS`), PlacementHub, CampusSetup, Topbar tenant switcher |
| **100% static (inline arrays / `alert()`)** | Dashboard, AdmissionsPipeline, StudentProfile, StudentWellbeing, ParentPortal, BroadcastHub, CourseCatalogue, CoursePlayer, CourseBuilder, AuthoringStudio, QuizEngine, Timetable, HostelManagement, FleetTracking, PayrollDashboard, AccreditationDashboard, InventoryAssets, CafeteriaPOS, VisitorSecurity |
| **Generic page for 40 "planned" modules** | `ModulePlaceholderPage` reads `@mock-platform` JSON in memory, even though `/api/v1/core/modules/{code}/records` exists |

- Registry: **24 implemented / 40 planned** modules. UI checklist: **13 of 617** items ticked.
- **20+ `alert()` calls** stand in for real actions: payslip download, POS payment, PTM booking, gate pass, bed allocation, SSR export, and more.

---

## 2. Critical Blockers (would break or fake the demo)

| # | Issue | Evidence | Fix |
| :--- | :--- | :--- | :--- |
| B1 | **Running backend is stale.** Process started 15:42; `core_service/routes.py` edited 16:13; no `--reload`. | `/openapi.json` lacks library/leaves/grades/placement routes, which return 404. The UI silently falls back to static data, so **it looks like it works but nothing persists.** | Restart the backend; use `--reload` in dev; add a health check that lists route count. |
| B2 | **"Mark invoice Paid" always returns 500.** | `PREPARE` confirms: *inconsistent types deduced for parameter $1 (text vs varchar)*. Same pattern in the library loan status update (`$1` in `SET` and `CASE`). | Cast the parameters (`$1::varchar`) in both queries. |
| B3 | **No user↔student/parent/staff link.** | `users.id = USR-STU-01`, `students.id = STU-1001`. Pages pass `user.id` as `student_id`, so the student sees nothing and the fallback hardcodes `STU-1001` / "Emma Watson". The parent has no child link. | Add `users.linked_student_id` / `linked_staff_id`; expose them in the JWT and `/me`. |
| B4 | **No auth enforcement.** | Frontend: no route guard, and `AuthContext` **defaults to Super Admin** when localStorage is empty. Backend: `/core/*` returns 200 without a token. `X-Tenant-Id` header is trusted over the JWT's `tenant_db`. | `get_current_user` dependency + role checks; tenant resolved from the JWT; `ProtectedRoute` on the frontend. |
| B5 | **Silent fallbacks and optimistic UI without rollback.** | ~25 `console.warn('... offline fallback')`; create student/staff is added locally even if the API fails; `RegisterStudentModal` generates a random ID client-side. | Remove fallbacks; show error toasts; refetch after mutations. |
| B6 | **Broken nav link.** | Registry route `/career/placements` vs App route `/career/placement`. | Fix the registry route. |
| B7 | **Not reproducible from scratch.** | `requirements.txt` missing `PyJWT`; `users` and workflow tables created by 2 extra scripts with **hardcoded tenant DB names**; no README/run guide/`.env.example`. | One `setup_db.py` (schema + seed into template → re-clone tenants) and one start script. |
| B8 | **Hardcoded dates.** | Backend writes `'2026-09-14'` for issue/return/applied dates; Timetable shows "Monday, Oct 24". | Use `CURRENT_DATE` / `NOW()`; compute week days on the client. |
| B9 | **Likely:** tenant onboarding kills the gateway's own pooled connections to the template DB (`pg_terminate_backend`), so the next request against the default tenant may error once. | Code reading; **verify in rehearsal**. | Close the template pool before cloning, or retry once on `ConnectionDoesNotExistError`. |

---

## 3. Definition of "No Static Data" (demo acceptance rule)
1. Every list, KPI, chart and badge comes from an API call backed by PostgreSQL. Aggregates are computed with SQL (`COUNT`, `SUM`, `AVG`), not typed into JSX.
2. Seed data lives **only** in the DB seed script, never in `.tsx` files. Delete `frontend/src/mock/` and the `@mock-platform` imports.
3. Every button either performs a persisted mutation (visible after browser refresh) or is removed. **No `alert()`.**
4. API failure shows a visible error state. Nothing silently falls back.
5. A module that is not DB-backed is **hidden** from the sidebar/command palette in demo mode rather than shown half-working.
6. AI badges/tags are hidden behind a feature flag (`AI_ENABLED=false`); core flows never call `/api/v1/ai/*`.

---

## 4. Work Plan

### Phase 0 — Foundation & Reproducibility (~1 day)
- [ ] Add `PyJWT` to `requirements.txt`; add `backend/.env.example` and `frontend/.env.example` (`VITE_API_URL`).
- [ ] Replace the 3 init scripts with one idempotent `scripts/setup_db.py`:
  - schema as ordered SQL files (`backend/db/schema/*.sql`) with **foreign keys**;
  - deterministic seed (fixed random seed, dates relative to `CURRENT_DATE`);
  - applies to the template DB, then re-clones every tenant in the `tenants` table.
- [ ] `scripts/reset_demo.py`: drop tenant DBs, re-seed the template, re-onboard `greenwood`.
- [ ] `start-demo.ps1`: `docker compose up -d` → wait for `/health` → uvicorn → `npm run dev`.
- [ ] Root `README.md` with setup, run, reset and demo credentials.

### Phase 1 — Identity, Auth & Tenancy (~1.5 days)
- [ ] `users`: add `linked_student_id`, `linked_staff_id`. Seed Emma→`STU-1001`, Arthur→parent of `STU-1001`, Turing→`FAC-01`, Knuth→`FAC-06`, Jenkins→`FAC-04`.
- [ ] Backend `get_current_user` dependency on **all** `/core/*` and `/tenants/*` routes (tenant routes: admin only).
- [ ] Resolve the tenant DB **from the JWT**; reject a mismatching `X-Tenant-Id` with 403.
- [ ] `require_roles(...)` per route. Student/parent endpoints are scoped server-side to the linked student, never by a client-sent `student_id`.
- [ ] Frontend: `ProtectedRoute` + role route guard (reuse `ROLE_PERMISSIONS`); remove the default-admin fallback; a 401 logs out.
- [ ] Tenant selector moves to the login page. Switching tenant forces re-login.
- [ ] Login persona grid loads from `/auth/demo-accounts`; remove the duplicated `DEMO_PERSONAS`.

### Phase 2 — API Hardening & Client Cleanup (~1.5 days)
- [ ] Fix B2 (typed params). Return 404 when an UPDATE/DELETE affects 0 rows.
- [ ] Add `GET /students/{id}` (360° aggregate), `PUT /students/{id}`, `PUT /staff/{id}`.
- [ ] Pydantic models for every body (replace `Dict[str, Any]`).
- [ ] Central exception handler and structured logging with module, tenant, user (per Development Rules §5).
- [ ] Frontend: typed API client, a shared `useApiQuery`/`useMutation` hook, and a toast system. Replace every `alert()`.
- [ ] Loading / empty / error states on every page.
- [ ] Remove `MOCK_*` imports, `frontend/src/mock/`, the `@mock-platform` alias, and every `console.warn(... fallback)`.
- [ ] Fix B6 and the lint errors.

### Phase 3 — Convert Static Pages to DB-backed

**Tier A — Demo Core (must have; matches "Wave 1 – Sellable core" in `Initial_plan.html`)**

| Page | New / changed tables | Endpoints | Est. |
| :--- | :--- | :--- | :--- |
| Dashboard (role-aware) | — (SQL aggregates) | `GET /core/dashboard/summary` | 1d |
| Admissions Pipeline | `admissions_leads` (exists) | leads CRUD, `PUT stage`, `POST /leads/{id}/enroll` → creates student + tuition invoice | 1d |
| Student Directory / Profile | `student_documents` (metadata) | `GET/PUT /students/{id}`, profile aggregates (grades, invoices, leaves, loans, attendance) | 1d |
| Courses (Catalogue) | `enrollments` | courses POST/PUT, enroll | 0.5d |
| Timetable | `timetable_slots` (seed) | slot CRUD, filters by teacher / student program | 0.5d |
| Daily Attendance | `attendance_records(date, course_code, student_id, status)` | roster by course, bulk mark, `%` computed | 1d |
| Gradebook + Exam publish | `course_grades` (seed all students, valid FKs) | teacher mark entry, submit, examiner publish per course | 1d |
| Finance / Fees | `payments` (receipt rows) | fix status bug, record payment, receipt view (printable HTML) | 0.5d |
| Parent Portal | `ptm_bookings` | child summary via linked student, pay invoice, book PTM | 0.5d |
| Broadcast Hub | `announcements(audience_roles)` | create, list-for-my-role | 0.5d |
| Staff Directory | — | remove fallback, add update | 0.25d |
| Payroll | `payroll_runs`, `payslips`; numeric `staff.base_salary` | run month, list payslips, printable payslip | 1d |
| Library | `library_books(copies_total/available)` | book CRUD, loans update availability | 0.5d |
| Placement Hub | drives (exist) | officer creates drives; keep application pipeline | 0.25d |

**Tier B — Daily Operations (build, or hide in demo mode)**

| Page | Tables | Est. |
| :--- | :--- | :--- |
| Hostel | `hostel_rooms`, `hostel_beds`, `gate_passes` | 0.75d |
| Transport | `buses`, `bus_routes`, `route_stops` (last-known position stored; no live GPS) | 0.75d |
| Cafeteria POS | `menu_items`, `pos_orders`, `student_wallets` | 0.75d |
| Inventory & Assets | `assets`, `requisitions` | 0.75d |
| Visitor & Security | `visitor_logs`, `vehicle_logs` | 0.5d |
| Student Wellbeing | `wellbeing_cases`, `discipline_records` (restricted roles) | 0.75d |
| Accreditation | `accreditation_criteria`, `evidence_documents` (+ local file upload) | 1d |

**Tier C — LMS (build, or hide in demo mode)**
- Tables: `course_modules`, `lessons`, `lesson_progress`, `quizzes`, `quiz_questions`, `quiz_attempts`.
- Pages: CourseBuilder, AuthoringStudio (save lesson content), CoursePlayer (progress), QuizEngine (attempt + auto-grade). **Est. 2–3d.**

**Tier D — 40 planned modules**
- Point `ModulePlaceholderPage` at the existing `/modules/{code}/records` API. Add `GET /modules/{code}/workflows`; compute KPIs from record counts by status. **Est. 0.5d.**
- Replace the JSON "simulated payload" names ("Fees & Finance Record #1") with realistic seed rows, or hide Tier D in demo mode.

### Phase 4 — Demo Reliability (~1 day)
- [ ] **Realistic seed volume:** ~40 students / 4 programs, 12 staff, 8 courses, ~25 timetable slots, 30 days of attendance, invoices per student, 15 leads across stages, 20 books, payroll for last month.
- [ ] **Backend smoke tests:** `pytest` + `httpx`, one test per endpoint, plus role-denial tests and a tenant isolation test.
- [ ] **E2E demo-script test:** Playwright run of §5 against a freshly reset DB.
- [ ] **Demo-mode flag:** hides non-DB-backed modules and AI tags.
- [ ] **Rehearsal checklist:** reset → start → run §5 twice → refresh browser at each step to prove persistence.

**Rough total (1 developer):** Phases 0–2 ≈ 4 days · Tier A ≈ 9 days · Phase 4 ≈ 1 day → **~2.5–3 weeks for a clean Demo Core**. Add Tier B ≈ 5 days, Tier C ≈ 3 days, Tier D ≈ 0.5 day if the full surface must be shown.

---

## 5. Demo Script (~20 min, end-to-end, all live data)

| Step | Persona | Action | Proof it's real |
| :--- | :--- | :--- | :--- |
| 1 | — | Open `/dashboard` without logging in | Redirected to `/login` |
| 2 | Super Admin | Dashboard KPIs → Campus Setup → onboard **"Riverside Academy"** | New DB in the tenant list |
| 3 | Super Admin | Log in to Riverside, add a student; switch back to default | Student exists only in Riverside (isolation) |
| 4 | Super Admin (default) | Admissions: create lead → move stages → **Enroll** | Appears in Student Directory; tuition invoice auto-created in Finance |
| 5 | Teacher (Turing) | Timetable → today's class → mark attendance → Gradebook: enter marks → Submit | Refresh keeps data; student attendance % changes |
| 6 | Chief Examiner (Knuth) | Review submitted grades → Publish | Status `published`, moderator = Knuth |
| 7 | Student (Emma) | Dashboard shows new attendance %, published grades; request a library book; apply for leave; apply to Google drive | Own data only; `/hr/staff` is blocked |
| 8 | Teacher | Approve Emma's leave; Admin approves the loan | Book availability decremented |
| 9 | Parent (Arthur) | Sees Emma's grades, attendance, leave status → pays the pending invoice → receipt | Finance shows Paid; dashboard collection KPI increases |
| 10 | HR (Jenkins) | Add staff member → run payroll for the month → open a payslip | Payslip rows exist for all active staff |
| 11 | Placement Officer (Vance) | Shortlist → offer Emma; Emma accepts | Pipeline stage updated for both personas |
| 12 | Super Admin | Broadcast announcement to students + parents → reset the Riverside tenant | Emma and Arthur see it; Riverside returns to template state |

---

## 6. Recommended Order
1. **Today:** restart the backend (B1) and fix the invoice/loan SQL bug (B2). These are 10-minute fixes that currently make working pages look broken or fake.
2. Phase 0 → Phase 1 → Phase 2. Identity linkage and auth must come before converting pages, or every page gets rewritten twice.
3. Tier A pages in demo-script order: Admissions → Students → Timetable/Attendance → Gradebook → Finance/Parent → Library/Placement → Payroll → Broadcast → Dashboard (last, since it aggregates everything).
4. Phase 4 rehearsal. Then decide: build Tier B/C, or hide them behind demo mode.
