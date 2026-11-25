# Stage 3 review — feedback

Use this sheet with the [Stage 3 walkthrough](STAGE-3-WALKTHROUGH.md). Mark **Works** after checking a module. Under **Change**, describe behavior or wording to revise. Under **Missing**, describe anything you expected to find. In **Notes**, include the institution, role, menu path and what you saw. Include language, screen width or connection state when relevant. Use roles and fictional record types when describing a finding.

| Module | Works | Change | Missing | Notes |
|---|---|---|---|---|
| M08 Forms & fields | | | | |
| M09 Import data | | | | |
| M12 Admissions | | | | |
| M13 Learners | | | | |
| M14 Families | | | | |
| M15 Academic structure | | | | |
| M16 Timetable | | | | |
| M17 Attendance | | | | |
| M18 Fees | | | | |
| M19 Accounting | | | | |
| M20 Gradebook | | | | |
| M21 Exams | | | | |
| M22 Report cards | | | | |
| M23 Issued documents | | | | |
| M24 Messages & notices | | | | |
| M25 Family | | | | |
| M26 My portal | | | | |
| M27 Staff portal | | | | |
| M28 Dashboards | | | | |
| M86 Year-end rollover | | | | |

## Owner review 2026-11-25

Reviewed with the review pack (`OWNER-CHECKLIST.md` section A). Decision: **"fix the 4 points, then approve the
Stage 3 freeze"** (D78).

| # | Point | Outcome |
|---|---|---|
| 1 | M25/M26 home card "Attendance" counts absences, reads like "no attendance" | Fixed in NEX-182: **Absences this week** (en, hi, ta); staff card unchanged |
| 2 | M12 Add enquiry refuses `+91 98765 00000` (spaces) with an unclear message | Fixed in NEX-182: spaces, dashes, dots and brackets removed before the E.164 check; message gives an example |
| 3 | M86 Year-end rollover is read-only (D76) | Build tasks NEX-193 (backend) and NEX-194 (screens) |
| 4 | M12 public admissions form missing | Build tasks NEX-185 (API with abuse limits) and NEX-186 (form, no sign-in) |
