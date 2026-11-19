# NexusCampus — Module catalogue

> Every module, the stage that delivers it, which institution types use it, its offline level and its AI features.
> Types: EY early years · K12 schools · HE higher ed · VOC vocational · TP coaching · SK skill institutes · ONL online · GRP groups · All.
> Offline: L0 online only · L1 read · L2 capture + sync · L3 run offline (`docs/REQUIREMENTS.md` §6).
> **Core** modules are mandatory for every tenant; all others are switchable per plan or licence (ideology 1–2).
> IDs are permanent: a new module takes the next free number, whatever its stage.

## Stage 1 — Platform foundation
| ID | Module | Main features | Types | Off | AI |
|---|---|---|---|---|---|
| M01 | Tenancy & institution setup **(core)** | Group → institution → campus tree, institution type profile, region, locale, time zone, currency, calendars | All | L0 | Setup assistant: builds structure from an uploaded spreadsheet or prospectus |
| M02 | Identity & access **(core)** | Users, MFA, passkeys, SSO, SCIM, roles, permission catalogue, scopes, delegation, sessions, devices | All | L1 | Unusual sign-in detection |
| M03 | Theme studio **(core)** | All colour tokens, fonts, radius, density, logo, login page, letterheads, contrast guard, locks for groups | All | L1 | Palette from logo, auto-fixes failing contrast |
| M04 | Text & language studio **(core)** | Message keys, terminology packs, per-locale overrides, in-context preview, XLIFF import/export, history | All | L1 | Translation drafts, glossary consistency, tone check |
| M05 | Plans, entitlements & usage **(core)** | Plans, add-ons, module switches, AI credits, usage meters, invoices to institutions | All | L0 | Usage forecast |
| M06 | Audit, privacy & consent **(core)** | Audit log, consent records, data requests, retention rules, region compliance packs | All | L0 | Finds personal data for data requests |
| M07 | Notifications engine **(core)** | Templates per locale, channels, preferences, quiet hours, delivery log | All | L1 | Message drafting and translation |
| M08 | Forms, fields & workflow builder | Custom fields, forms, approval chains, SLA, escalation, numbering formats | All | L1 | Builds a form or workflow from a description |
| M09 | Import & migration toolkit | Templates, column mapping, validation, dry run, rollback, legacy system connectors | All | L0 | Column mapping and data clean-up suggestions |
| M10 | Offline & sync centre | Device registry, sync queue, conflicts, remote wipe, bandwidth modes | All | L3 | — |
| M11 | AI gateway & Nexus Assist | AI switches, credits, PII policy, model routing, prompt library, evaluations, Assist panel | All | L0 | Ask across modules, with citations |
| M83 | Data vault & access grants **(core)** | Per-tenant keys, field encryption, BYOK status, provider access requests (approve / deny / revoke), active grants, access history, break-glass notices | All | L0 | — (never AI on keys or grants) |

## Stage 2 — Nexus Control & delivery (provider platform)
> A separate platform for **us**, the provider, to run SaaS subscribers and self-hosted licence customers (`REQUIREMENTS.md` §9–10).
> It stores only commercial and technical metadata — never institution data (V-7). IDs `P##`; `M84` runs inside every install.

