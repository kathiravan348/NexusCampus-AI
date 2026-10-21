# NexusCampus AI — Master 64 Product Modules UI Checklist

> **Scope:** Exhaustive UI breakdown for all **64 Product Modules** specified under `<section id="modules">` in `Initial_plan.html`.
> Each module specifies concrete **Pages**, **Modals & Drawers**, and **Action Popups**, along with their implementation tracking status for interactive demo delivery.

---

## Executive Progress Summary

| Category | Total Modules | Level 1 & 2 Screens Implemented | Total Pages Mapped | Total Modals/Popups Mapped |
| :--- | :--- | :--- | :--- | :--- |
| **Product Modules (M01 – M64)** | **64 Modules** | **28 Interactive Flagship Routes** (M01-M08, M10-M12, M14-M20, M22-M24, M30, M38, M40) | **~240+ Dedicated Pages** | **~500+ Modals & Popups** |

---

## M01: Platform Core
### Functional Blueprint Scope
- Multi-tenancy, isolation, data residency
- Org hierarchy & campus setup
- Academic year, terms, holiday calendar
- White-labelling: theme, domain, templates
- Feature flags, module licensing, plans
- i18n, multi-currency, timezone
- Notification engine (app/email/SMS/WhatsApp/push)
- Workflow & approval engine
- Audit trail, retention, soft delete
- Open API, webhooks, plugin marketplace

### Pages & Workspaces
- [x] `/setup` — Organization Hierarchy & Campus Onboarding Setup
- [x] `/dashboard` — Master Institutional Dashboard & Multi-Campus Analytics
- [ ] `/core/academic-calendar` — Academic Year, Terms & Holiday Calendar
- [ ] `/core/branding` — White-label Theme, Domain, Logo & Email Templates Studio
- [ ] `/core/audit` — Central Audit Trail & System Activity Log Explorer

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] New Campus / Branch Creation Wizard Modal
- [ ] Academic Term & Session Configuration Modal
- [ ] Notification Channel Setup Drawer (Email/SMS/WhatsApp/Push)
- [ ] Approval Workflow Engine Rule Builder Modal
- [ ] Feature Flag & Module Licensing Assignment Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Soft Delete / Restore Confirmation Dialog
- [ ] Timezone & Currency Change Warning Popup
- [ ] Publish White-label Theme Confirmation Modal
- [ ] Tenant API Key Revocation Warning Popup

---

## M02: Identity & Security
### Functional Blueprint Scope
- SSO (OIDC/SAML), Google & Microsoft login
- MFA, device trust, session policy
- RBAC + ABAC, custom roles, delegated admin
- Impersonation with full audit
- Consent management (GDPR/FERPA/DPDP)
- PII vault, field-level encryption, masking
- Rate limiting, secret management

### Pages & Workspaces
- [x] `/login` — Unified Login, SSO & MFA Verification Screen
- [ ] `/security/roles` — Role-Based Access Control (RBAC & ABAC) Matrix
- [ ] `/security/sessions` — Active Device Trust & Session Management Console
- [ ] `/security/compliance` — Consent Management & Data Privacy (GDPR/FERPA/DPDP) Hub

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] MFA Device Setup / Authenticator App QR Modal
- [ ] Create Custom Role & Permission Assignment Drawer
- [ ] Delegated Admin Authority Assignment Modal
- [ ] Impersonate User with Audit Reason Dialog
- [ ] PII Data Masking & Vault Field Rule Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Force Terminate All Sessions Alert Popup
- [ ] Revoke Delegated Admin Access Confirmation
- [ ] Emergency Account Lockout Confirmation Dialog

---

## M03: Admissions & Enrolment
**AI & Core Capabilities:** `OCR` `Lead scoring` `RAG chatbot`

### Functional Blueprint Scope
- Enquiry capture: web, walk-in, call, campaign
- Lead nurturing, counsellor assignment, follow-ups
- Online application, dynamic forms, uploads
- Document verification, entrance test, interview
- Merit list, quota rules, seat allotment, waitlist
- Offer letter, admission fee, confirmation
- Roll number generation, onboarding checklist
- Re-admission, transfer, TC / bonafide
- Withdrawal & dropout handling

### Pages & Workspaces
- [x] `/admissions` — Interactive Admissions CRM & Kanban Pipeline
- [ ] `/admissions/applications` — Online Application Data Table & Filter View
- [ ] `/admissions/merit` — Merit List Generation & Quota Allocation Console
- [ ] `/admissions/transfers` — Student Transfer, TC & Bonafide Issuance Page

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Quick Lead Intake & Enquiry Drawer
- [ ] Application Document OCR Verification & Extraction Modal
- [ ] Interview Scheduling & Entrance Test Scorecard Modal
- [ ] Seat Allocation & Quota Override Modal
- [ ] Generate Formal Offer Letter & Admission Fee Invoice Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm Stage Transition / Enrollment Popup
- [ ] Application Rejection / Waitlist Notice Confirmation
- [ ] Withdrawal & Refund Calculation Warning Popup
- [ ] Roll Number Auto-Generation Confirmation Alert

---

## M04: Student Information (SIS)
### Functional Blueprint Scope
- Student 360: academic, financial, health, conduct
- Guardian & sibling linkage, emergency contacts
- ID card & QR generation
- Health, allergies, immunisation, clinic visits
- Scholarship / category eligibility flags
- Document wallet, issued certificates
- Alumni conversion on graduation

### Pages & Workspaces
- [x] `/student/profile` — Student 360 Holistic Profile (Academics, Finance, Health, Conduct)
- [ ] `/students` — Master Student Directory with Advanced Faceted Search
- [ ] `/students/id-cards` — Bulk Student ID Card & QR Generation Studio
- [ ] `/students/certificates` — Document Wallet & Issued Certificates Registry

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] New Student Enrolment / Profile Registration Modal
- [ ] Guardian, Sibling & Emergency Contact Linkage Modal
- [ ] Medical Record, Allergy & Immunization Log Drawer
- [ ] Scholarship & Category Eligibility Tagging Modal
- [ ] Alumni Conversion & Graduation Checklist Wizard Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Mark Student Inactive / Dropped Out Confirmation Dialog
- [ ] Regenerate Digital Student ID QR Code Alert
- [ ] Export Confidential Student Health Record Warning

---

## M05: HR & Recruitment
**AI & Core Capabilities:** `Resume parsing` `JD matching` `Attrition risk`

### Functional Blueprint Scope
- Staff directory, designations, reporting lines
- Requisition → posting → ATS pipeline → offer
- Interview panels & scheduling
- Onboarding, contracts, probation
- Leave policies, quotas, approvals, comp-off
- Duty roster, shifts, substitution
- Appraisal, KPI, 360 feedback
- Training, certification, CPD
- Disciplinary records, exit & clearance

### Pages & Workspaces
- [x] `/hr/staff` — Staff Directory & Faculty Registry with Department Filters
- [ ] `/hr/recruitment` — Recruitment Pipeline & Job Openings Kanban
- [ ] `/hr/leaves` — Staff Leave Management & Holiday Approvals
- [ ] `/hr/performance` — Faculty Appraisal & Performance Review Matrix

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add New Employee / Faculty Onboarding Wizard
- [ ] AI Resume Parsing & Job Description Matcher Modal
- [ ] Leave Request Application & Document Attachment Modal
- [ ] Staff Promotion / Department Transfer Modal
- [ ] Attrition Risk Diagnostic Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm Staff Resignation / Offboarding Exit Checklist Popup
- [ ] Approve / Reject Leave Request Confirmation Dialog
- [ ] Deactivate Staff System Credentials Warning

---

## M06: Payroll & Salary
**AI & Core Capabilities:** `Anomaly detection`

### Functional Blueprint Scope
- Pay structures, grades, allowances, deductions
- Statutory: PF, ESI, TDS, PT, gratuity
- Attendance/leave-linked payroll runs
- Arrears, bonus, increments, loans, advances
- Payslips, Form 16, reimbursements
- Bank transfer file export
- Registers & compliance reports

### Pages & Workspaces
- [ ] `/payroll/dashboard` — Payroll Run Dashboard & Salary Band Overview
- [ ] `/payroll/payslips` — Monthly Payslip Generation & Distribution Hub
- [ ] `/payroll/tax` — Statutory Tax (PF/ESI/TDS/Income Tax) Compliance View

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Initiate Monthly Payroll Run Wizard Modal
- [ ] Staff Salary Structure & Component Customization Drawer
- [ ] Overtime, Bonus & Deduction Adjustment Modal
- [ ] Payroll Anomaly & Discrepancy Detection Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm Final Salary Disbursement & Bank File Export Alert
- [ ] Lock Monthly Payroll Ledger Warning Dialog
- [ ] Bulk Email Payslips Confirmation Popup

---

## M07: Academics & Curriculum
**AI & Core Capabilities:** `Constraint optimisation` `Knowledge graph`

### Functional Blueprint Scope
- Programme, course, subject, elective catalogue
- Credits, prerequisites, syllabus versioning
- Course Outcome ↔ Programme Outcome mapping
- Lesson plans, teaching diary, coverage tracking
- Timetable generation with constraints
- Substitution & class adjustment
- Room, lab, resource allocation
- Faculty workload balancing

