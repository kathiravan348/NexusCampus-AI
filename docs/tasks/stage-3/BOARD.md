# Stage 3 — Core institution operations · task board

> Read at the start of every session. Update status + owner BEFORE starting work.
> Statuses: draft · planned · in-progress · ready-for-review · in-review · changes-requested · done · withdrawn
> A task becomes `planned` only when the planner has written its file (in this folder) from `docs/templates/TASK.md`.
> Lanes: **A** UI/theme/text · **B** contracts/mocks · **C** screens · **D** backend / deploy.
> `draft` rows have no task file yet; the planner writes them 2 ahead (`AGENTS.md` §3.5).

**Step:** build (prototype frozen 2026-11-25, D78; `docs/PLAN.md` → Stage 3, D71) · **Modules:** M08, M09, M12–M28, M86 ·
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
| NEX-168 | M19 Accounting | C | done | Codex | 158, 167 |
| NEX-169 | M20 Assessment & gradebook | C | done | Gemini | 158, 168 |
| NEX-170 | M21 Exams (in person) | C | done | Codex | 158, 169 |
| NEX-171 | M22 Report cards & transcripts | C | done | Codex | 158, 170 |
| NEX-172 | M23 Documents & e-signature | C | done | Gemini | 158, 171 |
| NEX-173 | M24 Communication hub | C | done | Gemini | 159, 172 |
| NEX-174 | M25 Family portal | C | done | Gemini | 159, 173 |
| NEX-175 | M26 Learner portal | C | done | Gemini | 159, 174 |
| NEX-176 | M27 Staff portal | C | done | Codex | 159, 175 |
| NEX-177 | M28 Dashboards & role homes | C | done | Codex | 159, 176 |
| NEX-178 | M86 Year-end rollover & promotion | C | done | Codex | 159, 177 |
| NEX-179 | Stage 3 review build: walkthrough per persona × institution type, Playwright smoke | C | done | Codex | 160–178, 181 |
| NEX-181 | Menu shows only screens the user can open (role-profile audience, D77) | C | done | Codex | 160–178 |
| NEX-182 | Stage 3 review fixes: "Absences this week" card, phone numbers with spaces | C | done | Codex | 179, 181 |
| NEX-180 | Stage 3 freeze (planner + Owner) | — | done | Claude | 179, 181, 182 |
| NEX-183 | Build: DB + API for M15 academic structure | D | done | Codex | 180 |
| NEX-200 | Build: DB + API for M08 fields, forms, workflows, numbering | D | ready-for-review | Codex | 183 |
| NEX-184 | Build: DB + API for M13 learner records and M14 families, guardians, custody and pickup | D | draft | — | 183, 200 |
| NEX-185 | Build: DB + API for M12 admissions (incl. public enquiry endpoint with abuse limits) and M09 import jobs | D | draft | — | 184, 186 |
| NEX-186 | Public admissions enquiry form, no sign-in (M12; Owner review point 4; demo data first) | C | done | Gemini | 180 |
| NEX-201 | Public enquiry form opens in the institution's default language, with a language switch (D42, D79) | C | planned | — | 186 |
| NEX-187 | Build: DB + API for M16 timetable and M17 attendance, with offline sync (L2) | D | draft | — | 183, 184 |
| NEX-188 | Build: DB + API for M18 fees and payments and M19 accounting ledger and budgets | D | draft | — | 184 |
| NEX-189 | Build: DB + API for M20 gradebook and M21 exams and seating | D | draft | — | 183, 184 |
| NEX-190 | Build: DB + API for M22 report cards and M23 documents and e-signature | D | draft | — | 189 |
| NEX-191 | Build: DB + API for M24 messages, notices and meetings (on the M07 notifications engine) | D | draft | — | 184 |
| NEX-192 | Build: API for M25–M28 portal homes and dashboards (counts and aggregates only) | D | draft | — | 187–191 |
| NEX-193 | Build: M86 rollover backend — dry run, decisions, confirm, roll-back window, audit (Owner review point 3) | D | draft | — | 192 |
| NEX-194 | M86 rollover screens: start a dry run, override decisions, confirm, reverse (Owner review point 3) | C | draft | — | 193 |
| NEX-195 | Stage 3 demo seed: data fixtures into the backend seed (ends D75; access moved in NEX-183, D80) | D | draft | — | 183–191, 200 |
| NEX-196 | Stage 3 contract parity: API responses match the frozen contracts | D | draft | — | 192, 195 |
| NEX-197 | Switch Stage 3 screens to real data: M08, M09, M12–M17 | C | draft | — | 196 |
| NEX-198 | Switch Stage 3 screens to real data: M18–M28, M86 | C | draft | — | 196, 197 |
| NEX-199 | Stage 3 harden & release: offline, i18n, WCAG 2.2 AA, security review V-1…V-7, install test, guides | D | draft | — | 186, 194, 198 |