| ID | Module | Main features | Models (DM) | AI |
|---|---|---|---|---|
| P01 | Customer accounts & CRM | Leads, accounts, contacts, opportunities, contracts, renewals, notes | All | Account summary, renewal-risk flag |
| P02 | Plans, pricing & quotes | SaaS plans, add-ons, AI credit packs, licence editions (perpetual / term), regional prices and taxes, quotes | All | Quote drafting |
| P03 | Subscription billing | Recurring and usage billing, invoices per country tax rules, payments, dunning, credit notes, revenue reports | DM-1 DM-2 | Payment-failure prediction |
| P04 | Tenant provisioning | Create tenant (region, type profile, plan), trials, upgrades, suspend, offboard with export + key destruction certificate | DM-1 DM-2 | — |
| P05 | Licence management | Signed licence files (modules, learner cap, expiry, support term), online / offline activation, grace periods, escrow records | DM-3 DM-4 | — |
| P06 | Deployment registry & fleet health | Every SaaS cell, dedicated cell and self-hosted install: version, extensions, health, last check-in (PII-free telemetry) | All | Anomaly and incident clustering |
| P07 | Release management | Release train, channels (stable, LTS, preview), signed images and offline bundles, migration notes, rollout rings, rollback | All | Release-note drafts |
| P08 | Customisation & extensions | Per-customer extension packages and config bundles, compatibility with each release, build and sign pipeline | All | Impact check of a release on a customer's extensions |
| P09 | Support desk & SLAs | Tickets, SLA by contract, escalations, knowledge base, customer status page | All | Ticket triage, answer drafts from knowledge base |
| P10 | Support access broker | Request access → institution approves in M83 → scoped, time-boxed session → recorded → auto-revoke; break-glass with two-person approval | DM-1 DM-2 | — |
| P11 | Usage & metering | Learners, staff, storage, AI credits, messages per tenant/install; feeds P03 and licence caps | All | Usage forecast |
| P12 | Partners & resellers | Partner accounts, partner-managed customers, commissions, deal registration | All | — |
| P13 | Provider staff & security | Staff SSO + MFA (mandatory), roles, approvals, device rules, staff audit log | All | — |
| P14 | Compliance & trust operations | DPAs, sub-processors, certifications, security incidents, breach-notification workflow, data-request tracking | All | Incident report drafts |
| P15 | Implementation projects | Onboarding plans, data-migration runs (M09), training, go-live checklists for enterprise and self-hosted customers | All | Project plan drafts |
| P16 | Business analytics | MRR/ARR, churn, cohorts, customer health score, support load | All | Churn risk with reasons |
| M84 | Install agent **(core, in product)** | Licence check, update check/pull, PII-free health telemetry, diagnostic bundle (scrubbed, customer-reviewed), air-gapped mode | All | — |

## Stage 3 — Core institution operations
| ID | Module | Main features | Types | Off | AI |
|---|---|---|---|---|---|
| M12 | Admissions & enquiry CRM | Enquiry capture, campaigns, public forms, applications, documents, tests/interviews, offers, waitlist, enrol | All | L2 | Lead scoring, follow-up drafts, document checks (human decides) |
| M13 | Learner records (SIS) | Profiles, IDs, documents, health flags, history, transfers, alumni hand-off, 360 view | All | L1 | Profile summary, duplicate detection |
| M14 | Families & guardians | Households, guardians, custody and pickup rights, siblings, consents | All | L1 | — |
| M15 | Academic structure | Programs, grades/years, classes, sections, batches, subjects, courses, credits, terms | All | L1 | Suggests structure from type profile |
| M16 | Timetable & scheduling | School timetables, university course scheduling, batch/session slots, rooms, teacher load | All | L1 | Generates and optimises timetables under constraints |
| M17 | Attendance | Daily / period / session / event attendance, QR, NFC, biometric, geo, late, leave requests | All | L2 | Absence pattern alerts |
| M18 | Fees & payments | Fee plans, instalments, discounts, scholarships, invoices, online/offline payments, refunds, dunning, receipts | All | L2 | Payment-risk prediction, reminder drafts |
| M19 | Accounting | Ledger, budgets, expenses, bank reconciliation, taxes per country, ERP export | All | L0 | Anomaly detection, categorisation |
| M20 | Assessment & gradebook | Grading schemes, weightings, marks entry, rubrics, moderation, competencies | All | L2 | Remark drafts, outlier flags in moderation |
| M21 | Exams (in person) | Exam schedules, seating, hall tickets, invigilation, marks, results, re-evaluation | K12 HE VOC TP | L2 | Seating plans, result analysis |
| M22 | Report cards & transcripts | Template designer, report cards, transcripts, progress reports, digital signing | All | L1 | Narrative comments per learner |
| M23 | Documents & e-signature | Certificates (bonafide, transfer, completion), letters, templates, e-sign, verification QR | All | L1 | Fills templates from records |
| M24 | Communication hub | Notices, messaging, groups, SMS/WhatsApp/email/push, meetings (PTM) booking, read receipts | All | L2 | Translate, summarise threads, tone check |
| M25 | Family portal & app | Child switcher, attendance, fees, results, diary, messages, consents, pickups | All | L2 | Family Q&A in own language |
| M26 | Learner portal & app | Timetable, attendance, grades, fees, requests, documents | All | L2 | Study helper (links to M35) |
| M27 | Staff portal & app | Classes, attendance, marks, leave, payslips, tasks | All | L2 | Daily briefing |
| M28 | Dashboards & role homes | Role home pages, KPIs, alerts, saved views | All | L1 | Insight narratives |

