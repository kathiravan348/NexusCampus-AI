# User guide

> State as of: 2026-11-28 (Stage 1 prototype — app shell, Institution setup, Users & access, Plan & usage, Theme studio, Text & language studio, Audit & privacy, Sync centre, Nexus Assist, Data vault & access, and Notifications; Stage 2 — Install & updates with support diagnostics review and audit history for your own server, support access requests from Nexus, leaving or moving an institution; Stage 3 — Forms & fields, Import data, Admissions with public enquiry form, Academic structure, Timetable, Attendance, Fees, Accounting, Gradebook, Exams, Report cards, Issued documents, Messages & notices, Family portal, Learner portal, Staff portal, Dashboards, Year-end rollover, Learners, Families, role-based portal links, weekly absence cards, and formatted enquiry phone entry; Stage 4 prototype — Curriculum with outcome frameworks, syllabus coverage, and offline lesson-plan drafting, review and delivery, Courses with outlines, progress and offline discussion replies, and Content with lesson draft editing, library filtering, item details, assets, accessibility checks, and offline publishing)

This guide explains each screen in plain language as it is built. Names of buttons and labels match the default English text in **bold**.

## Signing in (prototype)
1. Open the app to see **Sign in to a demo institution**. A yellow notice (**Demo data. Nothing on this screen is real.**) reminds you that this prototype uses fictional demo data and needs no password.
2. Pick one of the five sample institutions (preschool, K-12 school group, university, Tamil coaching centre, or music academy) and choose a role button such as **Administrator**, **Teacher**, **Parent or guardian**, or **Learner**.
3. The app opens on **Home** using that institution's colours, logo, fonts, terminology, and default language (English, Hindi or Tamil).

## Signing in (real installation)

On a real installation there is no demo picker: choose **Sign in with your institution account**. Your
institution's sign-in page opens (or single sign-on, if your institution set it up); after signing in you come back
to the page you wanted. **Sign out** (top right) ends the session on the server too. If your session expires, the
app shows the sign-in page again.

Developers: start Compose, migrate and seed, run `uv run --project backend nexus-keycloak-dev` (demo users get
`NEXUS_DEMO_USER_PASSWORD` from `backend/.env` and are linked to their database accounts), then
`uv run --project backend nexus-dev` and `pnpm --dir frontend dev:real`, and open `http://127.0.0.1:3100`.
`pnpm --dir frontend e2e:real` runs the same flow (set `NEXUS_E2E_EMAIL` and `NEXUS_E2E_PASSWORD`).

## Home and the menu
- The menu on the side (or opened from the menu button on small screens) shows **Home** and only the modules that are switched on in your institution's plan and allowed for your role.
- Leaders with dashboard access use **Dashboards** as their home. For other users, staff see **Staff portal**, including staff who are also guardians. Of the remaining users, guardians see **Family portal** and learners see **Learner portal**.
- **Home** greets you by name and shows a tile for each module you can open. If no modules are available yet for your role, you see **No modules yet**.
- Opening a link to a module that is not in your institution's plan shows **Not in your plan**. Opening a page your role may not use shows **No access**. Unknown addresses show **Page not found**. Each offers **Go to home**.

## Switching user, institution, language, or appearance
- **Switch user** (in the top bar) opens a window listing the demo roles for your current institution, with **Current** beside your active role. Pick another role to switch right away, or choose **Switch institution** to return to the sign-in screen.
- **Language** (at the bottom of the menu) lets you pick any language your institution offers. NexusCampus ships in English, Hindi and Tamil.
- Use **Switch to dark theme** / **Switch to light theme** in the top bar to switch between light and dark colours.