### Pages & Workspaces
- [x] `/operations/timetable` — Master Timetable & Class Slot Schedule Grid
- [ ] `/academics/curriculum` — Academic Programs, Curriculum & Syllabus Tree
- [ ] `/academics/workload` — Faculty Workload Balancing & Credit Tracker

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Automated AI Timetable Constraint Solver Modal
- [ ] Assign Teacher / Subject to Slot Modal
- [ ] Course Syllabus & Unit Topic Creator Drawer
- [ ] Classroom / Lab Resource Booking Conflict Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish Timetable to Students & Staff Confirmation
- [ ] Room / Teacher Conflict Alert Popup
- [ ] Slot Swap Confirmation Dialog

---

## M08: Attendance
**AI & Core Capabilities:** `Face recognition` `Anti-spoof` `Anomaly`

### Functional Blueprint Scope
- Biometric, RFID, face, QR, geo-fence, manual
- Daily and period-wise capture
- Staff attendance, late / early-exit marks
- Leave integration, regularisation requests
- Shortage & condonation alerts to parents
- Heatmaps and attendance analytics

### Pages & Workspaces
- [ ] `/attendance/daily` — Daily Student Attendance Register by Class/Section
- [ ] `/attendance/staff` — Staff Biometric & RFID Attendance Dashboard
- [ ] `/attendance/analytics` — Defaulter Analytics, Trends & Truancy Alerts

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Bulk Attendance Entry / Quick Toggle Modal
- [ ] Facial Recognition / Camera Stream Attendance Feed Modal
- [ ] Absence Excuse Slip & Medical Certificate Upload Drawer
- [ ] Automated Parent SMS/WhatsApp Alert Notification Rules Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Submit & Lock Daily Attendance Confirmation
- [ ] Flag Attendance Spoof / Anomaly Warning Dialog
- [ ] Trigger Defaulter Warning Letter to Parents Alert

---

## M09: Examination (offline)
**AI & Core Capabilities:** `Question generation` `OMR / OCR` `Handwriting`

### Functional Blueprint Scope
- Exam types, schemes, grading, weightage
- Scheduling, hall ticket, seating plan
- Invigilator duty allocation
- Question bank, blueprint, difficulty tagging
- Paper generation & confidential packaging
- OMR design, scanning, bubble detection
- Answer-sheet digitisation, dummy numbering
- Valuation (single/double/third), moderation
- Revaluation, re-totalling, result processing
- GPA/CGPA, transcripts, mark sheets, certificates

### Pages & Workspaces
- [ ] `/exams/offline/schedule` — Offline Exam Timetable & Hall Ticket Hub
- [ ] `/exams/offline/seating` — Exam Seating Arrangement & Room Allocation
- [ ] `/exams/offline/marks` — Marks Entry & Tabulation Register
- [ ] `/exams/offline/omr` — OMR Sheet Scanner & Auto-Grading Console

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create Examination Series & Date Sheet Modal
- [ ] AI Question Paper Generator & Blueprinter Modal
- [ ] Hall Ticket Generation & Batch Download Modal
- [ ] Seating Plan Auto-Allocation Constraint Solver Modal
- [ ] OMR Batch Upload & OCR Scanning Calibration Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish Examination Schedule Confirmation Dialog
- [ ] Confirm Marks Lock & Grade Freeze Alert
- [ ] Flag Answer Sheet Evaluation Discrepancy Popup

---

## M10: Online Exams & Proctoring
**AI & Core Capabilities:** `CV proctoring` `Audio ML` `LLM-as-judge`

### Functional Blueprint Scope
- Question types: MCQ, MSQ, numeric, descriptive, coding, audio
- Randomisation, sectioning, timers, negative marking
- Adaptive testing, mock & practice modes
- Auto-evaluation of objective and descriptive answers
- Live and record-and-review proctoring
- Identity check, environment scan, browser lockdown
- Malpractice scoring & reviewer workflow

### Pages & Workspaces
- [x] `/lms/quiz` — Online Assessment Engine with Timer, Auto-grading & Proctoring UI
- [ ] `/exams/online/management` — Online Exam Creator & Question Bank
- [ ] `/exams/online/proctoring` — Live AI Remote Proctoring Dashboard (Webcam Grid)

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create Online Quiz / Timed Exam Wizard Modal
- [ ] AI-Assisted Question Generator (MCQ/Coding/Subjective) Drawer
- [ ] Exam Security & Lockdown Browser Policy Modal
- [ ] Proctoring Incident Flag & Suspicious Activity Review Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Final Exam Submission Confirmation Popup
- [ ] Candidate Disqualification / Warning Alert Dialog
- [ ] Resume Terminated Exam Session Confirmation

---

## M11: LMS & Online Study
**AI & Core Capabilities:** `AI tutor` `RAG` `Recommenders`

### Functional Blueprint Scope
- Course catalogue, cohorts, drip content, prerequisites
- Video lessons, live classes, recordings, notes, e-books
- SCORM / xAPI support
- Assignments, submissions, rubric grading
- Forums, Q&A, doubt clearing, peer review
- Gamification: points, badges, streaks, leaderboards
- Progress tracking, completion certificates
- Public course marketplace with paid enrolment

### Pages & Workspaces
- [x] `/lms` — LMS Course Catalogue & Student Learning Dashboard
- [x] `/lms/player` — Video Course Player with Lesson Sidebar & AI Study Tutor
- [ ] `/lms/discussions` — Course Discussion Board & Peer Q&A Community

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Ask AI Study Tutor Modal / Slide-out Chat Drawer
- [ ] Lesson Bookmark & Personal Note Taker Drawer
- [ ] Course Progress & Completion Certificate Preview Modal
- [ ] Live Classroom (Zoom/Meet/Teams) Launcher Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Mark Module Complete & Unlock Next Topic Popup
- [ ] Download Offline Video / Study Material Alert
- [ ] Leave Course Rating & Feedback Dialog

---

## M12: Content Authoring Studio
**AI & Core Capabilities:** `Diffusion` `TTS` `Multimodal`

### Functional Blueprint Scope
- Course builder, module / lesson tree
- Slide, worksheet, lesson-plan generation
- Image, poster, diagram, thumbnail generation
- Voice-over, subtitles, dubbing, translation
- Review & approval workflow, versioning
- Reusable content library and tagging

### Pages & Workspaces
- [x] `/lms/studio` — Content Authoring Studio Hub
- [x] `/lms/course-builder` — Interactive Syllabus Builder & Lesson Editor
- [ ] `/lms/media-library` — Interactive Audio/Video/PDF Digital Asset Library

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add New Lesson / Multimedia Block Modal
- [ ] AI Text-to-Speech (TTS) Voiceover Generator Modal
- [ ] AI Course Image & Diagram Diffusion Generator Modal
- [ ] Interactive H5P / Video Quiz Insertion Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish Course Version Confirmation Dialog
- [ ] Delete Lesson Module Confirmation Alert
- [ ] Revert to Previous Draft Warning Modal

---

## M13: Homework & Assignments
**AI & Core Capabilities:** `Rubric prompting` `Similarity`

### Functional Blueprint Scope
- Creation, attachments, due dates, late policy
- Auto and manual grading, rubrics, feedback banks
- Plagiarism and AI-content detection
- Parent visibility, submission reminders

### Pages & Workspaces
- [ ] `/academics/homework` — Homework & Assignment Tracker Dashboard
- [ ] `/academics/homework/evaluate` — Teacher Submission Evaluation & Rubric Grading

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create & Assign New Homework Modal
- [ ] Student Assignment Submission & File Upload Drawer
- [ ] AI Rubric Prompting & Similarity / Plagiarism Scan Modal
- [ ] Voice Note & Annotated Feedback Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Return Homework to Student for Resubmission Alert
- [ ] Publish Grades to Student Portal Confirmation
- [ ] Late Submission Penalty Confirmation Dialog

---

## M14: Library
**AI & Core Capabilities:** `Semantic search` `Recommenders`

### Functional Blueprint Scope
- Catalogue, accession register, ISBN/RFID/barcode
- Issue, return, renew, reserve, fines
- Digital library: e-books, journals, past papers
- Research repository and archives
- Reading history, recommendations, usage reports
- Stock verification, weeding, vendor purchase

### Pages & Workspaces
- [ ] `/library/catalog` — Library Book & Resource Catalogue with Semantic Search
- [ ] `/library/circulation` — Issue, Return & Renew Circulation Desk
- [ ] `/library/elibrary` — Digital Library & e-Book Reader Portal

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add New Book / Resource (ISBN Auto-fill) Modal
- [ ] Issue Book to Student/Staff (Barcode/RFID Scan) Modal
- [ ] Overdue Fine Calculation & Waiver Modal
- [ ] Book Reservation & Hold Queue Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm Book Return & Condition Inspection Popup
- [ ] Report Lost Book & Impose Fine Alert
- [ ] Renew Loan Duration Confirmation Dialog

---

