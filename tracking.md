# NexusCampus-AI — Multi-Agent Project Execution & Memory Log
> **CRITICAL PROTOCOL FOR ALL AGENTS:**
> This file is the shared, authoritative memory log for this repository. Multiple agents operate on this codebase concurrently.
> 1. **BEFORE STARTING ANY TASK**: Read this file completely to understand the latest state, active work, schema decisions, and unblocked tasks.
> 2. **DURING WORK**: Log your session header, start time, target focus, files touched, and architectural decisions.
> 3. **UPON COMPLETION / HANDOFF**: Update this file with your end time, accomplishments, testing status, and clear next steps for the next agent.

---

## Quick Reference & Architecture Topology
- **Frontend Stack**: React 18, TypeScript, Vite, Tailwind CSS / Vanilla CSS design tokens, Lucide Icons. Running at `http://localhost:5173`.
- **Backend Architecture**: Modular Monolith via FastAPI (`backend/services/gateway/main.py`). Running at `http://localhost:8000`.
  - Service Module Pattern: `backend/services/modules/<module_name>.py`.
  - Base utilities: `backend/services/modules/_base.py` (`Model`, `Where`, `must`, `paged`, `current_term`, etc.).
  - Gateway dynamic loader automatically registers `router`, `files_router`, `notifications_router`, `public_router` from `MODULES`.
- **Database**: PostgreSQL 15 (Docker port 5432).
  - Master DB: `nexus_master` (tenants registry, global users, auth audit).
  - Template DB: `nexus_template` (golden schema with all 64-module tables, read-only template for instant tenant clone).
  - Tenant DBs: `nexus_tenant_demo`, `nexus_default_demo`, etc.
  - User/Pass: `postgres:postgrespassword` (admin), `nexus_app:nexus_app_password` (app role).
- **Core Personas & Demo Accounts** (Password: `demo123`):
  - **Super Admin**: `admin@nexuscampus.edu` (Full institutional governance)
  - **Faculty / Teacher**: `teacher@nexuscampus.edu` (Class attendance, grade entry, leave reviews)
  - **Chief Examiner**: `examiner@nexuscampus.edu` (Grade moderation council, transcript release)
  - **Student**: `student@nexuscampus.edu` (Emma Watson — loans, fees, leaves, transcript, placement)
  - **Placement Officer**: `placement@nexuscampus.edu` (Campus drives, shortlists, offer packages)
  - **Librarian**: `librarian@nexuscampus.edu` (Book loans, cataloguing, fine collection)

---

## Execution Log & Session History

### [Session 004] — Backend Modernization, Modular Monolith & Shared Multi-Agent Protocol
- **Timestamp Started**: 2026-09-14 18:30:00 IST
- **Timestamp Updated**: 2026-09-14 19:25:00 IST
- **Active Agents**: Agent A (Frontend & Workflows), Agent B (Backend Architecture & SIS/Admissions)
- **Primary Focus**: 
  1. Restructuring backend into enterprise-grade modular monolith (`backend/services/modules/`).
  2. Implementing high-depth domain modules: `sis.py` (M04 Student 360) and `admissions.py` (M03 Admissions Pipeline).
  3. Aligning frontend interactive personas with real backend APIs.
  4. Establishing `tracking.md` as the universal inter-agent coordination ledger.
- **Key Actions & Files Created/Modified**:
  - `backend/services/modules/_base.py`: Standard Pydantic `Model` with extra forbidden, SQL `Where` query builder, `must()`, `paged()`, `institution()`, `current_term()`, `holiday_dates()`.
  - `backend/services/modules/identity.py`: Complete JWT auth, token issuance, demo account directory, impersonation guard.
  - `backend/services/modules/platform.py`: System health, audit log viewer, scheduled background job runners.
  - `backend/services/modules/tenants.py`: Multi-tenant registry, template-based database cloning, reset functionality.
  - `backend/services/modules/approvals.py`: Universal workflow approval engine, multi-step signing, escalation checks.
  - `backend/services/modules/sis.py` (M04): 800+ lines covering Student 360, encrypted health records, guardian linkage, document wallet, verifiable certificates, ID card issuance.
  - `backend/services/modules/admissions.py` (M03): 540+ lines handling enquiries, application review, document verification, shortlists, offer letters, auto-enrolment into SIS.
  - `backend/services/core_service/routes.py`: Bridge API providing endpoints for UI interactions (`/institution`, `/students`, `/staff`, `/invoices`, `/library/loans`, `/attendance/leaves`, `/academics/grades`, `/placement/drives`, `/placement/applications`, `/modules/{code}/records`).
  - `tracking.md`: Created universal memory log for all collaborating agents.
- **Current Status**: In Progress / Active.

---

