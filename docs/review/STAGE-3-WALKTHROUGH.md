# Stage 3 review build — walkthrough

## Run the review build

From the repository root, start the demo with the installed frontend dependencies.

```sh
fnm exec --using=24 -- pnpm --dir frontend review:start
```

Open the local address printed by the command. Pick an institution and role on the sign-in page. Use **Switch user** in the top bar to try the next role and **Switch institution** to return to the picker. Stop the build with Ctrl+C.

For each sign-in below, start at **Home**, open the menu and visit every entry. Check the page heading and the demo banner. Look for untranslated keys, text that runs off the screen, and records that belong to someone outside the role's scope. Repeat at 360 px using the menu button. Try the light and dark themes. Record findings on the [Stage 3 feedback sheet](STAGE-3-FEEDBACK.md).

On the review machine with Playwright's browser installed, run the automatic checks from the repository root.

```sh
fnm exec --using=24 -- pnpm --dir frontend e2e
```

Open `frontend/playwright-report/index.html` for the results. The persona tests use each signed-in user's own menu on desktop and at 360 px. A failing menu step names the page path.

## How to use the menu for each role

| Sign-in | Stage 3 route to follow |
|---|---|
| Administrator and leader | Start at **Home → Key metrics → Dashboards**. Return to the menu and follow the staff checks below, from **Forms & fields** through **Year-end rollover**. Each demo administrator also holds the owner role. |
| Teacher | Start with **Staff portal**. Follow its quick links to **Timetable**, **Attendance**, **Gradebook** and **Messages & notices**. From the menu, review **Academic structure**, **Learners**, **Families**, **Exams**, **Report cards** and **Issued documents** where available. Check which actions the role can take. |
| Guardian | Open **Family**, select a child if a selector appears, and follow the available cards and links. From the menu, check **Learners**, **Families**, **Academic structure**, **Timetable**, **Fees**, **Exams**, **Report cards**, **Issued documents** and **Messages & notices**. Check each family's records against the child or household shown on its home page. |
| Learner | Open **My portal**. Follow the cards and quick links for the signed-in learner, then visit the other menu entries. In **Timetable**, **Fees**, **Exams**, **Report cards**, **Issued documents** and **Messages & notices**, check the class group, family scope or thread membership as applicable. |

Menu entries depend on the institution's plan and the role's permissions. Some entries, including the portals, also check access after opening. A **No access** page should offer a way home and reveal no records. Record an unexpected denial for the intended role as a finding.

## Walkthrough per institution

Use the role routes above for each sign-in. The checks below highlight what to compare when switching between them. The staff checklist in the next section gives the clicks within each module.

### Little Steps — early years

1. **Administrator / leader** — Start with **Key metrics**, then **Academic structure → Programs & classes**. Pick a class group and find its timetable. Check the currency on **Fees → Invoices** and the dates on **Year-end rollover** in Indian English.
2. **Teacher** — Open **Attendance** from **Staff portal**, choose a group and a session, and inspect the roll. Open **Learners → Guardians** and compare the pickup badges with **Families**. This teacher also has a guardian assignment. Check restricted details against the selected family.
3. **Guardian** — Follow **Family → Report cards**, return to **Family** and open **Issued documents**. Check the household against **Families**. Early years has no learner sign-in in the demo.

### Riverside School — K–12 group, North and South campuses

1. **Administrator / group leader** — Open **Academic structure → Programs & classes** and compare the class groups for the two campuses where identified. Follow a group into **Timetable → Week**. On **Dashboards**, check the scope and the time shown under **As of**.
2. **Teacher** — Use the North campus teacher sign-in. Go from **Staff portal** to **Timetable**, then **Gradebook → Assessments → Mark sheet**. Check the selected group and the maximum marks on the assessment.
3. **Guardian** — Open **Family → Fees → Invoices** and expand an invoice. Compare the household with **Families**, then open **Exams → Hall tickets & re-evaluation** to check which records the family can see.
4. **Learner** — Open **My portal → Timetable**, then **Report cards**. Open a published term when one is listed. Switch between Hindi and English using **Language** and check that the same records remain readable.

### Northbridge University — higher education

1. **Administrator / leader** — Open **Academic structure → Subjects** and filter the offerings by academic year. Then open **Accounting → Journal**, expand a reference and compare its debits and credits. Check the university's currency and local dates.
2. **Teacher** — From **Staff portal** open **Gradebook**, select an assessment and inspect its marks and any rubric. In **Timetable → Teacher load**, compare weekly periods and minutes.
3. **Guardian** — Open **Family**, then **Issued documents**. Inspect a document number and its signatures count. Check that staff letters and private revocation reasons are absent from the family view.
4. **Learner** — Open **My portal → Report cards** and select a term, then check **Exams → Hall tickets & re-evaluation**. Look for the learner's published results and family exam records.

### Apex Coaching — test preparation

1. **Administrator / leader** — Open **Forms & fields → Fields**, then **Admissions → Applications** and **Offers & waitlist**. In **Fees**, inspect the rupee amounts. Switch between Tamil and English, checking the same tabs and totals.
2. **Teacher** — Open **Staff portal → Attendance** and choose a session. This teacher also has a guardian assignment. Check the teaching tools and the family scope separately.
3. **Guardian** — Open **Family → Fees → Payments**, then **Timetable → Week**. Check the receipt date and the family's class groups.
4. **Learner** — Open **My portal → Messages & notices → Messages**. Open a thread if present and return to the list. At phone width, check that the Tamil headings and navigation fit.

