# Stage 4 — Teaching & learning · task board

> Read at the start of every session. Update status + owner BEFORE starting work.
> Statuses: draft · planned · in-progress · ready-for-review · in-review · changes-requested · done · withdrawn
> A task becomes `planned` only when the planner has written its file (in this folder) from `docs/templates/TASK.md`.
> Lanes: **A** UI/theme/text · **B** contracts/mocks · **C** screens · **D** backend / deploy.
> `draft` rows have no task file yet; the planner writes them 2 ahead (`AGENTS.md` §3.5).

**Step:** design (D87; `docs/PLAN.md` → Stage 4) · **Modules:** M29–M46, M91 ·
**Module list and order:** approved by the Owner 2026-11-26 (D88).

| ID | Title | Lane | Status | Owner | Depends on |
|---|---|---|---|---|---|
| NEX-210 | Contracts (M29): outcome frameworks, outcomes, CO–PO mapping, syllabus units, lesson plans, coverage | B | done | Claude | 146 |
| NEX-211 | Contracts (M30): course spaces, modules, items, progress, discussions | B | done | Claude | 146 |
| NEX-212 | Contracts (M31): content items, assets, lesson blocks, packages, accessibility checks, attempts | B | done | Claude | 146 |
| NEX-213 | Contracts (M32): assignments, submissions, feedback, AI marking suggestions, peer reviews, originality signals | B | done | Claude | 152, 211 |
| NEX-247 | Contracts (M33): question banks, items, online tests, attempts, responses, item statistics — split from NEX-213 | B | done | Claude | 210, 212 |
| NEX-214 | Contracts (M35): mastery, learning paths, tutor settings, tutor sessions and messages (AI-labelled, sources, consent) | B | done | Claude | 210, 211 |
| NEX-248 | Contracts (M46): engagement signals, risk scores with factors, interventions (human action) — split from NEX-214 | B | done | Claude | 213, 214, 247 |
| NEX-215 | Contracts (M34): proctoring settings, sessions, recordings, flags for human review (no emotion or biometric data) | B | done | Claude | 247 |
| NEX-249 | Contracts (M36): live sessions, joins, recordings, AI summaries and chapters — split from NEX-215 | B | done | Claude | 211 |
| NEX-216 | Contracts (M37): daily diary, observations, milestones, pickup checks, ratios, AI day summaries | B | done | Claude | 210, 214 |
| NEX-250 | Contracts (M38): support plans (IEP / ILP), goals, accommodations, interventions, progress (AI goal drafts need approval) — split from NEX-216 | B | done | Claude | 210 |
| NEX-251 | Contracts (M91): media items with consent state, portfolios, entries, portable exports — split from NEX-216 | B | planned | — | 210, 216 |
| NEX-217 | Contracts (M39): catalogue records, copies, loans, holds, fines, AI recommendations (private reading history) | B | planned | — | 151 |
| NEX-252 | Contracts (M44): surveys, questions, anonymity rules, responses, AI theme summaries — split from NEX-217 | B | draft | — | 148 |
| NEX-253 | Contracts (M45): credential templates, issued credentials (Open Badges 3, W3C VC), verification, revocation — split from NEX-217 | B | draft | — | 148 |
| NEX-218 | Contracts (M40, M41): test series, ranks, percentiles, doubts; catalogue courses, session packs, trial and make-up sessions, level exams | B | draft | — | 146, 247 |
| NEX-219 | Contracts (M42, M43): credit rules, elective registration, degree audit, thesis supervision; store products, bundles, coupons, orders | B | draft | — | 146, 211 |
| NEX-220 | Fixtures: curriculum, courses, content, assignments, questions and mastery for the 5 demo tenants and the Group | B | draft | — | 210–214, 247, 248 |
| NEX-221 | Fixtures: proctoring, live classes, early years, inclusion, media, library, surveys, credentials, test prep, courses, credits, store | B | draft | — | 215–220, 249–253 |
| NEX-222 | MSW handlers + services: M29, M30, M31 | B | draft | — | 220 |
| NEX-223 | MSW handlers + services: M32, M33, M34, M35 (anonymous peer reviewers hidden from authors, NEX-213; learners get `QuestionDelivery` only, NEX-247) | B | draft | — | 220, 222 |
| NEX-224 | MSW handlers + services: M36, M37, M38, M91, M46 | B | draft | — | 221, 223 |
| NEX-225 | MSW handlers + services: M39–M45 | B | draft | — | 221, 224 |
| NEX-226 | M29 Curriculum & lesson planning | C | draft | — | 222 |
| NEX-227 | M30 LMS classrooms & courses | C | draft | — | 222, 226 |
| NEX-228 | M31 Content authoring studio (accessibility check before publish) | C | draft | — | 222, 227 |
| NEX-229 | M32 Homework & assignments (offline L2 submit) | C | draft | — | 223, 228 |
| NEX-230 | M33 Question bank & online tests | C | draft | — | 223, 229 |
| NEX-231 | M34 Online proctoring (flags for human review only) | C | draft | — | 223, 230 |
| NEX-232 | M35 AI tutor & learning paths (guardian consent for minors) | C | draft | — | 223, 231 |
| NEX-233 | M36 Live classes | C | draft | — | 224, 232 |
| NEX-234 | M37 Early years (offline L2, mobile first) | C | draft | — | 224, 233 |
| NEX-235 | M38 Special education & inclusion | C | draft | — | 224, 234 |
| NEX-236 | M91 Media, portfolios & learning evidence (guardian media opt-out) | C | draft | — | 224, 235 |
| NEX-237 | M46 Learning analytics & early warning (reasons shown, human action) | C | draft | — | 224, 236 |
| NEX-238 | M39 Library | C | draft | — | 225, 237 |
| NEX-239 | M40 Coaching & test prep | C | draft | — | 225, 238 |
| NEX-240 | M41 Courses, sessions & packages | C | draft | — | 225, 239 |
| NEX-241 | M42 Higher-ed academics | C | draft | — | 225, 240 |
| NEX-242 | M43 Online academy store | C | draft | — | 225, 241 |
| NEX-243 | M44 Surveys & feedback | C | draft | — | 225, 242 |
| NEX-244 | M45 Credentials & badges | C | draft | — | 225, 243 |
| NEX-245 | Stage 4 review build: walkthrough per persona × institution type, Playwright smoke | C | draft | — | 226–244 |
| NEX-246 | Stage 4 freeze (planner + Owner); build tasks planned at the freeze | — | draft | — | 245 |