## Stage 4 — Teaching & learning
| ID | Module | Main features | Types | Off | AI |
|---|---|---|---|---|---|
| M29 | Curriculum & lesson planning | Standards/outcomes (CASE), syllabus, OBE CO-PO mapping, lesson plans, coverage tracking | All | L2 | Lesson plans aligned to standards |
| M30 | LMS classrooms & courses | Course spaces, modules, resources, discussions, completion rules, cohorts | All | L2 | Course outline from syllabus |
| M31 | Content authoring studio | Interactive lessons, video, SCORM/xAPI/cmi5 packages, accessibility checks | All | L2 | Generates lessons, alt text, captions |
| M32 | Homework & assignments | Assign, submit (files, audio, photo), rubrics, peer review, plagiarism | All | L2 | Feedback drafts, rubric scoring assist, originality signals |
| M33 | Question bank & online tests | QTI items, adaptive tests, practice, auto-marking, item analysis | All | L2 | Item generation, difficulty calibration |
| M34 | Online proctoring | Identity check, browser lock, recordings, flags for review | HE TP ONL | L0 | Proctoring flags (human review only) |
| M35 | AI tutor & learning paths | Personal tutor per course, mastery tracking, adaptive paths, practice | All | L1 | Tutor (guard-railed, age-appropriate) |
| M36 | Live classes | Zoom/Meet/Teams/BigBlueButton, attendance from joins, recordings | All | L0 | Transcripts, summaries, chapters |
| M37 | Early years | Daily diary (meals, naps, nappies), observations, milestones, photos, pickup checks, ratios | EY | L2 | Observation → milestone tagging, parent day summary |
| M38 | Special education & inclusion | IEP/ILP plans, accommodations, interventions, progress | All | L1 | Goal drafts (human approval) |
| M39 | Library | Catalogue, circulation, e-books, OPAC, fines, digital resources | All | L2 | Recommendations, cataloguing from ISBN/photo |
| M40 | Coaching & test prep | Batches, mock test series, ranks, percentiles, doubt solving, parent reports | TP | L2 | Doubt answers, weak-topic plans |
| M41 | Courses, sessions & packages | Catalogue, rolling enrolment, session packs, levels/grades exams, trial classes, make-ups | SK ONL | L2 | Practice feedback (audio/video) |
| M42 | Higher-ed academics | Credit systems (CBCS, ECTS), electives registration, degree audit, thesis supervision | HE VOC | L1 | Degree-path advisor |
| M43 | Online academy store | Sell courses, bundles, coupons, subscriptions, affiliates | ONL SK TP | L0 | Course page copy |
| M44 | Surveys & feedback | Course, faculty, parent, staff surveys; anonymity rules | All | L2 | Theme and sentiment summary |
| M45 | Credentials & badges | Certificates, Open Badges 3, W3C verifiable credentials, digital diplomas, verification | All | L1 | — |
| M46 | Learning analytics & early warning | Engagement, mastery, risk scores, interventions | All | L0 | At-risk prediction with reasons |

## Stage 5 — People, finance & operations
| ID | Module | Main features | Types | Off | AI |
|---|---|---|---|---|---|
| M47 | HR & recruitment | Positions, job posts, applicants, interviews, onboarding, staff records | All | L1 | Job descriptions, CV screening (bias-checked, human decides) |
| M48 | Payroll | Country rule packs, salary structures, payslips, statutory filings, bank files | All | L0 | Anomaly checks |
| M49 | Staff attendance & leave | Clock-in, shifts, leave policies, balances | All | L2 | — |
| M50 | Appraisal & development | Goals, observations, appraisals, PD courses, certifications | All | L1 | Observation summaries, PD suggestions |
| M51 | Substitute & cover | Absence → cover suggestions, cover log, fairness rules | K12 HE | L2 | Auto cover proposals |
| M57 | Inventory & assets | Stock, assets, tagging, depreciation, audits, stock counts | All | L2 | Reorder forecast |
| M58 | Procurement & vendors | Requisitions, quotes, purchase orders, vendor portal, invoices | All | L0 | Quote comparison |
| M59 | Facilities & bookings | Rooms/space booking, maintenance tickets, preventive maintenance | All | L2 | Ticket triage |
| M63 | Grievances & service desk | Requests, complaints, SLA, one-stop student services | All | L1 | Triage and answer drafts |
| M71 | Research & grants | Projects, grants, publications, ethics approvals | HE | L1 | Literature and grant summaries |
| M72 | Accreditation & inspection | Frameworks (e.g. NAAC, NBA, AACSB, Ofsted, WASC), evidence, self-study reports | K12 HE VOC | L0 | Evidence gathering, report drafts |