## M15: Fees & Finance
**AI & Core Capabilities:** `Default prediction` `Invoice parsing` `Collection agent`

### Functional Blueprint Scope
- Fee heads & structures per course/batch/category
- Concessions, scholarships, sponsorships, sibling discounts
- Instalments, due dates, fines, partial payments
- Invoices, receipts, refunds, adjustments
- Payment gateways: UPI, cards, net banking, EMI
- Dues tracking, reminder campaigns, defaulter reports
- Accounting: ledgers, vouchers, trial balance, P&L
- Budgeting, cost centres, expense approvals
- Procurement: indent, RFQ, PO, GRN, vendors
- Tax (GST/VAT), TDS, donations, audit exports

### Pages & Workspaces
- [x] `/finance` — Student Fee Collections, Invoicing & Billing Dashboard
- [ ] `/finance/structure` — Fee Head & Installment Structure Configuration
- [ ] `/finance/defaulters` — Fee Defaulters & Overdue Payment Recovery Matrix
- [ ] `/finance/reports` — Daily Collection Register & Cash Book Reports

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Generate Individual / Bulk Student Fee Invoice Modal
- [ ] Collect Fee Payment (Cash/Card/UPI/Cheque) Drawer
- [ ] Fee Concession & Scholarship Waiver Approval Modal
- [ ] AI Default Risk Scorecard & Prediction Modal
- [ ] Payment Receipt & Statement Generator Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Void / Cancel Invoice Confirmation Alert
- [ ] Send Automated WhatsApp/SMS Fee Reminder Alert
- [ ] Refund Caution Deposit Confirmation Dialog

---

## M16: Inventory & Assets
**AI & Core Capabilities:** `Demand forecasting` `Reorder agent`

### Functional Blueprint Scope
- Stores, categories, stock, batch/serial tracking
- Requisition, issue, return, inter-campus transfer
- Purchase orders, GRN, stock valuation
- Fixed assets, depreciation, AMC, warranty
- Lab equipment, sports kit, uniforms, books sale
- Maintenance tickets and service history
- Reorder levels and demand planning

### Pages & Workspaces
- [ ] `/operations/inventory` — Campus Inventory & Fixed Asset Directory
- [ ] `/operations/inventory/purchase` — Purchase Orders & Vendor Requisitions
- [ ] `/operations/inventory/depreciation` — Asset Depreciation & Maintenance Schedule

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add New Asset / Equipment Item Modal
- [ ] Asset Checkout / Allocation to Staff/Lab Modal
- [ ] Purchase Order Creation & Quotation Comparison Drawer
- [ ] AI Reorder Agent & Demand Forecast Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Dispose / Write-off Asset Confirmation Dialog
- [ ] Approve Purchase Order Alert Popup
- [ ] Schedule Equipment Maintenance Alert

---

## M17: Transport
**AI & Core Capabilities:** `Route optimisation` `ETA prediction` `Geo ML`

### Functional Blueprint Scope
- Routes, stops, vehicles, drivers, attendants
- Student route allocation and seat capacity
- GPS live tracking, geofencing, speed alerts
- Pickup / drop attendance, parent live ETA
- Fuel, mileage, maintenance, insurance, permits
- Transport fees and route-wise costing
- SOS / panic alerts, incident reporting

### Pages & Workspaces
- [ ] `/transport/live` — Fleet Live GPS Tracking & Route Map Console
- [ ] `/transport/routes` — Bus Routes, Stops & Pickup Timings Directory
- [ ] `/transport/fleet` — Vehicles & Drivers Registry with Fitness Expiry

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create New Bus Route & AI Stop Optimiser Modal
- [ ] Assign Student to Bus Stop & Seat Allotment Modal
- [ ] Vehicle Maintenance & Fuel Log Entry Modal
- [ ] Driver Shift & Emergency Substitute Allocation Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Broadcast Emergency Delay SMS to Route Parents Popup
- [ ] Geo-fence Breach / Speeding Alert Dialog
- [ ] Decommission Vehicle Confirmation Alert

---

## M18: Hostel & Mess
**AI & Core Capabilities:** `Forecasting` `Text classification`

### Functional Blueprint Scope
- Blocks, rooms, beds, allotment and vacate
- Warden duty, in/out register, visitor pass
- Late-entry alerts, night attendance
- Mess menu planning, billing, waste tracking
- Complaints and maintenance requests

### Pages & Workspaces
- [ ] `/campus/hostel` — Hostel Rooms Directory & Bed Allotment Matrix
- [ ] `/campus/hostel/gate-pass` — Student Outing & Digital Gate-Pass Tracker
- [ ] `/campus/hostel/mess` — Mess Weekly Menu & Nutrition Planner

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Hostel Room & Bed Allocation Wizard Modal
- [ ] Digital Outing Gate-Pass Request & Parent Approval Modal
- [ ] Mess Attendance & Daily Meal Count Logger Drawer
- [ ] Hostel Discipline & Maintenance Complaint Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Approve Overnight Outing Pass Alert
- [ ] Check-in / Curfew Overdue Alert Dialog
- [ ] Vacate Room & Clearance Certificate Confirmation

---

## M19: Communication Hub
**AI & Core Capabilities:** `Drafting` `Translation` `Sentiment`

### Functional Blueprint Scope
- Announcements, circulars, notice board, targeted broadcast
- Parent–teacher and teacher–student chat with moderation
- PTM scheduling, slot booking, meeting minutes
- SMS / Email / WhatsApp / push / IVR integration
- Templates, multilingual delivery, delivery reports
- Feedback forms, surveys, NPS
- Emergency and crisis alerts

### Pages & Workspaces
- [ ] `/communications/broadcast` — Omnichannel Broadcast Hub (Email/SMS/WhatsApp/Push)
- [ ] `/communications/history` — Sent Messages, Delivery Reports & Sentiment Logs
- [ ] `/communications/templates` — Central Message Template Studio with Merge Tags

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Compose New Omnichannel Announcement Modal
- [ ] AI Message Drafting & Multi-lingual Translation Modal
- [ ] Audience Filter & Segment Builder Drawer
- [ ] Schedule Campaign / Auto-Trigger Rule Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm Mass Communication Broadcast to Campus Alert
- [ ] Delete Template Confirmation Dialog
- [ ] Low SMS / WhatsApp Credit Warning Popup

---

## M20: Parent & Student Portal
**AI & Core Capabilities:** `Voice assistant` `Text-to-SQL`

### Functional Blueprint Scope
- Attendance, marks, homework, timetable, fees
- Bus live tracking, leave requests, appointments
- Digital diary, remarks, achievement feed
- Fee payment, receipts, document requests
- Push notifications, offline-first mobile app

### Pages & Workspaces
- [ ] `/portal/parent` — Parent Engagement & Ward Progress Portal
- [ ] `/portal/student` — Student Dashboard (Timetable, Marks, Dues, Notices)

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Parent-Teacher Meeting (PTM) Slot Booking Modal
- [ ] Ask Campus AI Voice / Text Assistant Modal
- [ ] Fee Payment Checkout Modal
- [ ] Leave / Absence Intimation to Class Teacher Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm PTM Appointment Booking Popup
- [ ] Acknowledge Important Circular / Disciplinary Notice Alert
- [ ] Switch Active Ward (for multi-child parents) Dialog

---

## M21: Events, Activities & Awards
**AI & Core Capabilities:** `Image generation` `Planning agent`

### Functional Blueprint Scope
- Academic calendar, event planning, budgets, approvals
- Registration, ticketing, venue & resource booking
- Sports, clubs, houses, competitions, cultural fests
- Volunteering, community service, credit hours
- Awards, merit points, badges, honour roll
- Certificate generation, staff recognition

### Pages & Workspaces
- [ ] `/events/calendar` — Campus Events, Sports Day & Annual Fest Calendar
- [ ] `/events/clubs` — Student Clubs, Societies & Extracurricular Activities
- [ ] `/events/awards` — Student Achievements, Medals & Honors Hall of Fame

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create New Event & AI Itinerary Planner Modal
- [ ] Event Participant Registration & Ticket Modal
- [ ] Confer Award / Certificate to Student Modal
- [ ] AI Event Poster & Banner Generator Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish Event to Campus Calendar Confirmation
- [ ] Cancel Event & Notify Registered Attendees Alert
- [ ] Approve Club Budget Requisition Dialog

---

## M22: Discipline & Wellbeing
**AI & Core Capabilities:** `Risk classification` `Sentiment` `Privacy`

### Functional Blueprint Scope
- Incident logging, severity, action workflow
- Counselling sessions, case notes, confidentiality
- Anonymous anti-bullying reporting
- Health and mental-wellness check-ins
- At-risk watchlist and intervention plans

### Pages & Workspaces
- [ ] `/wellbeing/counselling` — Mental Health & Student Wellbeing Tracker
- [ ] `/wellbeing/discipline` — Disciplinary Incident Logs & Behavioral Matrix

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Confidential Disciplinary Incident Log Modal
- [ ] Counselling Session Booking & Case Note Drawer
- [ ] AI Wellbeing Sentiment & Risk Assessment Drawer
- [ ] Parent Behavioral Meeting Request Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Escalate Severe Wellbeing Flag to Principal Alert
- [ ] Resolve Disciplinary Case Confirmation Dialog
- [ ] Lock Confidential Medical / Case File Warning