### [Session 003] — Full Multi-Persona Workflows & UI Interactivity Overhaul
- **Timestamp**: 2026-09-14 12:00:00 to 18:00:00 IST
- **Focus**: Transforming static UI pages into realistic, role-adaptive interactive experiences across student, teacher, examiner, placement officer, and librarian personas.
- **Key Actions & Files Modified**:
  - `frontend/src/pages/library/LibraryCatalog.tsx`:
    - Added Student Borrow Request modal with automated due date and student record linkage.
    - Added "My Loans & History" tab for students with countdowns, 7-day loan renewals, and fine calculations.
    - Added Librarian "Borrow Requests & Approvals" queue with 1-click Approve / Reject and Return actions.
  - `frontend/src/pages/operations/Finance.tsx`:
    - Added Student Fee Portal with pending tuition & lab invoices.
    - Added interactive "Pay Online" modal (Card / UPI / NetBanking) with real-time status transitions.
    - Added Verifiable PDF Fee Receipt modal with cryptographic security watermark and QR code.
  - `frontend/src/pages/operations/DailyAttendance.tsx`:
    - Added Student Attendance score widget (94.2%), "Apply for Leave" modal (dates, reason, medical note).
    - Added Leave history table for students and Faculty Leave Review queue with 1-click Approve / Reject.
  - `frontend/src/pages/academics/Gradebook.tsx`:
    - Added Student Official Semester Transcript view (3.94 GPA, letter grades, credit audit).
    - Added Printable Transcript modal with digital stamp and Dean's signature.
    - Added Chief Examiner Moderation Council view with "Approve & Release Official Results" action.
  - `frontend/src/pages/career/PlacementHub.tsx`:
    - Added Student "1-Click Apply" for upcoming placement drives.
    - Added "My Applications & Offer Letters" tracker.
    - Added formal Offer Package review and digital offer acceptance workflow.
  - `frontend/src/pages/students/StudentProfile.tsx`:
    - Integrated 360° telemetry linking live status from Library, Fees, Attendance, Academics, and Placements.
  - `frontend/src/pages/dashboard/Dashboard.tsx`:
    - Refactored into role-adaptive dashboard displaying persona-tailored KPI widgets, alerts, and quick actions.
  - **Build Verification**: `npm run build` cleanly passed with 0 errors (`built in 12.54s`).

---

### [Session 002] — Multi-Tenant Engine, Database Seed & Core Services
- **Timestamp**: 2026-09-14 06:00:00 to 12:00:00 IST
- **Focus**: Setting up the PostgreSQL database backend with multi-tenant cloning architecture.
- **Key Actions & Files**:
  - `backend/db/schema.py`: Golden master schema covering platform tables (`tenants`, `users`, `roles`, `audit_logs`) and tenant operational tables (SIS, Academics, Attendance, Library, Finance, Placements, etc.).
  - `backend/db/seed.py`: Deterministic seed scripts for golden template and demo institution.
  - `backend/services/core_service/`: Initial FastAPI backend routes with asyncpg connection pools.
  - `frontend/src/api/client.ts`: Unified API client with automatic token attachment, tenant header injection, and graceful fallback to offline demo mock data.

---

### [Session 001] — Initial 64-Module Foundation & Design System
- **Timestamp**: 2026-09-04 to 2026-09-12
- **Focus**: Platform inception, 64-module architecture breakdown, rich dark/light UI design tokens, responsive layout, LMS course builder, content studio.
- **Key Deliverables**: Primary Architecture document, UI shell, dynamic module table explorer, visual verification artifacts.

---

## Active Architecture & Data Conventions

### 1. Database & Schema Rules
- Tenant isolation is strictly enforced via database-per-tenant or tenant-scoped schemas.
- Golden template database `nexus_template` must NEVER be directly written to by user operations; it is cloned when provisioning new tenants.
- System audit columns (`id uuid`, `tenant_id`, `created_at`, `updated_at`, `version`) are present on all operational tables.
- Deletions are soft (`deleted_at IS NULL`) on all primary business records.

### 2. Backend Module Blueprint (`backend/services/modules/`)
Every module must follow this standard:
```python
from fastapi import APIRouter, Depends
from ..common import db, workflow
from ..common.audit import audit
from ..common.notify import notify
from ..common.rbac import Ctx, require, module_guard
from ._base import Model, Where, must, paged, utcnow

router = APIRouter(prefix="/api/v1/<module_name>", tags=["<Tag>"], dependencies=[Depends(module_guard("<CODE>"))])
```
- Request payloads must inherit from `Model` (which enables `extra="forbid"`).
- Dynamic queries use `Where("cond1")` with positional parameter injection.
- PII fields must be masked using `mask()` unless the calling user has elevated administrative rights.

### 3. Frontend-to-Backend Compatibility
- The frontend `frontend/src/api/client.ts` calls both modern modular endpoints (`/api/v1/auth/...`, `/api/v1/tenants/...`) and operational endpoints (`/api/v1/core/...`).
- When implementing new modules in `backend/services/modules/`, maintain backwards compatibility by adding route aliases or mounting both `/api/v1/<name>` and `/api/v1/core/<name>` so no existing UI flows break.

---

## Immediate Next Steps (Handoff Priority List)

| Priority | Module / Area | Description | Target Files |
|---|---|---|---|
| **P1** | **M14 Library Module** | Build `library.py` under `services/modules/`: borrow request, loan issue, renew (+7 days), return with fine calculation, shelf management. | `backend/services/modules/library.py` |
| **P1** | **M15 Fees & Finance Module** | Build `fees.py`: student invoice listing, online payment processing, receipt generation with verification number. | `backend/services/modules/fees.py` |
| **P1** | **M08 Attendance Module** | Build `attendance.py`: attendance sessions, student leave application, faculty review/approval. | `backend/services/modules/attendance.py` |
| **P2** | **M30 Gradebook Module** | Build `gradebook.py`: internal/final score entry, Chief Examiner moderation council approval, official transcript export. | `backend/services/modules/gradebook.py` |
| **P2** | **M23 Placement Module** | Build `placement.py`: campus drive listings, 1-click application submission, shortlist/stage tracking, offer letter acceptance. | `backend/services/modules/placement.py` |
| **P3** | **Role Dashboard Module** | Build `dashboard.py`: aggregated role-scoped metrics endpoint (`/api/v1/dashboard/summary`) for student, teacher, examiner, placement officer, super admin. | `backend/services/modules/dashboard.py` |
| **P3** | **End-to-End Verification** | Validate all routes against running FastAPI gateway and test with Vite frontend. | `http://localhost:8000/docs`, `http://localhost:5173` |

---
*Note: Always update this file whenever you begin or finish a significant unit of work.*