## Stage 6 — Campus life & services
| ID | Module | Main features | Types | Off | AI |
|---|---|---|---|---|---|
| M52 | Transport | Routes, stops, vehicles, GPS, driver app, boarding scans, alerts to parents | EY K12 HE | L3 | Route optimisation, delay prediction |
| M53 | Hostel & boarding | Rooms, allocation, roll calls, leave/out-pass, mess | K12 HE VOC | L2 | Allocation suggestions |
| M54 | Canteen & meal plans | Menus, allergies, meal plans, POS, pre-orders | All | L3 | Demand and waste forecast |
| M55 | Campus store | Uniforms, books, kits, POS, online orders | All | L2 | Stock suggestions |
| M56 | Campus card & wallet | Cashless wallet, top-ups, access control, spending limits for parents | K12 HE | L3 | — |
| M60 | Visitor & gate | Visitor pre-registration, badges, pickup verification, gate logs | All | L3 | — |
| M61 | Health centre | Visits, medication, immunisation, allergies, incidents (restricted access) | All | L2 | — (no AI on health records by default) |
| M62 | Wellbeing, behaviour & safeguarding | Incidents, behaviour points, counselling, safeguarding cases, restricted access | All | L2 | Risk signals for trained staff (human decides) |
| M64 | Events, clubs & activities | Events, clubs, registrations, tickets, house points | All | L2 | Event plan drafts |
| M65 | Sports & athletics | Teams, fixtures, training, fitness records, results | K12 HE SK | L2 | — |
| M66 | Trips & consent | Trips, risk assessments, digital consent, payments, roll calls | EY K12 | L2 | Risk assessment drafts |
| M67 | Placement & careers | Recruiters, drives, applications, offers, career guidance | HE VOC K12 | L1 | Resume review, job matching |
| M68 | Internships & apprenticeships | Placements, logbooks, employer reviews, hours | HE VOC | L2 | Logbook summaries |
| M69 | International & mobility | Visas, international fees, exchange, credit transfer | HE K12 | L1 | Document checklist assistant |
| M70 | Alumni & fundraising | Alumni network, events, donations, campaigns, endowment | K12 HE | L0 | Donor segmentation, appeal drafts |

## Stage 7 — Enterprise & ecosystem
| ID | Module | Main features | Types | Off | AI |
|---|---|---|---|---|---|
| M73 | Group & franchise console | Consolidated KPIs, shared catalogues, inherited settings, royalties | GRP | L0 | Cross-campus comparisons |
| M74 | BI & reporting | Report builder, data warehouse, scheduled reports, exports, embedded dashboards | All | L0 | Natural-language reports |
| M75 | Integrations hub & public API | LTI, OneRoster, Google/Microsoft, payment and messaging gateways, government portals, webhooks, SDKs | All | L0 | Integration mapping assistant |
| M76 | Marketplace & extension SDK | Third-party modules, themes, language packs, review process | All | L0 | — |
| M77 | White-label mobile apps | Per-institution branded iOS/Android apps from the PWA | All | — | — |
| M78 | Website builder | Institution website, admissions landing pages, SEO, multilingual | All | L0 | Page and copy generation |
| M79 | Edge node | On-campus server for full offline / low bandwidth, local sync hub | All | L3 | Small on-device models (later) |
| M80 | Smart campus & IoT | RFID/biometric devices, sensors, energy, access hardware | K12 HE | L3 | Energy optimisation |
| M81 | Sustainability & ESG | Energy, waste, carbon reports | GRP HE K12 | L0 | Report drafts |
| M82 | Trust centre | Status page, certifications, sub-processors, data residency reports | All | L0 | — |
