# Stage 3 — Core institution operations · task board

> Read at the start of every session. Update status + owner BEFORE starting work.
> Statuses: draft · planned · in-progress · ready-for-review · in-review · changes-requested · done · withdrawn
> A task becomes `planned` only when the planner has written its file (in this folder) from `docs/templates/TASK.md`.
> Lanes: **A** UI/theme/text · **B** contracts/mocks · **C** screens · **D** backend / deploy.
> `draft` rows have no task file yet; the planner writes them 2 ahead (`AGENTS.md` §3.5).

**Step:** design → prototype (`docs/PLAN.md` → Stage 3, D71) · **Modules:** M08, M09, M12–M28, M86 ·
**Module list and order:** approved by the Owner 2026-11-23 (D72).

| ID | Title | Lane | Status | Owner | Depends on |
|---|---|---|---|---|---|
| NEX-146 | Contracts (M15): programs, year levels, class groups, subjects, subject offerings | B | done | Codex | 008, 028 |
| NEX-147 | Contracts (M08): custom fields and values, forms, approval workflows, numbering formats | B | done | Codex | 008 |
| NEX-148 | Contracts (M13, M14): learner records, households, guardians, custody and pickup rights | B | done | Codex | 146, 147 |
| NEX-149 | Contracts (M12, M09): enquiries, applications, offers, waitlist; import jobs and column mappings | B | done | Codex | 148 |
| NEX-150 | Contracts (M16, M17): rooms, timetable slots, teacher load; attendance sessions, marks, leave requests | B | done | Gemini | 146 |
| NEX-151 | Contracts (M18, M19): fee plans, instalments, concessions, invoices, payments, refunds; ledger and budgets | B | done | Gemini | 148 |
| NEX-152 | Contracts (M20–M23): grading schemes, marks, rubrics; exams and seating; report cards; documents and e-sign | B | done | Codex | 148 |
| NEX-153 | Contracts (M24–M28, M86): messages, notices, meetings; portal homes; dashboards; rollover runs | B | done | Gemini | 148 |
| NEX-154 | Fixtures: academic structure, learners and families for the 5 demo tenants and the Group | B | done | Codex | 146–148 |
| NEX-155 | Fixtures: admissions, timetable, attendance, fees, marks and messages | B | done | Gemini | 149–154 |
| NEX-156 | MSW handlers + services: M15, M08, M13, M14 | B | done | Codex | 154 |
| NEX-157 | MSW handlers + services: M12, M09, M16, M17 | B | done | Codex | 155, 156 |
| NEX-158 | MSW handlers + services: M18–M23 | B | done | Codex | 155–157 |
| NEX-159 | MSW handlers + services: M24, M28 (portal homes for M25–M27) | B | done | Codex | 155–158 |
| NEX-160 | M15 Academic structure screens | C | done | Gemini | 156 |
| NEX-161 | M08 Forms, fields & workflow builder | C | done | Codex | 156 |
| NEX-162 | M09 Import & migration wizard | C | done | Gemini | 157 |
| NEX-163 | M13 Learner records and M14 Families & guardians | C | done | Gemini | 156 |
| NEX-164 | M12 Admissions & enquiry CRM — staff screens (public form: follow-up) | C | done | Codex | 157 |
| NEX-165 | M16 Timetable & scheduling | C | done | Gemini | 157 |
| NEX-166 | M17 Attendance (offline L2, mobile first) | C | done | Codex | 157 |
| NEX-167 | M18 Fees & payments | C | done | Gemini | 158 |
| NEX-168 | M19 Accounting | C | planned | — | 158, 167 |
| NEX-169 | M20 Assessment & gradebook | C | planned | — | 158, 168 |
| NEX-170 | M21 Exams (in person) | C | planned | — | 158, 169 |
| NEX-171 | M22 Report cards & transcripts | C | planned | — | 158, 170 |
| NEX-172 | M23 Documents & e-signature | C | draft | — | 158 |
| NEX-173 | M24 Communication hub | C | draft | — | 159 |
| NEX-174 | M25 Family portal | C | draft | — | 159 |
| NEX-175 | M26 Learner portal | C | draft | — | 159 |
| NEX-176 | M27 Staff portal | C | draft | — | 159 |
| NEX-177 | M28 Dashboards & role homes | C | draft | — | 159 |
| NEX-178 | M86 Year-end rollover & promotion | C | draft | — | 159 |
| NEX-179 | Stage 3 review build: walkthrough per persona × institution type, Playwright smoke | C | draft | — | 160–178 |
| NEX-180 | Stage 3 freeze (planner + Owner) | — | draft | — | 179 |