## Working offline and signing out
- The sync pill in the top bar shows whether your changes are **Synced**, waiting to sync, or **Offline** (with the last sync time in your institution's time zone).
- Pages that require an internet connection show **Needs a connection** when you are offline.
- Users & access, Theme studio, Text & language studio, Notifications, Learners, Families, Academic structure, Timetable, Fees, Gradebook, Family, My portal, Dashboards, Year-end rollover, Curriculum, Courses, and Content show **Last synced …** under their title, so you know how old the data is when you look at it offline.
- **Sign out** returns you to the sign-in screen and clears this device's offline data for your account. If changes are still waiting to sync, sign-out is paused and a notice tells you how many changes need to sync first so nothing is lost.

## Institution setup
Available to administrators from **Institution setup** in the menu (requires an internet connection).

- **Profile** shows the institution's name, type, status, read-only **Data region** (fixed after creation for data residency), and the read-only defaults for its institution type (academic structure, grading scheme, terminology pack, and default modules).
- **Structure** displays the organisation tree from group to institution to campuses. Use **Add campus** or **Edit** beside a campus to add or update its code, name, optional time zone override, and address, then choose **Save**.
- **Locale & formats** lets you choose the default language, supported languages, time zone, currency, country, and weekend days. **Live format preview** immediately shows today's date and time, a sample number, and a sample money amount in your chosen settings before you choose **Save**.
- **Calendar** manages the academic year dates, **Display calendar** (Gregorian, Hijri, Hebrew, or Indian National), **Academic periods** (use **Add period** or the remove button), and **Holidays** (use **Add holiday** or the remove button). Overlapping periods or dates outside the academic year are flagged inline before saving.

## Users & access
Available from **Users & access** in the menu to administrators and to staff who may see users. You can look at cached lists while offline, but every change needs an internet connection.

- **Users** lists accounts with **Name**, **Contact**, **Roles**, **Status**, and **Last sign-in**. Use **Search** and the **Status** filter to narrow the list. Contact details of children are shown as **Restricted** unless you may see restricted personal data or are the child's guardian.
- **Invite user** asks for **Full name**, **Email**, **Role**, **Applies to** (for example **Institution**, **Campus**, or **Own records only**) and **Where**, then **Send invitation**. The new account appears as **Invited**. An email that already has an account is refused.
- Choose a user's name to open their roles: each role shows its scope and dates. **Add a role** gives another role from a chosen date, and the remove button takes one away. **Suspend** and **Reactivate** change the account status. You cannot change your own status or remove your own last administrator role.
- **Roles** lists **System** roles (read-only, open with **View**) and **Custom** roles. **New role** and **Edit** open a permission grid grouped by module, where you tick permissions and choose where the role **Can be given for**. Permissions that reveal restricted personal data are marked **Sensitive**.
- **Sessions** lists signed-in devices with sign-in method and last activity. **Sign out** ends one of your own devices; administrators can **Revoke** anyone's session.
- **Single sign-on** edits the identity provider: **Protocol**, name, **Issuer URL** (must start with https://), **Client ID**, **Email domains**, **Provision users with SCIM**, and **Enabled**. The client secret is never shown here; it is kept in the institution's key vault.

## Plan & usage
Available to administrators from **Plan & usage** in the menu. It needs an internet connection.

- **Current plan** shows the plan name, **AI credits per month**, and the **Learner limit** (or **Unlimited**).
- **Modules** lists every module and why you have it: **Core** (always on), **Plan**, **Add-on**, or **Trial** with the date it **Ends**. Use the switch to turn an optional module on or off: a switched-off module disappears from the menu for everyone at once, and its address shows a notice instead of the screen. Core modules cannot be switched off, and modules marked **Not in your plan** cannot be turned on here.
- **Usage** shows a meter per item for this billing period — **Learners**, **Staff**, **Storage**, **AI credits**, **Text messages**, **Emails** — as used against the limit (or **Unlimited**). Meters turn amber from 80 % of the limit and red at 100 %.

## Theme studio
Available to administrators from **Theme studio** in the menu. You can inspect the cached theme while offline, but **Save** requires an internet connection.

- **Colours** edits light and dark mode colour tokens grouped by **Brand**, **Surfaces & borders**, **Text**, **Status**, and **Charts**. Switch between **Light** and **Dark** modes, pick a colour or enter a hex value, and use the reset button beside any changed token to return it to the platform default.
- Changing the primary brand colour offers a **Suggested brand pair** banner with **Apply suggestions** so button text and links automatically pass contrast checks.
- For institutions inside a multi-campus group (such as Riverside), tokens locked by the group appear with a **Locked by group** badge and cannot be edited at the institution level.
- **Typography & spacing** chooses the **Body and UI font**, **Numbers and code font**, **Layout density** (**Compact**, **Comfortable**, or **Spacious**), and **Corner radius** tokens.
- **Assets** configures the **Logo URL** and **Favicon URL** with an inline image preview.
- **Contrast guard** checks every colour pair against WCAG 2.2 AA rules in both light and dark modes. Any failing pair blocks **Save**, displays the current and required ratio, and offers **Use suggestion** to apply a passing colour.
- **Live preview** shows buttons, a card, a table, and a form using your draft theme without changing the rest of the app until you choose **Save**. Saving updates the whole app and increments the **Version** badge.

## Text & language studio
Available to administrators from **Text & language studio** in the menu. You can browse cached texts while offline, but saving, removing, rolling back, or importing overrides requires an internet connection.

- Choose the **Editing language** at the top of the screen to work on any language supported by your institution.
- Under **Messages**, use **Search keys or text** to find wording by key or current text, or tick **Overridden only** to see customised strings.
- Choose **Edit** on any row to open **Edit text override**:
  - **Resolution layers** shows how the final text is built from **Platform**, **Terminology**, **Group**, **Institution**, and **Campus**, marking the winning layer **Active**.
  - Enter custom wording under **Institution override**. Message syntax is checked as you type, and **In-context preview** shows how the text reads with sample values for placeholders. Invalid syntax blocks **Save**.
  - Saving updates the wording across the whole app immediately. Choose **Remove override** to return to the inherited wording.
  - For institutions in a multi-campus group, group-wide overrides appear with **Locked by group** and open read-only via **View**.
  - **Change history** lists every version of an override. Choose **Roll back** beside an older version to restore it.
- Under **Import & export**, choose **Export JSON** to download your institution's overrides for the selected language. To import, pick a file or paste JSON, choose **Preview changes** to see additions, updates, unchanged entries, and any rejected rows with reasons, then choose **Apply valid changes**.

## Audit & privacy
Available to administrators and auditors from **Audit & privacy** in the menu. It needs an internet connection and keeps nothing on the device.

- **Audit log** lists who did what and when (in the institution's time zone). Filter by **Action**, **Actor**, **From** and **To**, and page through the results. Choose an action to see which fields changed — only field names are recorded, never the values; restricted fields are marked **Sensitive**. Actions done by provider staff under an approved access grant are highlighted with the grant id.
- **Check this page** verifies that the events on the current page are linked and unbroken (clear the filters first). A broken link is reported with its row number.
- **Consents** lists each person's consent per purpose (for example **AI features** or **Photos and media**), its status, who gave it (a guardian for children), how, and when. Filter by **Purpose** and **Status**.
- **Data requests** lists access, correction, deletion and export requests with their due dates; open requests past their deadline show **Overdue**. Open a request to **Start work**, then **Mark completed** or **Reject** with a reason.
- **Compliance** shows the privacy rules that apply to your institution: deadline for data requests, the age under which someone counts as a minor, whether guardians must consent to AI and to photos and media, and the default retention period.

## Sync centre
Available to everyone from **Sync centre** in the menu, also offline.

- **This device** shows whether this device is synced, what is **Waiting to send** (only the kind of change, never its content), and how often each was tried. Choose **Sync now** to send it when online; while offline the changes stay safely on the device. If a change conflicts with the server, choose **Keep mine** to send it again or **Keep the server's** to drop it.
- **Devices** (staff who manage devices) lists the institution's devices with their owner, last sync, and how many changes are waiting, in conflict, or lost. **Revoke & wipe** asks for a remote wipe after a warning about the changes that will be lost; wiping the device you are using asks you to confirm twice. The device shows **Wipe pending** until it next connects.
- **Conflicts** lists changes the server could not merge. Show **Open** or **Resolved** ones and resolve with **Keep server**, **Keep device**, or **Merged**.
- Known limit: in this prototype the wipe itself is not run on the device yet — the request is recorded and shown as **Wipe pending**.

## Nexus Assist and AI settings
Where your institution has AI on, the sparkle button at the top of the screen opens **Nexus Assist**. It is hidden where AI is off or not in your plan, and on screens AI may never read (such as the data vault).

- Type **Your question** and choose **Ask**. Every answer is marked **AI-generated**, lists its numbered **Sources** (choose one to open that screen), and shows the answer quality and the credits used. Use the thumbs to note whether it helped. If nothing in your records answers the question, Assist says so and uses no credits.
- When Assist cannot answer, it says why and what to do next: AI is **switched off**, it is **not in your plan**, you are **offline**, **AI credits have run out**, or — for a child — **a guardian's consent is needed**. Everything else keeps working.
- Administrators open **AI settings** from the menu to switch Assist on or off, choose where it may help, pick the **Default answer quality**, and follow the **AI credits this month**. Health records and the data vault can never be opened to AI; safeguarding needs its own switch after a privacy impact assessment. Personal data is always redacted, and children always need a guardian's consent.

## Data vault & access
Available to the institution's owners and administrators from **Data vault & access** in the menu. It needs an internet connection, keeps nothing on the device, and is never shown to Nexus Assist.

- Requests reach you through your institution's own server: Nexus never connects in and can never approve a request
  itself. When you decide, only the decision (approved, denied, ended) and its time go back to Nexus — never your data.
- **Access requests** lists requests from Nexus support staff, newest waiting ones first, with a count on the tab. Each shows who asked, why, which areas, **Read only** or **Read and edit**, and for how long (at most 72 hours). Only an owner can decide: **Approve…** lets you keep or narrow the areas, access and hours — never widen them — and you must tick that you understand staff will see the data until the shown end time. **Deny** needs a reason.
- **Grants** shows each approved access with its start and end, a countdown while active, and **Revoke now** to end it early. **What they did** lists every action staff took under that grant.
- **Keys** shows which encryption keys protect your data, who holds them, and their status — never the keys themselves. When an institution leaves, its keys are destroyed so the data can never be read again.
- **Emergency access** lists any emergency access by Nexus, approved by two people, with when it happened, when you were told, and the report.

## When your institution leaves or moves
Done by Nexus staff with your institution's owner, never by one person alone.

- **Frozen:** first your institution is frozen. Everyone can still sign in and read everything, but nothing can be
  changed. A change you try to save is refused and a banner at the top of the screen shows **This institution is frozen**
  — **It is being moved or is leaving NexusCampus. You can still sign in and read everything, but changes are not saved.**
- **Your export:** a complete copy of your data is made on your institution's server, locked with a key only you (or
  your new server) hold. It never passes through Nexus.
- **Leaving:** after you confirm you received the file, two different Nexus staff members must approve before your
  encryption keys are destroyed; from then on the old copy can never be read again. You receive a signed
  **Key-destruction certificate** that anyone can check without asking us.
- **Moving** (to another region, to your own servers, or back to the cloud): your export is loaded into the new place
  and checked against your activity log before you switch over; the old copy is then destroyed the same way.

## Notifications
Available to everyone from **Notifications** in the menu.

- **My preferences** lets you choose how you hear from the institution — **Email**, **Text message**, **WhatsApp**, **Phone notification**, or **In the app** — and set **Quiet hours** in the institution's time zone. Channels your institution has not set up are shown but cannot be switched on. You can change preferences offline: they are saved on this device and sync when you are back online.
- Administrators also see **Templates**: each message by event, channel and language, with an on/off switch. **Edit** opens the message: pick a **Language** or **Add a language…**, change the **Subject** (email) and **Message**, and see a **Preview with sample values**. A message with broken syntax cannot be saved.
- **Delivery log** shows what was sent to whom, by which channel, and whether it arrived, with the reason for anything that failed or was not sent. Filter by **Status** and **Channel**.

## Forms and fields

Open **Forms & fields** in the demo menu. Under **Fields**, choose a **Record type** to see its fields in order. Each card shows the field type and whether it is **Required** or **Optional**. Sensitive fields also carry a **Sensitive** badge. Older fields that have been archived appear under **Archived**.

If you manage configuration, choose **Add custom field**. Pick the record type, enter a unique **Field key**, and give the field a label in the institution’s default language. You can add labels in the other supported languages. For **Single choice** or **Multiple choice**, use **Add option** and enter a distinct option key and a label for each choice. For **Number**, you can set a **Minimum** and **Maximum**. Choose **Save** to see the new field in its record type.

**Forms** shows how many fields each form contains. **Workflows & numbering** shows the number of steps in each approval workflow and the numbering patterns used by the institution. Cached lists remain available offline with **Last synced** under the heading. Adding a field requires a connection. **Ask Assist** is available online when your institution has enabled Assist and you have access to it.

## Importing data
Available to administrators from **Import data** in the menu. It requires an internet connection; opening it while offline shows **Needs a connection**.

- The list shows past import jobs with the file name, record type, status badge, valid/error/total row counts, and creation time in your institution's time zone. Choose a job to open its details (choose **Back to imports** to return).
- A job view shows **Job summary** (status, counts, and **Rollback available until** for **Completed** imports), **Column mappings** (each source column, target field or **Skipped**, and transform), and **Dry-run issues** (row number, column name, **Error** or **Warning**, and issue description — cell values are never shown).
- Staff allowed to manage imports see **New import** to pick a **Record type** and a `.csv` or `.xlsx` **Spreadsheet file**, then choose **Register import**. Unsupported file types are rejected inline. Only the record type, file name and format are recorded in this prototype; file contents stay on your device because parsing runs on the server.
- When Nexus Assist is switched on for your institution and you are online, **Ask Assist** opens **Nexus Assist** from the page header.

## Admissions

Open **Admissions** to follow an enquiry through the admissions process. Your role determines whether you can view the records and add enquiries.

- In **Enquiries**, use **Filter by status** to narrow the list. Choose a learner’s name to open their contact phone or email. Lost enquiries show the recorded reason.
- To record an enquiry, select **Add enquiry**, enter the learner and contact names, and provide an email address or a phone number with its country code, for example +91 98765 43210. Phone numbers can include spaces, dashes, dots or parentheses. Choose the source and, if known, the campus, program and follow-up date. Select **Save** to add the enquiry with status **New**.
- **Public enquiry form:** staff allowed to manage admissions can select **Copy public form link** on **Enquiries** to copy their institution's public enquiry address. Families who open that link do not need to sign in. The page opens in the institution's default language (for example Hindi or Tamil); when the institution supports more than one language, a **Language** selector at the top lets families switch languages without losing what they have typed, and their choice is remembered on that device. Before the form loads (or when a link is not found or opened offline), the page uses the browser's language if supported and otherwise English. Families see the institution's name, fill in **Learner name**, **Contact name**, a **Contact phone** or **Contact email**, optional **Program** and **Campus**, tick the consent box naming the institution, and choose **Send enquiry**. Sending requires a connection (**Needs a connection** appears when offline). Submitted enquiries appear under **Enquiries** with status **New**, source **Public form**, and no assignee.
- **Applications** shows each application number, program, status and submission date. The applicant’s name appears when your directory access allows it.
- **Offers & waitlist** shows offers with their class group, status and expiry date. The waitlist shows applications in position order.
- While offline, you can read previously loaded records and see **Last synced**. Adding an enquiry requires a connection. When available, **Ask Assist** opens the helper. Staff make admissions decisions.

## Learners and families
Available from **Learners** and **Families** in the menu. Administrators and teachers see learners and households across their institution; parents/guardians and learners see only their own family. Cached lists and opened profiles stay readable offline, showing **Last synced …** under the heading. If your role has no access, the screen shows **No access**.

- **Learners** lists each learner with their name (or learner number only when directory details are hidden), learner number, and status badge. Use **Search learners** to filter by name or learner number, then choose a learner to open their profile (choose **Back to learners** to return). Opening a learner outside your access shows **Learner not found**.
- A learner profile shows **Details** (learner number, admission date, and any contact details your role may view), **Enrolments** (class group, program, year level, roll number, and dates), **Documents** (file name, type, upload date, and **Verified** / **Unverified** status, with no file downloads), and **Guardians** with their pickup rights.
- **Health flags** and **Additional details** appear only with the fields your role is allowed to see; restricted health flags and sensitive fields are hidden from teachers (except for their own family) and omitted rather than shown as empty.
- **Families** lists each household with its name, home address (when returned), **Members**, and — for each learner — their **Guardians** and **Authorised pickups** (name, relationship, phone number, and valid dates).
- Guardian pickup rights appear as **Pickup allowed**, **Pickup not allowed**, or the **Court restricted** warning badge. The **Court order note** appears only for roles allowed to see restricted family details; teachers and guardians still see the **Court restricted** badge without the note.

## Academic structure
Available from **Academic structure** in the menu to administrators, teachers, parents/guardians, and learners. Cached lists stay readable offline (showing **Last synced …** under the heading), while creating a class group requires an internet connection.

- **Programs & classes** lists each program (with its type and code), its year levels in order, and the class groups in each year level (code, type, and capacity). Batches not linked to a year level appear under **No year level**.
- Administrators see **Add class group** to create a class group by picking **Program**, **Academic year**, optional **Year level** and **Campus**, **Type**, **Code**, **Name**, and optional **Capacity**, then choosing **Create class group**. A duplicate code in the same academic year is refused. While offline, **Add class group** is disabled with **You are offline**.
- **Subjects** lists the institution's subjects (name, code, type, and credits where used) and **Subject offerings**, which can be filtered by **Academic year** (or **All academic years**).
- When Nexus Assist is switched on for your institution and you are online, **Ask Assist** opens **Nexus Assist** from the page header.

## Timetable
Available from **Timetable** in the menu to administrators, teachers, parents/guardians, and learners. Cached schedules, rooms, bell schedules, and teacher load stay readable offline (showing **Last synced …** under the heading), while adding a slot requires an internet connection.

- **Week** lets you pick a **Class group** to see its weekly schedule (a weekday-by-time grid on larger screens, and one card list per weekday on small screens). Each slot shows the subject name, start and end time, and room code (or **No room**). Parents/guardians and learners see only their own family's class groups.
- Administrators see **Add slot** to open **Add timetable slot** and pick a **Subject offering**, **Weekday**, **Start time**, **End time**, optional **Room**, **Teachers**, and **Effective from** date, then choose **Add slot**. Room, teacher, and class group clashes are checked automatically and reported on the clashing field. While offline, **Add slot** is disabled with **You are offline**.
- **Rooms & bells** lists each room (name, code, type, capacity or **—**, and **Inactive** when out of service) alongside the institution's **Bell schedules** (period labels, start and end times, and **Break** badges).
- **Teacher load** is shown to staff only and displays each teacher's weekly periods, weekly minutes, maximum weekly period limit (or **No limit**), and an **Overloaded** badge when over the limit. Staff who cannot view the full directory see numbered staff labels for colleagues.
- When Nexus Assist is switched on for your institution and you are online, **Ask Assist** opens **Nexus Assist** from the page header.

## Taking attendance

1. Open **Attendance**, choose a **Class group**, then select a date under **Attendance sessions**. The newest sessions appear first.
2. In an **Open** session, choose **Present**, **Absent**, **Late**, or **Excused** beside a learner. For **Late**, enter **Minutes late** (1–600). Add a **Note (optional)** if needed, then select **Save**. To record everyone as present, choose **Mark all present**.
3. To correct a mark, choose the new status and select **Save**. The roll call shows the most recent mark for each learner.

Open the session while connected to make its roster available offline. Offline marks show **Waiting to sync**. They sync when the connection returns with **Attendance** open. **Last synced** shows when the session list was last refreshed.

Staff with viewing access can read attendance. Marking requires marking permission. **Submitted** and **Locked** sessions are read-only.

## Fees
Available from **Fees** in the menu to fee administrators, parents/guardians, and learners. Staff without fee access see **No access**. Cached invoices and payments stay readable offline (showing **Last synced …** under the heading), and manual receipts can be recorded offline and synced when the connection returns.

- **Invoices** lists each invoice with its invoice number, learner name (when directory details are available), due date, **Total**, **Paid**, **Balance**, and status badge (**Draft**, **Issued**, **Part paid**, **Paid**, **Void**, or **Written off**). Use **Filter by status** to narrow the list, and choose any invoice to **Show lines** and inspect its line items. Parents/guardians and learners see only their own family's invoices.
- **Payments** lists recorded receipts with the receipt number, amount, payment method, received date and time in your institution's time zone, and status badge. Parents/guardians and learners see only payments for their own family's invoices.
- **Plans & refunds** is shown only to staff who may view fees. It lists **Fee heads**, **Fee plans** (lines and instalments), **Concessions** (type, mode, and value), and **Refunds** (amount and status). Personal reasons on concessions and refunds are never shown here.
- Staff allowed to manage fees see **Record payment** to record a **Cash**, **Cheque**, or **Bank transfer** receipt against one or more open (**Issued** or **Part paid**) invoices for one learner, then choose **Record receipt**. An amount above the selected remaining balance is refused inline. While offline, a recorded receipt stays queued as **Waiting to sync** on the invoice and under **Payments**, and syncs once when the connection returns with **Fees** open. Online card and UPI payments are not captured here.
- When Nexus Assist is switched on for your institution and you are online, **Ask Assist** opens **Nexus Assist** from the page header.

## Accounting

The **Accounting** menu item is available to staff with permission to see the institution's accounting records. The **Accounts** tab shows each account's code, name and type. An indented account belongs to the account above it. **Inactive** accounts can still appear in the journal and on budgets.

- Choose **Journal** to see entries in order of their posting date, newest first. Select an entry's reference to see which accounts it debited and credited.
- To post a journal entry, choose **Post entry** in **Journal**. If you have more than one institution, select the one whose accounts you need. Enter the **Posting date**, **Reference** and **Currency**. Use **Add line** to include more accounts. Enter an amount in either the **Debit** or **Credit** column of each line using the currency's usual units. Use **Post** when the totals match. The date and currency default to your institution’s local date and currency. Only staff with permission to manage accounting can post an entry.
- Choose **Budgets** to see each budget's status, currency, amounts by account, and total.
- When offline, read your cached records and check **Last synced** for the last update. Posting requires a connection. The **Ask Assist** button appears when the institution's AI is enabled, your role permits it, and you have a connection.

## Entering marks

1. Open **Gradebook**, choose a **Class group**, then select an assessment under **Assessments**. Each assessment shows its kind, maximum marks, weight, due date, and status.
2. On an **Open** or **Marking** assessment, open the **Mark sheet** and enter **Marks** in 0.5 steps from 0 up to the maximum (the **Percent** updates as you type). If a learner missed the assessment, tick **Absent** to clear and disable the marks field and any rubric choices.
3. When the assessment uses a rubric, pick a level for each criterion under **Rubric scores** for every learner who is not absent. Add a **Remark (optional)** if needed, then select **Save** on that row.

Open the assessment while connected so its roster is cached offline. Entries saved offline show **Waiting to sync** and upload automatically when the connection returns with **Gradebook** open. **Last synced** shows when the assessment list was last refreshed.

Staff with permission to view assessments and marks can open **Gradebook**. Entering or changing marks requires mark-entry permission, and **Draft**, **Moderated**, and **Published** assessments are read-only. Parents, guardians, and learners do not see **Gradebook**.

## Exams

Open **Exams** to check exam arrangements. **Last synced** shows when the hall ticket list was last updated. Lists you have already opened remain available offline.

- In **Schedule**, staff choose an **Exam** to see its dates and status. **Exam papers** lists each subject, date, start and end times, rooms, and maximum marks.
- In **Seating**, choose an **Exam** and a **Paper** to see the seats grouped by room. Each seat shows the learner’s name when available, or their learner number.
- Staff with permission to manage exams can choose **Generate seating plan** and confirm the replacement. It fills the assigned rooms in order for learners enrolled on the paper date. If the rooms have too few seats, the existing assignments stay in place. Generation is available for **Planned** and **Scheduled** exams and shows **Needs a connection** when offline.
- **Hall tickets & re-evaluation** shows ticket numbers, issue dates and **Revoked** tickets, plus original marks, revised marks when available, and each request’s status. Parents, guardians and learners see only their own family records. Family tickets use the label **Exam** and family requests use **Paper**.

## Report cards

Open **Report cards** and select a **Term** row to see subject grades, marks and remarks. A dash means a mark has not been recorded. **Back to report cards** returns to the list.

- Staff can filter by **Class group** and **Learner**. Staff with publishing permission can select **Approve** on a draft, **Publish** on an approved card, or **Withdraw** on a published card. Confirm the action in the dialog. Withdrawal is final.
- Guardians and learners see their own family's **Published** cards. Guardians with more than one child can choose a **Learner**. Withdrawing a card removes it from the family's list when it next syncs.
- Previously loaded cards are readable offline. **Last synced** shows when the list was last refreshed. Status changes require a connection.
- **Ask Assist** is available online when your institution enables AI and your role allows it.

## Issued documents

Open **Issued documents** to check certificates and letters issued by your institution. Each row shows the document kind, document number, issue date, learner name (or **Staff letter** when not linked to a learner), and a **Revoked** badge when revoked. Select a row to open its **Document number**, **Issued on** date, **Verification code**, and **Signatures** count and signing methods. Choose **Back to issued documents** to return to the list.

- Staff with permission to view issued documents can filter by **Learner** (**All learners** by default) and **Document kind** (**All kinds** by default), and see the **Revocation reason** on revoked documents.
- Staff with permission to issue documents can choose **Revoke** on an active document, enter a **Revocation reason** (required, up to 300 characters), and confirm with **Revoke document**. Public verification then shows the document as invalid, and revocation cannot be undone.
- Parents, guardians, and learners see only their own family's issued documents, never staff letters and never the revocation reason. Guardians with more than one child can filter by **Learner**. Staff without permission see **No access**.
- Previously loaded documents remain readable offline and **Last synced** shows when the list was last updated. **Revoke** is disabled offline with **You are offline**.

## Messages and notices

Open **Messages & notices** from the menu to read message threads, check notices, and view meeting bookings. Only the tabs allowed for your role appear (**Messages**, **Notices**, and **Meetings**); roles with none of these permissions see **No access**. Previously loaded lists and opened threads remain readable offline, and **Last synced** shows when your thread list was last updated.

- **Messages** lists the threads you take part in, newest first, showing the subject, kind (**Direct message**, **Class group**, **Staff group**, or **Broadcast**), last message date, and an **Archived** badge when replies are closed. Select a thread to read messages oldest first (**You** marks your own messages, **Edited** marks edited messages, and **Member** appears when another participant's name is unavailable). Choose **Back to messages** to return to the list.
- When your role allows sending messages on an active thread, enter a **Reply** (required, up to 4,000 characters) and choose **Send reply**. Replies sent while offline appear at the end of the thread with a **Waiting to send** badge and send once when your connection returns with **Messages & notices** open; a reply that could not be sent shows **Not sent**. **Archived** threads have no reply box.
- **Notices** displays each notice visible to your role as plain text with its title, publish date, and **Needs acknowledgement** badge where required. Staff with permission to publish notices also see each notice's status badge (**Draft**, **Scheduled**, **Published**, or **Withdrawn**).
- **Meetings** lists scheduled meeting bookings read-only with the learner's name (or learner number when directory details are unavailable), date, time range, meeting mode (**In person**, **Video call**, or **Phone call**), location where set, and status (**Booked**, **Cancelled**, **Attended**, or **No-show**). Private booking notes are never shown here.

## Family portal

Open **Family** from the menu to see one home page for your children. Only parent or guardian accounts can open this screen; staff, administrators, and learners see **No access**.

- **Child switcher:** if you have one child linked to your account, their name appears at the top. If you have two or more children, choose a **Child** from the dropdown (your selection is kept in the page address). Links below the child area open **Attendance**, **Fees**, **Report cards**, and **Issued documents** when those modules are available in your menu.
- **Summary cards:** each card shows a heading (such as **Absences this week**, **Unpaid invoices**, **Unread messages**, and **Notices**), a count in your institution's number format when present, and any severity label (**Info**, **Warning**, or **Critical**). Select a card to open its module page. When you have two or more children, **Totals for all your children** notes that card counts combine all of them.
- Previously loaded home data remains readable offline with **Last synced** under the heading. Opening **Family** offline without cached data shows **Family home could not be loaded.** When Nexus Assist is switched on for your institution and you are online, **Ask Assist** opens **Nexus Assist** from the page header.

## Learner portal

Open **My portal** from the menu to see your own home page. Only learner accounts can open this screen; guardians, staff, and administrators see **No access**.

- **Summary cards:** each card shows a heading (such as **Absences this week**, **Unpaid invoices**, **Unread messages**, and **Notices**), a count in your institution's number format when present, and any severity label (**Info**, **Warning**, or **Critical**). Select a card to open its module page.
- **Quick links:** opens **Timetable**, **Attendance**, **Report cards**, **Issued documents**, and **Messages & notices**, showing only the pages available in your menu.
- Previously loaded home data remains readable offline with **Last synced** under the heading. Opening **My portal** offline without cached data shows **Your portal could not be loaded.** When Nexus Assist is switched on for your institution and you are online, **Ask Assist** opens **Nexus Assist** from the page header.

## Staff portal

Open **Staff portal** from the menu to see your teaching day. Guardians, learners and institution leaders see **No access**.

- **Attendance** shows how many attendance sessions you have today. **Pending leave requests** shows requests awaiting a decision for your classes. Select either card to open the corresponding attendance page.
- When available, **Unread messages** and **Notices** show counts and open the corresponding page.
- **Quick links** opens the teaching tools available in your menu, including **Attendance**, **Timetable**, **Gradebook** and **Messages & notices**.
- Choose **Daily briefing** to open **Nexus Assist**. You can ask “What should I review today?” This button appears while you are online if your institution enables Assist and your role has access.
- Offline, you can read the last summary saved on this device. **Last synced** shows when it was fetched. If you open the portal offline before a summary has been saved, you see **Staff portal could not be loaded.**

## Dashboards

Open **Dashboards** from the menu or select **Key metrics** on the leader home page. Owners and administrators with dashboard access can see totals for their institution. Other roles see **No access** if they open the page directly.

- **Attendance rate** shows a percentage. **Fees collected** and **Fees outstanding** use the institution’s currency. **Open admissions** and **Active learners** show counts.
- **As of** gives the date and time of each metric in the institution’s time zone. When a trend is available, the tile shows **Increasing**, **Decreasing** or **No change** beside an icon.
- Offline, you can read the figures last saved on this device. **Last synced** shows when they were fetched. If you open the page offline before any figures have been saved, you see **Dashboards could not be loaded.** Reconnect and select **Try again**.
- Choose **Ask Assist** to ask about the metrics when you are online, your institution enables Assist and your role has access.

## Year-end rollover

Open **Year-end rollover** from the menu. Owners and administrators with rollover access can review runs and promotion decisions. Other users see **No access** when they open the page directly.

- The newest run opens first. Select an entry under **Rollover runs** to see its status, the number of learners for each action, and whether fee balances carry forward. A **Completed** run also shows the deadline for reversing it.
- Under **Promotion decisions**, use **Filter by action** to narrow the list, or select **All** to see every decision in the run. Reloading the page keeps your selections.
- Each decision shows the learner’s name when available, otherwise their learner number or **Learner**. The row also shows the action, the destination class group, and the reason when available. **Changed by staff** marks a decision a staff member changed.
- This page is read-only. Offline, previously loaded runs and decisions remain available. **Last synced** shows when the runs were fetched. If the data you need is unavailable, reconnect and select **Try again**.
- **Ask Assist** is available online when your institution enables Assist and your role has access.

## Curriculum

Open **Curriculum** from the menu to inspect outcome frameworks, track syllabus coverage, and draft lesson plans. People without curriculum access do not see **Curriculum** in the menu and see **No access** if they open the page directly. **Last synced** under the heading shows when the data was last refreshed.

- **Outcomes:** choose an **Outcome framework** to view its outcomes as a nested tree with codes and statements, along with any **CASE import** or version badges. Where course outcomes are mapped to program outcomes, each outcome lists its mapped pairs and strength (**Low (1)**, **Medium (2)**, or **High (3)**).
- **Syllabus & coverage:** choose a **Subject offering** to view the **Syllabus coverage** meter (shown to one decimal place with covered and total topic counts) and each unit's topics in order. Every topic shows both an icon and a text status (**Not started**, **In progress**, or **Covered** with the covered date).
- **Lesson plans:** visible only to roles allowed to write or review lesson plans (learners and guardians with curriculum access see **Outcomes** and **Syllabus & coverage** only). Filter by **Subject offering** (**All subject offerings** by default) to see each plan's title, date, status badge (**Draft**, **Submitted**, **Approved**, **Returned**, or **Delivered**), and **Reviewer note** when a plan has been returned.
- **Drafting and editing lesson plans:** teachers choose **New lesson plan** to draft a plan or **Edit** on their own **Draft** or **Returned** plans. Choose a **Subject offering**, optional **Lesson date**, **Title**, at least one **Syllabus topics** checkbox, optional **Outcomes**, **Objectives**, ordered **Activities** (with **Add activity**, move up, move down, and remove buttons), and **Resources**, then choose **Save draft** or **Save changes**.
- Choose **Submit** on your own **Draft** plan when it is ready for review. A reviewer can open another author's **Submitted** plan with **Approve** or **Return**. In **Review lesson plan**, select the **Decision** and confirm it. A **Reviewer note** is required when returning a plan. The author can read the note, **Edit** the plan, save changes and **Submit** it again.
- After teaching an **Approved** plan, its author chooses the **Date taught** and selects **Mark delivered**. Under **Syllabus & coverage**, the topics for that subject offering now show **Covered** with the date taught. Each newly covered topic increases the coverage meter.
- **Working offline:** previously loaded frameworks, syllabus units, and lesson plans remain readable offline. Saving, submitting, reviewing or marking a plan delivered while offline queues the change on your device (**Lesson plan saved offline. Waiting to sync.**) and syncs it automatically when you reconnect.
- **Ask Assist** is available online when your institution enables AI and your role allows it.

## Courses

Open **Courses** from the menu to browse the course spaces you teach or are enrolled in, follow course outlines and progress, and take part in class discussions. Roles without course access (such as parents and guardians) do not see **Courses** in the menu and see **No access** if they open the address directly. **Last synced** under the heading shows when the course list was last refreshed.

- **Course spaces:** each card shows the space title, kind (**Class**, **Course**, or **Community**), status (**Draft**, **Published**, or **Archived**), **Self-enrol** when learners can join themselves, and any summary or dates. Choose **Open** on a space to view its details, and **Back to courses** to return to the list.
- **Outline:** lists each module in order with any unlock date and prerequisite module names (**Prerequisites:**). Each item shows its kind (**Page**, **File**, **Link**, **Lesson**, **Assignment**, **Test**, **Live class**, or **Discussion**), completion rule (**No completion required**, **View to complete**, **Submit to complete**, or a passing score), and due date when set. Course managers also see **Unpublished** items.
- **Progress:** learners see **Your progress** as a completion bar with their percentage (to one decimal place) and completed item count, plus a **Done** badge on completed items. Staff see **Learner progress** as an overall count of learners with recorded progress and per-item completion counts, without a list of individual learners.
- **Discussions:** lists threads with **Pinned** threads first, reply counts, and a **Locked** badge when replies are closed. Select a thread to read replies arranged as a nested reply tree (**You** marks your own posts, **Participant** marks other authors, and **Edited** marks edited posts). Moderators also see hidden posts marked **Hidden**; other viewers do not see hidden posts.
- **Posting replies:** on an open thread, enter text under **Reply to thread** (up to 5,000 characters) and choose **Post reply**, or select **Reply** under any post to write a nested **Reply to post**. Locked threads hide the reply forms and show **This thread is locked. New replies are closed.**
- **Working offline:** previously opened course spaces, outlines, progress, and discussions remain readable offline. Posting a reply while offline saves it on your device (**Reply queued offline. It will sync when you reconnect.**) and sends it automatically when your connection returns.

## Content

Open **Content** from the menu to browse learning materials, inspect lesson blocks and attached files, check accessibility, and publish ready items. Roles without content access (such as parents and guardians) do not see **Content** in the menu and see **No access** if they open the address directly. Learners see **Published** items only and do not see check or publish controls. **Last synced** under the heading shows when the library was last refreshed.

- **Content library:** each card shows the item title, kind (**Lesson**, **Video**, **Audio**, **Document**, **SCORM 1.2**, **SCORM 2004**, **xAPI**, or **cmi5**), status (**Draft**, **In review**, **Published**, or **Archived**), version number, and an **AI-assisted** badge when drafted with AI help. Use **Filter by status** (**All statuses** by default) to narrow the list. Choose **Open** to view an item, and **Back to content** to return to the library.
- If you manage content, choose **New lesson** in the library or open a draft lesson and choose **Edit**. Enter a **Lesson title**, select the **Language**, and choose any linked **Outcomes**.
- Choose a **Block type** and select **Add block**. Enter **Lesson text**, choose an image and describe it in **Alt text** (up to 500 characters), or choose a video and its **Captions**. A video without captions can be saved as a draft and needs captions before publishing. For a question, enter its **Question ID**. For an embed, enter an HTTPS address in **Embed URL**. Its preview shows the host name.
- Use **Move up** and **Move down** to reorder blocks with the keyboard. **Remove block** asks for confirmation. **Save** creates or updates the draft. Editing clears its accessibility report to **Not checked** and keeps any **AI-assisted** label. When offline, **Save** queues the draft on this device until you reconnect.
- **Item details and assets:** shows the item's **Language**, linked **Outcomes** count, **Duration** when set, **Last updated** time, and **Learning package** details (manifest ID and launch path) for package items. **Assets** lists attached files with their file name, kind (**Image**, **Video**, **Audio**, **Document**, **Package**, or **Captions**), and file size.
- **Lesson blocks:** for **Lesson** items, lists each numbered block in order: **Text** blocks as plain text, **Image** blocks with their file name and **Alt text**, **Video** blocks with their file name and caption track count, **Question** blocks with their question ID, and **Embed** blocks with the external host name only.
- **Accessibility check:** shows **Not checked** until a check is run, or **Checked …** with either **No accessibility issues found** or issues grouped with **Error** items first and **Warning** items next, each showing its problem (**Missing alt text**, **Missing video captions**, **Missing audio transcript**, **Low colour contrast**, or **Skipped heading level**) and location (**Block …** or **Whole item**).
- **Review & publish:** staff who manage content can select **Run accessibility check** to re-check captions, transcripts, alt text, and heading levels. Staff allowed to publish can select **Publish** on a **Draft** or **In review** item once no blocking errors remain (warnings do not block publishing; when errors remain, **Fix the errors to publish** is shown and **Publish** is disabled). Items marked **AI-assisted** still require a person to review and publish them.
- **Working offline:** previously loaded content items, assets, blocks, and accessibility reports remain readable offline. Choosing **Run accessibility check** or **Publish** while offline queues the action on your device (**Accessibility check queued offline. It will sync when you reconnect.** or **Publish queued offline. It will sync when you reconnect.**) and syncs automatically when you reconnect.

## Install the app, offline and updates
- **Install:** when your browser offers it, an install button (download icon) appears in the top bar. Choose it to add NexusCampus to your device like an app. The button only shows when installation is possible and disappears once installed.
- **Working offline:** after the first visit, a "Ready to work offline" message confirms the app itself is saved on this device, so it opens without a connection. What data you can read offline follows each module's offline level; private settings (L0) still need a connection.
- **Updating:** when a new version has downloaded, a notice says "A new version of NexusCampus is ready." Choose **Reload** to switch now, or **Later** to keep working; the new version starts the next time all app tabs are closed.

## Installing NexusCampus on your own server

Your IT team runs one command: `deploy/compose/scripts/install.sh` (Windows: `install.ps1`). It sets up sign-in,
encryption keys, the database and the app, and prints the address to open. Running it again starts NexusCampus after a
restart or installs an update without losing data. See `deploy/compose/README.md` for real web addresses, backups and
removal. Large sites that run Kubernetes can use the Helm chart instead (`deploy/helm/nexuscampus/README.md`).

- After setup, the master key of the key vault is switched off; your IT team keeps only the unlock key and can create a
  new master key with it when they need one.
- Your server never accepts connections from Nexus. If your IT team pairs it with Nexus (optional), it only sends
  health counts and fetches signed updates. Signed instructions from Nexus (for example a support access request)
  are **off** until your institution switches them on (`NEXUS_AGENT_COMMANDS=on`), and never reach an install with no
  internet.

### Install & updates

Menu **Install & updates** (administrators; only in an install on your own servers — in the demo, Apex Coaching).

- **Licence**: state (**Active**, **Grace period**, **Read only**, **Expired**, **Revoked**), edition, when support ends,
  and **Learners** and **Campuses** used of your limit. The licence is checked on your server, without calling us.
- **Updates**: the next version, **Security fix** when it has one, **Signature valid** (never install one marked
  **Signature not valid**), where it comes from (online or an offline bundle) and whether your support covers it.
- **Backups**: each backup and export, always encrypted with your keys before it is written.
- **Health reports & support diagnostics**: whether health reports (counts and timings only, never names) are on, and
  each diagnostic bundle. Bundles have personal data removed, and nothing is sent until an admin approves it.
  - On a bundle **Waiting for your review**, press **Review**: it shows exactly the text Nexus support would receive.
    Then press **Approve sending**, or **Discard** and confirm with **Yes, discard**. Neither can be undone. If another
    admin decided first, the window says so; close it and check the list. Reviewing needs a connection to your
    install. The decision appears in **Audit & privacy** with the reviewing admin, bundle ID and time.
