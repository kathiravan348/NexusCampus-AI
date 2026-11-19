# User guide

> State as of: 2026-11-19 (Stage 1 prototype — app shell, Institution setup, Users & access, Plan & usage, Theme studio, Text & language studio, Audit & privacy, and Sync centre)

This guide explains each screen in plain language as it is built. Names of buttons and labels match the default English text in **bold**.

## Signing in (prototype)
1. Open the app to see **Sign in to a demo institution**. A yellow notice (**Demo data. Nothing on this screen is real.**) reminds you that this prototype uses fictional demo data and needs no password.
2. Pick one of the five sample institutions (preschool, K-12 school group, university, Arabic training centre, or music academy) and choose a role button such as **Administrator**, **Teacher**, **Parent or guardian**, or **Learner**.
3. The app opens on **Home** using that institution's colours, logo, fonts, terminology, and default language (including right-to-left layout for Arabic).

## Home and the menu
- The menu on the side (or opened from the menu button on small screens) shows **Home** and only the modules that are switched on in your institution's plan and allowed for your role.
- **Home** greets you by name and shows a tile for each module you can open. If no modules are available yet for your role, you see **No modules yet**.
- Opening a link to a module that is not in your institution's plan shows **Not in your plan**. Opening a page your role may not use shows **No access**. Unknown addresses show **Page not found**. Each offers **Go to home**.

## Switching user, institution, language, or appearance
- **Switch user** (in the top bar) opens a window listing the demo roles for your current institution, with **Current** beside your active role. Pick another role to switch right away, or choose **Switch institution** to return to the sign-in screen.
- **Language** (at the bottom of the menu) lets you pick any language supported by your institution. Choosing an Arabic language switches the screen to right-to-left automatically.
- Use **Switch to dark theme** / **Switch to light theme** in the top bar to switch between light and dark colours.

## Working offline and signing out
- The sync pill in the top bar shows whether your changes are **Synced**, waiting to sync, or **Offline** (with the last sync time in your institution's time zone).
- Pages that require an internet connection show **Needs a connection** when you are offline.
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

## Not there yet
- Remaining module screens (AI assist, data vault & access grants, notifications) and offline app install.