---

## M23: Placement & Career
**AI & Core Capabilities:** `Embeddings matching` `Voice agent` `Ranking`

### Functional Blueprint Scope
- Company registry, MOUs, recruiter portal
- Job / internship posting, eligibility filters
- Drives, rounds, shortlists, offers, CTC tracking
- Resume builder and verification
- Aptitude prep, mock interviews, skill assessments
- Skill-gap analysis and training recommendations
- Placement statistics for accreditation
- Alumni network, mentorship, referrals, giving

### Pages & Workspaces
- [ ] `/placements/drives` — Campus Placement Drives & Corporate Companies Hub
- [ ] `/placements/students` — Student Job Readiness, Resume & Eligibility Matrix
- [ ] `/placements/mock-interviews` — AI Voice Mock Interview & Feedback Studio

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add New Corporate Hiring Partner / Drive Modal
- [ ] AI Resume Matcher & Job Description Embeddings Modal
- [ ] Schedule AI Voice Mock Interview Modal
- [ ] Record Job Offer Letter & CTC Details Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Shortlist Eligible Students for Interview Round Alert
- [ ] Publish Final Selection Results Confirmation
- [ ] Revoke Placement Eligibility for Non-compliance Dialog

---

## M24: Accreditation & Compliance
**AI & Core Capabilities:** `RAG` `Summarisation`

### Functional Blueprint Scope
- NAAC / NBA / NIRF / AICTE / UGC / board data packs
- Evidence repository and criteria mapping
- Auto-filled submissions and narratives
- Statutory returns and government portal exports
- Policy library with acknowledgement tracking
- Data protection, consent, retention, erasure
- Internal audit and risk register

### Pages & Workspaces
- [ ] `/accreditation/dashboard` — NAAC, NIRF, NBA & ABET Accreditation Tracker
- [ ] `/accreditation/criteria` — Criterion-wise Metric & Evidence Repository
- [ ] `/accreditation/reports` — Self-Study Report (SSR) & AQAR Generator

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Upload Evidence Document & Criterion Tagging Modal
- [ ] AI SSR Section Drafting & Narrative Summariser Modal
- [ ] Audit Finding & Gap Analysis Drawer
- [ ] Assign Faculty Coordinator to Criteria Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Export Comprehensive SSR Dossier Confirmation
- [ ] Lock Criterion Evidence for External Inspection Alert
- [ ] Flag Missing Compliance Document Warning

---

## M25: Research & Publications
**AI & Core Capabilities:** `Semantic search` `Similarity`

### Functional Blueprint Scope
- Research projects, grants, funding, milestones
- Publications, citations, patents, IPR
- Plagiarism checks and collaboration workspaces
- Research analytics and rankings input

### Pages & Workspaces
- [ ] `/research/publications` — Faculty Research Papers, Journals & Patents
- [ ] `/research/grants` — Research Grants, Funding & Project Milestones

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add New Publication / Citation Record Modal
- [ ] Grant Application Proposal & Budget Breakdown Drawer
- [ ] Semantic Similarity & Literature Review Helper Modal
- [ ] Patent Filing & Intellectual Property Tracker Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Approve Seed Grant Funding Allocation Popup
- [ ] Mark Research Milestone Completed Alert
- [ ] Verify Scopus / Web of Science Indexing Status Confirmation

---

## M26: Reports, BI & Analytics
**AI & Core Capabilities:** `NL2SQL` `Insight narration` `Forecasting`

### Functional Blueprint Scope
- Role-based dashboards: owner, principal, HOD, teacher, parent
- Standard report library, scheduled delivery
- Ad-hoc report builder, pivot, drill-down, export
- Cross-campus benchmarking
- Predictive dashboards: risk, revenue, enrolment
- Warehouse and self-service semantic layer

### Pages & Workspaces
- [ ] `/analytics/executive` — Institutional BI & Executive Insights Board
- [ ] `/analytics/nl2sql` — Natural Language AI Data Explorer (Chat with Campus Data)
- [ ] `/analytics/admissions-finance` — Cohort Retention, Fee Projections & Financial BI

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create Custom KPI Card / Chart Widget Modal
- [ ] Ask Natural Language Question (NL2SQL) Query Drawer
- [ ] Schedule Automated Executive PDF Report Dispatch Modal
- [ ] AI Metric Anomaly & Drop-off Diagnostic Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Export Clean BI Dataset to Excel/CSV Dialog
- [ ] Save Generated SQL Query to Custom Dashboard Alert
- [ ] Reset Dashboard Layout to Default Confirmation

---

## M27: Integrations
### Functional Blueprint Scope
- Payment gateways; accounting (Tally/Zoho/QuickBooks)
- SMS, email, WhatsApp Business API, IVR
- Google Workspace / Microsoft 365 / Zoom / Teams
- Biometric & RFID devices, IP cameras, GPS trackers
- Government, board and university APIs
- Identity providers, HRMS, external ERP
- Public API, SDKs, webhook subscriptions

### Pages & Workspaces
- [ ] `/integrations/marketplace` — API Connectors, LMS, Payment & Biometric App Store
- [ ] `/integrations/webhooks` — Webhook Subscriptions, Payload Logs & Endpoint Health

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Configure New Integration (Stripe, Razorpay, Zoom, Google) Modal
- [ ] Create Webhook Subscription & Secret Generator Modal
- [ ] Test API Endpoint & Inspect Live Payload Drawer
- [ ] Regenerate Integration OAuth Tokens Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Disconnect Integration & Revoke Access Warning
- [ ] Retry Failed Webhook Delivery Alert
- [ ] Rotate Integration Production Secret Confirmation Dialog

---

## M28: SaaS Ops Console
### Functional Blueprint Scope
- Tenant provisioning, plans, quotas
- Usage metering: users, storage, AI tokens
- Billing, invoicing, dunning, trials
- Support desk, ticketing, SLA
- Health monitoring, backups, restore, DR drills
- Release management, staged rollout, sandbox tenants

### Pages & Workspaces
- [ ] `/saas-ops/tenants` — Super-Admin Tenant Registry & Health Monitoring
- [ ] `/saas-ops/billing` — SaaS Subscription Plans, MRR & Invoicing
- [ ] `/saas-ops/system` — System Health, CPU/Memory & Worker Queue Status

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Provision New Customer Tenant Instance Wizard Modal
- [ ] Adjust Tenant Subscription Tier & Seat Limits Modal
- [ ] Maintenance Window & Global Banner Schedule Modal
- [ ] Tenant Database Backup / Restore Trigger Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Suspend Delinquent Tenant Account Alert
- [ ] Initiate Zero-Downtime Maintenance Mode Confirmation
- [ ] Purge Inactive Sandbox Environment Dialog

---

## M29: Marketing & Admissions CRM
**AI & Core Capabilities:** `Lead scoring` `Copy generation` `Attribution`

### Functional Blueprint Scope
- Campaigns, ad-spend attribution, cost per admission
- Website builder, landing pages, SEO, enquiry widgets
- Drip journeys over email / SMS / WhatsApp
- Telecalling console, recordings, counsellor targets
- Education agent portal with commission tracking
- Referral programmes and alumni referrals
- Funnel analytics: enquiry → application → paid → enrolled

### Pages & Workspaces
- [ ] `/crm/leads` — Omnichannel Marketing Lead Capture & Attribution Matrix
- [ ] `/crm/campaigns` — Ad Campaigns, Landing Pages & ROI Analytics
- [ ] `/crm/automation` — Drip Email & WhatsApp Nurturing Sequences

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create Lead Nurturing Campaign Modal
- [ ] AI Ad Copy & Marketing Content Generator Modal
- [ ] Lead Scoring Rule & Intent Qualification Modal
- [ ] Bulk Assign Leads to Admission Counsellors Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Pause Active Ad Campaign Confirmation Alert
- [ ] Bulk Send WhatsApp Blast to Prospective Students Dialog
- [ ] Mark Inactive Leads as Lost / Cold Warning

---

## M30: Gradebook & Assessment
**AI & Core Capabilities:** `Standards mapping` `Comment generation`

### Functional Blueprint Scope
- Weighted categories, formative vs summative
- Standards-based grading and mastery tracking
- Standards alignment: CBSE, ICSE, IB, IGCSE, Common Core, NEP
- Rubrics, comment banks, moderation
- Report card designer per board and grade level
- Progress reports, predicted grades, target setting
- Multi-curriculum support in one institution

### Pages & Workspaces
- [ ] `/academics/gradebook` — Master Gradebook Spreadsheet & Grading Matrix
- [ ] `/academics/report-cards` — Term Report Card Designer & Batch Generation Hub

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Configure Grading Scale (GPA/Percentages/Letter Grades) Modal
- [ ] AI Personalized Student Report Card Comment Generator Modal
- [ ] Bulk Grade Override & Moderator Approval Modal
- [ ] Publish Report Cards to Parent Portal Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Lock Term Gradebook Against Future Edits Alert
- [ ] Confirm Student Grade Moderation Dialog
- [ ] Publish Term Results to All Students Confirmation