### Harmony Music Academy — skills training

1. **Administrator / leader** — Open **Academic structure → Programs & classes**, then **Timetable → Rooms & bells**. Inspect a room and its capacity. In **Year-end rollover**, filter promotion decisions and check that the selected run stays selected on reload.
2. **Teacher** — Open **Staff portal → Timetable** and compare the desktop week grid with the 360 px weekday lists. This teacher also has a guardian assignment. In **Families**, check pickup rights and the visibility of restricted details.
3. **Guardian** — Open **Family → Report cards**, then **Messages & notices → Notices**. Compare the family shown in **Learners** with the linked household.
4. **Learner** — Open **My portal → Issued documents**, then **Timetable**. Check the document dates and class times in the Singapore locale.

## Staff checklist — inside each Stage 3 screen

Use the administrator for the management screens and the indicated sign-in for the three personal portals. With each role, follow only actions the screen offers. Use fictional values for any demo edits.

| Menu item | Click path and what to look for |
|---|---|
| Forms & fields (M08) | In **Fields**, pick a **Record type** and inspect required and sensitive badges. Open **Add custom field** to see the label and field key. Compare the field counts in **Forms** and the step counts and patterns in **Workflows & numbering**. |
| Import data (M09) | Open a past job. Compare valid, error and total counts in **Job summary**. Check **Column mappings** and the row and column in **Dry-run issues**. **Back to imports → New import** opens registration. |
| Admissions (M12) | In **Enquiries**, filter by status and open an enquiry. Use **Add enquiry** with fictional contact details and check for **New** after saving. Open **Applications**, then **Offers & waitlist** and check offer expiry and waitlist order. |
| Learners (M13) | Use **Search learners**, open a profile and inspect **Details**, **Enrolments**, **Documents** and **Guardians**. Compare sensitive details under the administrator and teacher sign-ins. |
| Families (M14) | Find the learner's household and check **Members**, **Guardians** and **Authorised pickups**. Compare pickup permission, court restriction badges and access to a court order note. |
| Academic structure (M15) | In **Programs & classes**, follow a program through its year levels to a class group. Inspect **Add class group**. Under **Subjects**, filter **Subject offerings** by **Academic year**. |
| Timetable (M16) | In **Week**, choose a class group. Check subject, time and room. Open **Add slot** to inspect scheduling fields. Compare **Rooms & bells** and **Teacher load** with the schedule. |
| Attendance (M17) | Choose a group, open a dated session and mark a learner **Late** with **Minutes late**. Save and check the roll. A submitted or locked session should be read-only. |
| Fees (M18) | Open **Invoices → Show lines** and compare total, paid and balance. Under **Payments**, inspect a receipt. Open **Record payment** and check the remaining balance. Review **Plans & refunds** with fee access. |
| Accounting (M19) | Inspect the hierarchy in **Accounts**. In **Journal**, open a reference to compare debit and credit lines. Inspect **Post entry** and check a budget's amounts against its total in **Budgets**. |
| Gradebook (M20) | Select a group and an open assessment. In **Mark sheet**, enter a mark and watch **Percent** change. Try **Absent** and check that marks and rubric choices clear. |
| Exams (M21) | Under **Schedule**, select an exam and inspect its papers. In **Seating**, select an exam and paper and compare seats by room. Open **Hall tickets & re-evaluation** and compare the staff and family views. |
| Report cards (M22) | Filter by group and learner, open a **Term** and read the subject grades. Check the available approval or publishing action against the card's status. Sign in as the family and check that only published cards appear. |
| Issued documents (M23) | Filter by **Document kind** and open a row. Compare its number, verification code and signatures count. Inspect a revoked document if present and compare what staff and family can read. |
| Messages & notices (M24) | Under **Messages**, open an active thread, send a fictional reply and check its position. Read a notice under **Notices** and a booking under **Meetings**. Check the date, mode and status of the booking. |
| Family (M25, guardian) | Check the child name or use the **Child** selector. Follow a summary card and return. For multiple children, check the **Totals for all your children** note before interpreting the counts. |
| My portal (M26, learner) | Follow an attendance or message card, return, and open **Timetable** from the quick links. Check that the destination is available to this learner. |
| Staff portal (M27, teacher) | Compare today's **Attendance** count with its linked page. Open **Pending leave requests**. Use **Daily briefing** where available to open Assist. |
| Dashboards (M28, leader) | Open **Home → Key metrics**. Check that attendance is a percentage, fee figures use the local currency, and each metric has an **As of** time. Read any trend alongside its icon. |
| Year-end rollover (M86) | Choose a run under **Rollover runs**. Check its counts, fee carry-forward and, for completed runs, reversal deadline. In **Promotion decisions**, filter by action, reload and confirm the same run and filter remain. |

## Offline and prototype limits

- Open an attendance session online, go offline in the browser's network tools, and save a mark in an open session. Look for **Waiting to sync**. Reconnect with **Attendance** open and check that the pending mark clears. The same pattern applies to a manual fee receipt, a gradebook mark or a message reply on its respective screen.
- **Import data** needs a connection. Import registration records the file name and format. The prototype leaves the spreadsheet contents on your device.
- The review build uses fictional mock data. Assist, where enabled, returns sample answers with sources. Use only demo records during the review.
- **Year-end rollover** is read-only (D76). You can inspect runs, promotion decisions and deadlines. Starting or reversing a run is outside this build.
- Use [TRANSLATIONS.csv](TRANSLATIONS.csv) to review the English, Hindi and Tamil wording alongside each translator note.
