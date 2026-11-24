# User guide

> State as of: 2026-11-24 (Stage 1 prototype — app shell, Institution setup, Users & access, Plan & usage, Theme studio, Text & language studio, Audit & privacy, Sync centre, Nexus Assist, Data vault & access, and Notifications; Stage 2 — Install & updates with support diagnostics review and audit history for your own server, support access requests from Nexus, leaving or moving an institution; Stage 3 prototype — Forms & fields, Import data, Admissions, Academic structure, Timetable, Learners, and Families)

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
- **Home** greets you by name and shows a tile for each module you can open. If no modules are available yet for your role, you see **No modules yet**.
- Opening a link to a module that is not in your institution's plan shows **Not in your plan**. Opening a page your role may not use shows **No access**. Unknown addresses show **Page not found**. Each offers **Go to home**.

## Switching user, institution, language, or appearance
- **Switch user** (in the top bar) opens a window listing the demo roles for your current institution, with **Current** beside your active role. Pick another role to switch right away, or choose **Switch institution** to return to the sign-in screen.
- **Language** (at the bottom of the menu) lets you pick any language your institution offers. NexusCampus ships in English, Hindi and Tamil.
- Use **Switch to dark theme** / **Switch to light theme** in the top bar to switch between light and dark colours.

## Working offline and signing out
- The sync pill in the top bar shows whether your changes are **Synced**, waiting to sync, or **Offline** (with the last sync time in your institution's time zone).
- Pages that require an internet connection show **Needs a connection** when you are offline.
- Users & access, Theme studio, Text & language studio, Notifications, Learners, Families, Academic structure and Timetable show **Last synced …** under their title, so you know how old the data is when you look at it offline.
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
- To record an enquiry, select **Add enquiry**, enter the learner and contact names, and provide a phone number with country code or an email address. Choose the source and, if known, the campus, program and follow-up date. Select **Save** to add the enquiry with status **New**.
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