---

## M31: Special Education & Inclusion
**AI & Core Capabilities:** `Plan drafting` `Progress analysis`

### Functional Blueprint Scope
- Referral, screening, eligibility determination
- IEP / 504 / RTI / MTSS authoring and versioning
- Goals, accommodations, service minutes, providers
- Progress monitoring and data collection
- Statutory timelines, notices, compliance alerts
- Meeting scheduling, attendance, signatures
- Parent consent and communication trail

### Pages & Workspaces
- [ ] `/inclusion/iep` — Individualized Education Plan (IEP) Management
- [ ] `/inclusion/accommodations` — Classroom Accommodations & Special Educator Tracker

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create New IEP Plan & Learning Objective Modal
- [ ] AI IEP Goal Drafting & Milestone Tracker Drawer
- [ ] Special Educator & Therapist Assignment Modal
- [ ] Quarterly Progress Review Meeting Logger Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Approve Formal IEP with Multi-disciplinary Team Alert
- [ ] Seal Confidential Special Ed Assessment File Dialog
- [ ] Send IEP Review Notice to Parents Confirmation

---

## M32: Substitute & Cover
**AI & Core Capabilities:** `Matching` `Optimisation`

### Functional Blueprint Scope
- Absence reporting and approval
- Substitute pool, qualifications, availability
- Auto-matching and cascade notification
- Cover lesson plan handover
- Substitute timesheets and pay
- Coverage cost analytics

### Pages & Workspaces
- [ ] `/operations/substitute` — Faculty Absence & Daily Cover Management Board
- [ ] `/operations/substitute/history` — Cover Allocation Logs & Teacher Workload Compensation

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Log Teacher Emergency Absence Modal
- [ ] AI Substitute Recommendation & Conflict Matcher Drawer
- [ ] Manual Cover Slot Override Modal
- [ ] Send Instant Cover Notification to Teacher (SMS/Push) Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm Substitute Teacher Assignment Alert
- [ ] Flag Double-Booking / Overload Conflict Dialog
- [ ] Revert Cover Allocation Warning

---

## M33: Professional Development
**AI & Core Capabilities:** `Skill gap` `Recommenders`

### Functional Blueprint Scope
- Training catalogue, mandatory vs elective
- CPD credits, certification renewal reminders
- Classroom observation, coaching cycles, walkthroughs
- Peer learning and communities of practice
- Skill matrix and competency framework
- External PD marketplace and vendors

### Pages & Workspaces
- [ ] `/hr/professional-development` — Teacher Training & CPD Credits Hub
- [ ] `/hr/workshops` — Pedagogical Workshops, Certifications & Peer Observations

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Register for Faculty Training Workshop Modal
- [ ] AI Skill Gap Diagnostic & Recommended Courses Modal
- [ ] Submit External Training Certificate for CPD Points Drawer
- [ ] Peer Classroom Observation Feedback Form Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Approve CPD Credit Units for Faculty Alert
- [ ] Issue Institutional Training Certificate Confirmation
- [ ] Cancel Workshop Registration Dialog

---

## M34: Financial Aid & Scholarships
**AI & Core Capabilities:** `Eligibility matching` `Document AI`

### Functional Blueprint Scope
- Aid application, need assessment, packaging
- Government and board scholarship schemes
- Corporate sponsorship and CSR-funded seats
- Third-party billing and sponsor invoicing
- Loan, EMI and income-share partner integrations
- Disbursement, verification, renewal, revocation
- Aid impact and yield reporting

### Pages & Workspaces
- [ ] `/finance/scholarships` — Financial Aid & Institutional Scholarship Portal
- [ ] `/finance/aid-applications` — Aid Applications Review & Means-Testing Matrix

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create Scholarship Scheme & Eligibility Rules Modal
- [ ] Student Aid Application & Income Document Verification Drawer
- [ ] AI Means-Testing Eligibility Scorer Modal
- [ ] Disburse Scholarship Funds to Student Fee Account Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Approve Financial Aid Grant Confirmation Alert
- [ ] Reject Ineligible Scholarship Application Dialog
- [ ] Revoke Aid for Low Academic Performance Warning

---

## M35: Fundraising & Endowment
**AI & Core Capabilities:** `Propensity to give` `Appeal drafting`

### Functional Blueprint Scope
- Donor CRM, segmentation, giving history
- Campaigns, appeals, giving days, crowdfunding pages
- Pledges, recurring gifts, matching gifts
- Receipting and tax compliance (80G / 501c3 / Gift Aid)
- Endowment and restricted fund tracking
- Stewardship, acknowledgements, donor wall
- Capital projects and naming opportunities

### Pages & Workspaces
- [ ] `/endowment/donors` — Donor Management, Major Gifts & Alumni Pledges
- [ ] `/endowment/campaigns` — Capital Campaigns, Building Funds & Donor Wall

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add New Donor Profile & Wealth Tier Modal
- [ ] Record Donation Pledge & Tax Receipt Generator Drawer
- [ ] AI Propensity-to-Give Predictive Scorer Modal
- [ ] AI Personalized Donor Appeal Letter Drafting Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Issue Tax Exemption 80G / 501(c)(3) Receipt Alert
- [ ] Publish Donor Name to Virtual Donor Wall Confirmation
- [ ] Archive Completed Capital Campaign Dialog

---

## M36: Alumni Relations
**AI & Core Capabilities:** `Engagement scoring` `Matching`

### Functional Blueprint Scope
- Alumni directory, chapters, class years
- Engagement scoring and lifecycle
- Reunions, events, newsletters
- Mentorship and alumni-to-student matching
- Alumni job board and referrals
- Legacy admissions linkage and giving integration

### Pages & Workspaces
- [ ] `/alumni/directory` — Global Alumni Network Directory & Mentorship Board
- [ ] `/alumni/events` — Alumni Reunions, Chapters & Guest Lectures

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Alumni Profile Verification & Graduation Year Tagging Modal
- [ ] Register as Student Mentor Modal
- [ ] Alumni Chapter Creation & Leadership Assignment Modal
- [ ] Post Job / Internship for Current Students Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Approve Alumni Verification Request Confirmation
- [ ] Send Reunion Broadcast to Class of Year Alert
- [ ] Connect Student with Alumni Mentor Dialog

---

## M37: Campus Card & Wallet
**AI & Core Capabilities:** `Fraud detection` `Spend anomaly`

### Functional Blueprint Scope
- One identity across gate, library, canteen, transport, printing, labs
- Prepaid wallet, top-up, auto-recharge, refunds
- Parent-set spend limits and category controls
- Lost card blocking, temporary passes
- Transaction ledger and reconciliation
- Card printing, batch issuance, design templates

### Pages & Workspaces
- [ ] `/campus/smart-card` — Digital Campus Card & NFC/RFID Wallet Management
- [ ] `/campus/transactions` — Campus POS Spend History & Micro-Transactions Ledger

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Issue / Link Digital RFID Smart Card to Student Modal
- [ ] Wallet Top-Up (Online Gateway / Cash Desk) Modal
- [ ] Set Daily Spend Limit & Cafeteria Restriction Drawer
- [ ] AI Spend Anomaly & Fraud Flag Diagnostic Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Instantly Block Lost / Stolen Smart Card Alert
- [ ] Refund Remaining Wallet Balance Confirmation Dialog
- [ ] Unblock Replaced Smart Card Confirmation

---

## M38: Cafeteria & Canteen
**AI & Core Capabilities:** `Demand forecasting` `Menu generation`

### Functional Blueprint Scope
- Menu planning, recipes, nutrition, allergens
- Meal plans, subsidies, free-meal programmes
- POS terminals, queue management, cashless payment
- Pre-order and pickup slots
- Vendor contracts and food-safety logs
- Consumption analytics and waste reduction

### Pages & Workspaces
- [ ] `/cafeteria/pos` — Canteen Point of Sale (POS) & Self-Checkout Terminal
- [ ] `/cafeteria/menu` — Weekly Food Menu, Nutrition Tracker & Inventory Consumption

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add Food Menu Item & Set Dietary Tags (Halal/Vegan/Gluten-Free) Modal
- [ ] AI Canteen Meal Demand Forecasting Drawer
- [ ] Daily Stock Consumption & Waste Logging Modal
- [ ] Cafeteria Vendor Settlement & Payout Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Process Fast RFID Smart Card Payment Popup
- [ ] Mark Item Out of Stock on Display Screens Alert
- [ ] Approve Vendor Invoicing Batch Dialog

---

## M39: Campus Store & Commerce
**AI & Core Capabilities:** `Recommenders` `Forecasting`

### Functional Blueprint Scope
- Bookstore, uniforms, stationery, lab kits, merchandise
- Online storefront with pickup or delivery
- Bundles by class and course
- Returns, exchanges, size management
- Digital product sales: notes, test series, e-books
- Margin, stock and supplier reporting

### Pages & Workspaces
- [ ] `/store/catalog` — Campus Store (Uniforms, Books, Stationery, Merch) Catalogue
- [ ] `/store/orders` — Online Pre-Orders & Pickup Fulfillment Desk

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add New Store Product & Size/Variant Matrix Modal
- [ ] Fulfill Student Pickup Order (Barcode Scan) Modal
- [ ] Low Stock Alert & Auto-Reorder Trigger Drawer
- [ ] Process Return / Size Exchange Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm Order Handover to Student Alert
- [ ] Process Store Item Refund Confirmation
- [ ] Apply Seasonal Back-to-School Discount Dialog

---

## M40: Visitor, Gate & Security
**AI & Core Capabilities:** `Face / ANPR` `Anomaly detection`

### Functional Blueprint Scope
- Visitor pre-registration, QR gate pass, badge printing
- Watchlist and blacklist checks
- ANPR / vehicle entry, contractor and delivery access
- CCTV and access-control integration
- Guard patrol logs and incident reporting
- Emergency drills, mustering, roll call, panic button
- Mass emergency notification

### Pages & Workspaces
- [ ] `/security/gate` — Visitor & Campus Gate Access Console (ANPR & Facial ID)
- [ ] `/security/passes` — Pre-Registered Visitor Passes & Contractor Badge Management

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Register New Campus Visitor (ID Proof Scan & Photo) Modal
- [ ] Pre-Approve Parent / Guest Visit with Digital QR Pass Modal
- [ ] Automatic Number Plate Recognition (ANPR) Vehicle Entry Log Modal
- [ ] Emergency Gate Lockdown Trigger Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Check-Out Visitor & Return Badge Confirmation
- [ ] Flag Blacklisted Visitor / Unauthorized Vehicle Alert
- [ ] Initiate Campus-wide Security Gate Lockdown Dialog

---

## M41: Facility & Maintenance
**AI & Core Capabilities:** `Predictive maintenance` `Ticket triage`

### Functional Blueprint Scope
- Building, floor, room and space inventory
- Room / lab / auditorium booking with approvals
- Work orders, breakdown and preventive maintenance
- Housekeeping schedules and checklists
- Utility metering, energy and water consumption
- Vendor SLAs, AMC contracts, spare parts
- Space utilisation analytics

### Pages & Workspaces
- [ ] `/facility/maintenance` — Campus Facilities, Work Orders & Maintenance Desk
- [ ] `/facility/booking` — Auditorium, Lab & Sports Ground Space Reservation Hub

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Raise Maintenance Work Order (Plumbing, Electrical, HVAC) Modal
- [ ] AI Predictive Maintenance & Equipment Lifecycle Drawer
- [ ] Assign Maintenance Technician & SLA Deadline Modal
- [ ] Book Campus Facility for School Event Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Resolve & Close Maintenance Ticket Confirmation
- [ ] Approve Facility Booking Request Alert
- [ ] Flag Urgent Classroom Safety Hazard Dialog

---

## M42: Smart Campus & IoT
**AI & Core Capabilities:** `Edge inference` `Anomaly detection`

### Functional Blueprint Scope
- Device fleet: biometric, RFID, cameras, smart boards
- Digital signage and notice screens
- Energy, water, air-quality and occupancy sensors
- Edge gateway with local buffering
- Device health, firmware, provisioning
- Automation rules and alerts

### Pages & Workspaces
- [ ] `/smart-campus/iot` — Smart Campus IoT Sensors (Energy, Water, Air Quality, Smart Lighting)
- [ ] `/smart-campus/alerts` — Real-Time IoT Telemetry & Threshold Alerts

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add New IoT Device / Gateway Provisioning Modal
- [ ] Configure Environmental Threshold Alert Rules Modal
- [ ] Automated Energy Saving / HVAC Schedule Drawer
- [ ] Inspect Device Telemetry & Edge Health Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Trigger High CO2 / Poor Air Quality Classroom Alert
- [ ] Reboot Unresponsive IoT Edge Gateway Confirmation
- [ ] Toggle Night Mode Energy Shutoff Dialog

---

## M43: Health Centre & Telemedicine
**AI & Core Capabilities:** `Triage assist` `Outbreak detection`

### Functional Blueprint Scope
- Appointments, walk-ins, sick bay, triage
- Light medical record, allergies, chronic conditions
- Prescriptions, pharmacy stock, dispensing
- Immunisation schedules and compliance
- Tele-consultation and hospital referrals
- Insurance claims and reimbursements
- Outbreak monitoring and health advisories

### Pages & Workspaces
- [ ] `/health/clinic` — Campus Health Centre, Clinic Visits & EHR Records
- [ ] `/health/telemedicine` — Teleconsultation & Doctor On-Duty Scheduling

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Log Student Clinic Visit & Administer First Aid Modal
- [ ] Student Chronic Illness & Medication Schedule Drawer
- [ ] AI Clinical Triage Assistant & Outbreak Detection Modal
- [ ] Generate Medical Leave Certificate & Parent Notification Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Trigger Campus Infectious Disease Outbreak Alert
- [ ] Emergency Ambulance / Hospital Transfer Confirmation
- [ ] Lock Student Medical Confidentiality Dialog

---

## M44: Sports & Athletics
**AI & Core Capabilities:** `Pose estimation` `Injury risk`

### Functional Blueprint Scope
- Teams, squads, tryouts, selection
- Fixtures, leagues, tournaments, results
- Fitness testing, training plans, load monitoring
- Injury log, physio, return-to-play clearance
- Equipment, kit issue, ground booking
- Eligibility rules and athletic scholarships

### Pages & Workspaces
- [ ] `/sports/teams` — Athletic Teams, Tournaments & Sports Fixtures
- [ ] `/sports/performance` — Athlete Fitness Tracking, Pose Estimation & Injury Prevention

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create Sports Team Roster & Coach Assignment Modal
- [ ] Record Match Score & Tournament Bracket Drawer
- [ ] AI Pose Estimation & Athletic Biomechanics Analyzer Modal
- [ ] Log Sports Injury & Physio Rehab Protocol Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Declare Tournament Winner & Award Points Popup
- [ ] Bench Injured Athlete for Medical Rest Alert
- [ ] Publish Sports Trial Selection Results Dialog

---

## M45: Early Years & Day Care
**AI & Core Capabilities:** `Photo tagging` `Milestone insights`

### Functional Blueprint Scope
- Developmental milestones and observation portfolios
- Nap, meal, nappy and mood logs
- Live photo and activity feed for parents
- Staff-to-child ratio monitoring
- Authorised pickup, ID verification, late fees
- Montessori / EYFS / NEP foundational curriculum

### Pages & Workspaces
- [ ] `/early-years/daily-log` — Kindergarten & Daycare Daily Activity Log (Naps, Meals, Potty)
- [ ] `/early-years/milestones` — EYFS Developmental Milestone Progress & Photo Wall

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Quick Multi-child Activity Logger Modal (Meal, Nap, Play)
- [ ] Upload Milestone Photo with AI Face-Tagging Modal
- [ ] Log Incident / Minor Bump Report & Notify Parents Drawer
- [ ] Generate Weekly Early Years Progress Report Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Send Instant Daily Activity Summary to Parents Alert
- [ ] Authorized Pickup Guardian Verification Confirmation
- [ ] Mark Child Checked In / Out Dialog

---

## M46: Trips & Consent
**AI & Core Capabilities:** `Risk drafting`

### Functional Blueprint Scope
- Trip planning, itinerary, costing, capacity
- Risk assessments and approval workflow
- Digital consent forms with e-signature
- Medical and dietary information packs
- Headcount, live tracking, check-in points
- Incident reporting and post-trip review

### Pages & Workspaces
- [ ] `/trips/excursions` — Field Trips, Excursions & Educational Tours Directory
- [ ] `/trips/consent` — Digital Parent Consent Slip & Payment Tracking Console

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Plan New School Excursion & AI Risk Assessment Modal
- [ ] Send Digital Consent Form & Itinerary to Parents Drawer
- [ ] Track Student Consent Sign-off & Medical Notes Drawer
- [ ] Assign Chaperone Teachers & Student Roster Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Approve Field Trip & Secure Insurance Clearance Alert
- [ ] Exclude Student Without Signed Parent Consent Warning
- [ ] Broadcast Trip ETA Update to Parents Dialog

---

## M47: Grievance & Safeguarding
**AI & Core Capabilities:** `Risk language detection` `Privacy`

### Functional Blueprint Scope
- Anonymous complaint intake and whistleblowing
- Anti-ragging, POSH / ICC, SC-ST cell, equal opportunity
- Safeguarding and child-protection case management
- Case workflow, statutory timelines, escalation
- Committee constitution, meetings, minutes, resolutions
- Board and trust governance, statutory registers
- Confidentiality controls and restricted access

### Pages & Workspaces
- [ ] `/safeguarding/grievances` — Confidential Safeguarding & Grievance Redressal Portal
- [ ] `/safeguarding/posh` — Anti-Bullying, PoSH & Child Protection Case Tracker

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Submit Anonymous / Confidential Grievance Modal
- [ ] AI Sensitive Risk Language Detection Diagnostic Drawer
- [ ] Form Inquiry Committee & Assign Hearing Date Modal
- [ ] Record Formal Case Hearing Minutes & Remedial Action Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Escalate Critical Safeguarding Incident to Board Alert
- [ ] Close Grievance Case with Signed Resolution Dialog
- [ ] Lock Sensitive Investigation Records Warning

---

## M48: Legal, Contracts & Insurance
**AI & Core Capabilities:** `Clause extraction` `Renewal alerts`

### Functional Blueprint Scope
- Contract lifecycle: draft, approve, sign, renew, terminate
- MOU and affiliation repository
- Litigation and notice tracking
- Student, staff, asset, vehicle and liability insurance
- Claims workflow and premium scheduling
- Regulatory licence and permit renewals

### Pages & Workspaces
- [ ] `/legal/contracts` — Institutional Legal Contracts & Vendor Agreements Hub
- [ ] `/legal/insurance` — Campus Asset & Student/Staff Group Insurance Policies

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Upload New Contract & AI Clause Extraction Drawer
- [ ] Contract Renewal Alert & Expiration Tracker Modal
- [ ] File Insurance Claim & Damage Evidence Drawer
- [ ] Legal Risk & Regulatory Compliance Checklist Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Approve Vendor Contract Renewal Alert
- [ ] Send Dispute Notice to Vendor Confirmation
- [ ] Archive Terminated Contract Dialog

---

## M49: Documents & e-Signature
**AI & Core Capabilities:** `OCR` `Semantic search`

### Functional Blueprint Scope
- Central document store with folders, tags, permissions
- Template library with merge fields and bulk generation
- Version control, watermarking, expiry
- e-Signature workflows: offers, consents, contracts
- Retention schedules and legal hold
- OCR-indexed full-text search

### Pages & Workspaces
- [ ] `/documents/vault` — Institutional Document Vault & Template Repository
- [ ] `/documents/e-sign` — Digital e-Signature Workflow & Signer Tracking

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Upload Official Document with OCR Text Extraction Modal
- [ ] Prepare Document for e-Signature (Drag-and-Drop Signature Fields) Drawer
- [ ] Issue Formal Transcripts / Bonafide Certificate Modal
- [ ] Semantic Search across Institutional Archive Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Execute Digital Signature with Legal Audit Trail Popup
- [ ] Void e-Signature Request Alert
- [ ] Revoke Document Access Permissions Dialog

---

## M50: Verifiable Credentials
**AI & Core Capabilities:** `Forgery detection` `Revenue line`

### Functional Blueprint Scope
- Tamper-evident transcripts, diplomas, mark sheets
- Digital badges and micro-credentials
- Public verification portal for employers
- Cryptographic / blockchain anchoring
- Bulk issuance, revocation, reissue
- Employer verification API as a paid service

### Pages & Workspaces
- [ ] `/credentials/blockchain` — Verifiable Digital Credentials & Blockchain Degrees
- [ ] `/credentials/verify` — Public One-Click Degree Verification Portal

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Issue Cryptographic Verifiable Degree / Certificate Modal
- [ ] Batch Mint Student Blockchain Credentials Drawer
- [ ] Inspect Digital Credential Merkle Proof & Signature Drawer
- [ ] Revoke Tampered or Fraudulent Degree Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish Verifiable Credentials Batch to Blockchain Alert
- [ ] Confirm Degree Revocation with Public Ledger Notice Dialog
- [ ] Download W3C Compliant Verifiable Credential JSON-LD Popup

---

## M51: International Students
**AI & Core Capabilities:** `Credential mapping` `Translation`

### Functional Blueprint Scope
- International application and credential evaluation
- Visa documents (I-20 / CAS), SEVIS / UKVI style reporting
- Overseas agent management and commissions
- Multi-currency payments and FX handling
- Arrival, orientation, housing, buddy programme
- Attendance and status compliance monitoring
- Country-specific statutory reporting

### Pages & Workspaces
- [ ] `/international/students` — International Student Registry & Visa Compliance
- [ ] `/international/visa` — Visa Expiry, I-20 / CAS Tracking & Embassy Documentation

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Register International Student & Passport/Visa Upload Modal
- [ ] Foreign Credential Evaluation & Grade Conversion Modal
- [ ] Generate Visa Support Letter / CAS Certificate Drawer
- [ ] Track Proof of Financial Support & English Proficiency Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Trigger Visa Expiration 60-Day Warning to Student Alert
- [ ] Report Status Change to Immigration Authority Dialog
- [ ] Confirm Arrival Onboarding Checklist Completion

---

## M52: Study Abroad & Credit Transfer
**AI & Core Capabilities:** `Syllabus similarity` `Knowledge graph`

### Functional Blueprint Scope
- Partner university registry and agreements
- Articulation and credit-mapping tables
- Semester exchange, mobility windows, applications
- Transcript exchange and credit recognition
- Twinning, dual-degree and pathway programmes

### Pages & Workspaces
- [ ] `/study-abroad/programs` — Exchange Programs, Partner Universities & Global MoUs
- [ ] `/study-abroad/credits` — Credit Transfer & Syllabus Equivalence Evaluation Matrix

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Add Partner University & Exchange Agreement Modal
- [ ] Student Study Abroad Application & SOP Review Drawer
- [ ] AI Syllabus Similarity & Course Credit Equivalence Modal
- [ ] Approve Transferred Credits to Student Transcript Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm Student Exchange Nomination to Partner Univ Alert
- [ ] Reject Credit Transfer for Incompatible Syllabus Dialog
- [ ] Archive Expired University MoU Warning

---

## M53: Internships & Apprenticeships
**AI & Core Capabilities:** `Matching` `Log summarisation`

### Functional Blueprint Scope
- Internship registry, industry partners, MOUs
- Allocation, mentor assignment, duration, credits
- Daily log books and weekly reports
- Industry mentor evaluation and rubric
- Stipend, attendance and compliance tracking
- NEP / AICTE style internship reporting

### Pages & Workspaces
- [ ] `/internships/opportunities` — Industry Internships & Apprenticeships Board
- [ ] `/internships/logbook` — Student Work Logbooks, Mentor Reviews & Hours Tracker

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Post New Industry Internship Opportunity Modal
- [ ] Student Daily Work Log & Reflection Submission Drawer
- [ ] AI Internship Log Summariser & Skill Evaluation Modal
- [ ] Employer Mid-term / Final Evaluation Scorecard Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Approve Internship Completion & Academic Credits Alert
- [ ] Flag Incomplete Work Hours / Low Performance Warning
- [ ] Issue Industry Experience Certificate Dialog

---

## M54: Coaching & Test-Prep
**AI & Core Capabilities:** `Rank prediction` `Adaptive testing`

### Functional Blueprint Scope
- Batch and doubt-session scheduling
- Test series, sectional tests, all-India ranking
- Rank prediction and college-fit prediction
- Faculty payout by hours or batch performance
- Question bank marketplace and paper licensing
- Multi-branch batch replication

### Pages & Workspaces
- [ ] `/coaching/test-prep` — Competitive Exam Prep (SAT/ACT/JEE/NEET/GRE) Dashboard
- [ ] `/coaching/mock-tests` — Adaptive Mock Exam Simulator & All-India Rank Predictor

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create High-Stakes Adaptive Mock Test Modal
- [ ] AI All-India Rank (AIR) & Weak Area Predictor Drawer
- [ ] Topic-wise Adaptive Drill & Question Generator Modal
- [ ] Student Performance Diagnostic Consultation Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish Mock Test All-Campus Leaderboard Alert
- [ ] Reset Student Mock Test Attempt Confirmation
- [ ] Recommend AI Targeted Remedial Practice Set Dialog

---

## M55: Franchise & Chain
**AI & Core Capabilities:** `Benchmarking` `Forecasting`

### Functional Blueprint Scope
- Franchisee onboarding, agreements, territory rights
- Royalty, revenue share and settlement automation
- Central catalogue, fee and content push to branches
- Brand compliance audits and checklists
- Per-branch P&L and league tables
- Franchise lead routing and territory allocation

### Pages & Workspaces
- [ ] `/franchise/headquarters` — Multi-Campus Franchise Headquarters & Benchmarking
- [ ] `/franchise/royalty` — Franchise Royalty Fees, Audits & Brand Compliance Console

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Onboard New Franchise Branch & Territory Allotment Modal
- [ ] Cross-Campus Academic & Financial Benchmarking Drawer
- [ ] Calculate Monthly Franchise Royalty Invoicing Modal
- [ ] Schedule Surprise Quality Inspection Audit Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Issue Brand Non-Compliance Notice to Franchisee Alert
- [ ] Approve New Franchise License Agreement Dialog
- [ ] Suspend Delinquent Branch System Access Warning

---

## M56: Course & Faculty Feedback
**AI & Core Capabilities:** `Sentiment` `Theme extraction`

### Functional Blueprint Scope
- Course evaluation surveys per term
- Anonymous feedback with response-rate drives
- Faculty scorecards and trend tracking
- 360 feedback from peers and HODs
- Action plans and follow-up verification
- Accreditation-ready feedback evidence

### Pages & Workspaces
- [ ] `/academics/feedback` — Student Course & Faculty Evaluation Survey Dashboard
- [ ] `/academics/feedback/sentiment` — AI Feedback Sentiment Analysis & Emerging Themes

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Create End-of-Semester Student Feedback Survey Modal
- [ ] AI Feedback Sentiment & Qualitative Theme Extraction Drawer
- [ ] Share Confidential Feedback Summary with Faculty Member Modal
- [ ] Faculty Action Plan & Pedagogical Improvement Plan Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish Anonymous Student Feedback Survey Alert
- [ ] Lock Survey Responses & Generate Campus Averages Dialog
- [ ] Flag Negative Teaching Outlier to Dean Warning

---

## M57: Service Desk & Student Services
**AI & Core Capabilities:** `Ticket triage` `RAG deflection`

### Functional Blueprint Scope
- One-stop catalogue: IT, admin, hostel, transport, finance
- Ticketing, SLAs, escalation, satisfaction rating
- Knowledge base and self-service answers
- Bonafide, transcript and document request workflows
- Appointment booking with offices and counsellors
- Queue and token management for front desks

### Pages & Workspaces
- [ ] `/helpdesk/tickets` — Student & Staff IT/Facility Service Desk Hub
- [ ] `/helpdesk/kb` — Self-Service Knowledge Base & RAG AI Answer Bot

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Submit Support Ticket (IT, Hostel, Fee, Academics) Modal
- [ ] AI Ticket Auto-Triage, Priority & Category Classifier Drawer
- [ ] Create Knowledge Base Article & RAG Indexer Modal
- [ ] Agent Internal Note & Ticket Resolution Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Resolve Support Ticket & Send CSAT Survey Alert
- [ ] Escalate Unanswered Ticket Breaching SLA Dialog
- [ ] Deflect Ticket with Instant AI Answer Confirmation

---

## M58: Volunteering, PTA & Community
### Functional Blueprint Scope
- PTA committees, elections, meetings, minutes
- Volunteer opportunity posting and sign-up
- Community service hours tracking and verification
- Parent groups, class representatives, room parents
- Community partner and NGO registry

### Pages & Workspaces
- [ ] `/community/pta` — Parent-Teacher Association (PTA) & Committee Hub
- [ ] `/community/volunteering` — Campus Volunteer Opportunities & Community Outreach

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Schedule PTA Executive Meeting & Agenda Creator Modal
- [ ] Volunteer Drive Registration & Skill Tagging Drawer
- [ ] Community Service Hours Log & Student Verification Drawer
- [ ] Record PTA Meeting Minutes & Action Items Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish PTA Meeting Minutes to All Parents Alert
- [ ] Award Community Service Badge to Student Dialog
- [ ] Call Emergency General PTA Body Meeting Confirmation

---

## M59: Sustainability & ESG
**AI & Core Capabilities:** `Forecasting` `Report narration`

### Functional Blueprint Scope
- Energy, water, waste and paper consumption tracking
- Carbon footprint and reduction targets
- Green campus scoring and audits
- SDG mapping for rankings and accreditation
- Sustainability reporting pack

### Pages & Workspaces
- [ ] `/esg/sustainability` — Campus Sustainability & Carbon Footprint Dashboard
- [ ] `/esg/waste-water` — Green Campus Audits: Energy, Water & Waste Management

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Log Monthly Energy & Solar Generation Data Modal
- [ ] AI ESG Narrative & Sustainability Report Drafter Drawer
- [ ] Campus Tree Planting & Biodiversity Tracker Drawer
- [ ] Water Recycling & Rainwater Harvesting Metrics Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish Annual Green Campus Sustainability Audit Alert
- [ ] Flag Resource Wastage Anomaly in Campus Blocks Dialog
- [ ] Submit Institution for Eco-School Certification Confirmation

---

## M60: Migration & Onboarding Toolkit
**AI & Core Capabilities:** `Schema matching` `Agents`

### Functional Blueprint Scope
- Importers for competitor systems and spreadsheets
- Field-mapping wizard with validation and dry run
- Duplicate detection and merge
- Historical load: marks, fees, attendance
- Go-live cutover checklist and rollback
- Guided setup templates by institution type

### Pages & Workspaces
- [ ] `/onboarding/migration` — Legacy Data Migration Studio (CSV/Excel/SQL)
- [ ] `/onboarding/readiness` — Institution Go-Live Readiness & Data Cleansing Checklist

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Upload Legacy Dataset & AI Schema Matcher Modal
- [ ] Data Cleansing, Deduplication & Validation Error Drawer
- [ ] Dry-Run Test Migration & Rollback Simulator Drawer
- [ ] Execute Production Data Import Wizard Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Confirm Final Legacy Data Overwrite Alert
- [ ] Download Data Migration Error Log CSV Dialog
- [ ] Certify Institution Go-Live Readiness Confirmation

---

## M61: Partner & Marketplace
### Functional Blueprint Scope
- Reseller and implementation-partner portal
- Deal registration, quoting, commissions
- Partner certification and training
- App and integration marketplace with reviews
- Developer portal, API keys, sandbox tenants
- Revenue share and payout automation

### Pages & Workspaces
- [ ] `/marketplace/apps` — EdTech App Store & Third-Party Extension Marketplace
- [ ] `/marketplace/developer` — Developer Portal, Partner API Keys & Sandbox

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Install Third-Party EdTech App & Grant Scopes Modal
- [ ] Publish Partner App to Institutional Store Drawer
- [ ] Create Developer Sandbox & OAuth Credentials Modal
- [ ] Review Partner App Security & Data Permissions Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Revoke Marketplace App Access to Student Data Alert
- [ ] Approve Partner Extension for Institutional Use Dialog
- [ ] Uninstall Application & Clean Associated Webhooks Warning

---

## M62: Trust Centre & Certifications
### Functional Blueprint Scope
- Public trust page: security, privacy, uptime, subprocessors
- SOC 2 / ISO 27001 / ISO 27701 evidence and controls
- GDPR, DPDP, FERPA, COPPA documentation and DPAs
- VPAT / WCAG accessibility conformance
- Penetration test summaries, vulnerability disclosure
- Status page, incident history, RCA publication
- AI transparency notes and model cards

### Pages & Workspaces
- [ ] `/trust/certifications` — Security Trust Centre (SOC 2, ISO 27001, HIPAA, FERPA)
- [ ] `/trust/vulnerability` — Security Audit Logs, Penetration Testing & SLA Uptime

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Request Access to SOC 2 Type II Compliance Report Modal
- [ ] Record Vulnerability Disclosure & Patch Fix Timeline Drawer
- [ ] Automated Continuous Compliance Evidence Scanner Drawer
- [ ] Vendor Security Risk Assessment Questionnaire Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Publish Public Trust Centre Status Page Alert
- [ ] Sign Security Mutual NDA Confirmation Dialog
- [ ] Acknowledge Critical Security Advisory Warning

---

## M63: White-label App Factory
### Functional Blueprint Scope
- Per-tenant branded app build and store publishing
- Custom icon, splash, theme, module visibility
- Push certificates, deep links, store metadata
- Staged rollout and forced-update policy
- App analytics per tenant

### Pages & Workspaces
- [ ] `/app-factory/builds` — White-Label Mobile App Builder (iOS & Android)
- [ ] `/app-factory/deploy` — App Store & Google Play Auto-Publishing Console

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Configure White-label App Colors, Splash Screen & Icons Modal
- [ ] Trigger Cloud Build for iOS (IPA) & Android (APK/AAB) Drawer
- [ ] Upload Apple Developer & Google Play Service Account Keys Modal
- [ ] Over-The-Air (OTA) Instant Feature Update Deployer Drawer

### Action Popups, Confirmations & Micro-Interactions
- [ ] Submit App Build to Apple App Store Confirmation Alert
- [ ] Force Over-the-Air App Update on Student Phones Dialog
- [ ] Revoke Mobile App Signing Certificate Warning

---

## M64: Offline & Edge Node
**AI & Core Capabilities:** `Small models` `On-device`

### Functional Blueprint Scope
- Local sync server for low-connectivity campuses
- Offline attendance, fees and exams with later sync
- Conflict detection and resolution rules
- Biometric and camera buffering at the edge
- Local small-model inference when the cloud is unreachable
- Bandwidth-aware media delivery

### Pages & Workspaces
- [ ] `/edge/offline` — Campus Edge Node & Local Server Cache Hub
- [ ] `/edge/sync` — Offline Bidirectional Sync & Conflict Reconciliation Matrix

### Modals & Drawers (Data Collection & Complex Workflows)
- [ ] Register On-Premises Edge Micro-Server Modal
- [ ] Local AI Model Deployment & Edge Inference Manager Drawer
- [ ] Review & Resolve Offline Sync Conflicts Drawer
- [ ] Configure Offline Attendance & LMS Local Cache Rules Modal

### Action Popups, Confirmations & Micro-Interactions
- [ ] Force Synchronize Edge Server with Cloud DB Alert
- [ ] Reconcile Conflicted Student Attendance Records Dialog
- [ ] Switch Campus to Offline Disaster Recovery Mode Confirmation

---
