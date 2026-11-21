# NexusCampus — User manual

> Pictures first. Every screenshot is taken automatically from the demo (sample data), so this manual always
> matches the app. Updated 2026-11-21 · 78 screenshots.

## Contents

**Step by step (end to end)**

- [Getting started](#getting-started)
- [Languages](#languages)
- [Invite a new teacher](#invite-a-new-teacher)
- [Change the brand colour](#change-the-brand-colour)
- [Change any wording](#change-any-wording)
- [Switch a module off and on](#switch-a-module-off-and-on)
- [Check the activity log](#check-the-activity-log)
- [Handle a family’s data request](#handle-a-familys-data-request)
- [Set quiet hours](#set-quiet-hours)
- [Approve support access](#approve-support-access)
- [Wipe a lost device](#wipe-a-lost-device)
- [Ask Nexus Assist](#ask-nexus-assist)
- [What each role sees](#what-each-role-sees)

**Every screen**

- [Institution setup](#institution-setup)
- [Users & access](#users-access)
- [Theme studio](#theme-studio)
- [Text & language studio](#text-language-studio)
- [Plan & usage](#plan-usage)
- [Audit & privacy](#audit-privacy)
- [Notifications](#notifications)
- [Sync centre](#sync-centre)
- [Data vault & access](#data-vault-access)
- [AI settings](#ai-settings)

**Platform & tools** (for support, IT and the team)

- [Component library (Storybook)](#component-library-storybook)
- [The app on the real server (dev cell)](#the-app-on-the-real-server-dev-cell)
- [Sign-in service (Keycloak)](#sign-in-service-keycloak)
- [Key management (Vault)](#key-management-vault)
- [Backend API (dev cell)](#backend-api-dev-cell)

---

# Step by step

## Getting started

*Sign in, find your way around, switch language and theme.*

**Sign-in page: pick an institution and a role (demo)**

![Sign-in page: pick an institution and a role (demo)](screens/001-01-sign-in-page-pick-an-institution-and-a-role-demo.png)

**Home: one tile per module you can use**

![Home: one tile per module you can use](screens/001-02-home-one-tile-per-module-you-can-use.png)

**The menu lists only the modules your role and plan allow**

![The menu lists only the modules your role and plan allow](screens/001-03-the-menu-lists-only-the-modules-your-role-and-pl.png)

**Dark theme**

![Dark theme](screens/001-04-dark-theme.png)

## Languages

*Each institution has a default language; people can switch.*

**Apex Coaching opens in Tamil**

![Apex Coaching opens in Tamil](screens/002-01-apex-coaching-opens-in-tamil.png)

**Riverside School opens in Hindi**

![Riverside School opens in Hindi](screens/002-02-riverside-school-opens-in-hindi.png)

## Invite a new teacher

*Users & access → Invite user → fill in → Send invitation.*

**1. Open Users & access**

![1. Open Users & access](screens/011-01-1-open-users-access.png)

**2. Fill in name, email, role and where it applies**

![2. Fill in name, email, role and where it applies](screens/011-02-2-fill-in-name-email-role-and-where-it-applies.png)

**3. Invitation sent: the person appears as Invited**

![3. Invitation sent: the person appears as Invited](screens/011-03-3-invitation-sent-the-person-appears-as-invited.png)

## Change the brand colour

*Theme studio → pick a colour → Save. Unreadable colours are refused.*

**1. Open Theme studio**

![1. Open Theme studio](screens/012-01-1-open-theme-studio.png)

**2. Change the brand colour; the preview updates**

![2. Change the brand colour; the preview updates](screens/012-02-2-change-the-brand-colour-the-preview-updates.png)

**3. Saved: every screen now uses the new colour**

![3. Saved: every screen now uses the new colour](screens/012-03-3-saved-every-screen-now-uses-the-new-colour.png)

## Change any wording

*Text & language studio → find the text → edit → Save.*

**1. Open Text & language studio**

![1. Open Text & language studio](screens/013-01-1-open-text-language-studio.png)

**2. Type the new wording**

![2. Type the new wording](screens/013-02-2-type-the-new-wording.png)

**3. The new wording shows everywhere (here: the Save button)**

![3. The new wording shows everywhere (here: the Save button)](screens/013-03-3-the-new-wording-shows-everywhere-here-the-save.png)

## Switch a module off and on

*Plan & usage → flip the switch. The menu changes at once.*

**1. Plan & usage lists every module in your plan**

![1. Plan & usage lists every module in your plan](screens/014-01-1-plan-usage-lists-every-module-in-your-plan.png)

**2. Sync centre switched off: it leaves the menu**

![2. Sync centre switched off: it leaves the menu](screens/014-02-2-sync-centre-switched-off-it-leaves-the-menu.png)

## Check the activity log

*Audit & privacy → Check this page. A broken link would be flagged.*

**1. Every change is listed; the check confirms nothing was altered**

![1. Every change is listed; the check confirms nothing was altered](screens/015-01-1-every-change-is-listed-the-check-confirms-noth.png)

## Handle a family’s data request

*Audit & privacy → Data requests → open → Start work → Mark completed.*

**1. Data requests, with due dates**

![1. Data requests, with due dates](screens/016-01-1-data-requests-with-due-dates.png)

**2. Open a request**

![2. Open a request](screens/016-02-2-open-a-request.png)

**3. Started: the family can see it is in progress**

![3. Started: the family can see it is in progress](screens/016-03-3-started-the-family-can-see-it-is-in-progress.png)

## Set quiet hours

*Notifications → Preferences → quiet hours → Save.*

**1. Choose channels and quiet hours**

![1. Choose channels and quiet hours](screens/017-01-1-choose-channels-and-quiet-hours.png)

**2. Saved**

![2. Saved](screens/017-02-2-saved.png)

## Approve support access

*Data vault & access → Approve (narrow it if you like) → it ends by itself.*

**1. A pending request from Nexus support: who, why, what, how long**

![1. A pending request from Nexus support: who, why, what, how long](screens/018-01-1-a-pending-request-from-nexus-support-who-why-w.png)

**2. Choose modules and hours, and confirm**

![2. Choose modules and hours, and confirm](screens/018-02-2-choose-modules-and-hours-and-confirm.png)

**3. The grant is active; Revoke now ends it early**

![3. The grant is active; Revoke now ends it early](screens/018-03-3-the-grant-is-active-revoke-now-ends-it-early.png)

## Wipe a lost device

*Sync centre → Devices → Revoke and wipe.*

**1. Every signed-in device, with its last sync**

![1. Every signed-in device, with its last sync](screens/019-01-1-every-signed-in-device-with-its-last-sync.png)

**2. Confirm: the device is wiped the next time it connects**

![2. Confirm: the device is wiped the next time it connects](screens/019-02-2-confirm-the-device-is-wiped-the-next-time-it-c.png)

## Ask Nexus Assist

*AI settings → Open Nexus Assist → ask. Answers show their sources.*

**1. AI settings: on/off, which areas it may read**

![1. AI settings: on/off, which areas it may read](screens/020-01-1-ai-settings-on-off-which-areas-it-may-read.png)

**2. The answer, marked AI-generated, with its sources**

![2. The answer, marked AI-generated, with its sources](screens/020-02-2-the-answer-marked-ai-generated-with-its-source.png)

## What each role sees

*The same app, trimmed to each person’s role.*

**Teacher: fewer modules, children’s private details hidden**

![Teacher: fewer modules, children’s private details hidden](screens/021-01-teacher-fewer-modules-children-s-private-details.png)

**Parent: only their own family**

![Parent: only their own family](screens/021-02-parent-only-their-own-family.png)

---

# Every screen

## Institution setup

**Institution setup — Profile**

![Institution setup — Profile](screens/100-01-institution-setup-profile.png)

**Institution setup — Structure**

![Institution setup — Structure](screens/100-02-institution-setup-structure.png)

**Institution setup — Locale & formats**

![Institution setup — Locale & formats](screens/100-03-institution-setup-locale-formats.png)

**Institution setup — Calendar**

![Institution setup — Calendar](screens/100-04-institution-setup-calendar.png)

## Users & access

**Users & access — Users**

![Users & access — Users](screens/101-01-users-access-users.png)

**Users & access — Roles**

![Users & access — Roles](screens/101-02-users-access-roles.png)

**Users & access — Sessions**

![Users & access — Sessions](screens/101-03-users-access-sessions.png)

**Users & access — Single sign-on**

![Users & access — Single sign-on](screens/101-04-users-access-single-sign-on.png)

## Theme studio

**Theme studio — Colours**

![Theme studio — Colours](screens/102-01-theme-studio-colours.png)

**Theme studio — Typography & spacing**

![Theme studio — Typography & spacing](screens/102-02-theme-studio-typography-spacing.png)

**Theme studio — Assets**

![Theme studio — Assets](screens/102-03-theme-studio-assets.png)

## Text & language studio

**Text & language studio — Messages**

![Text & language studio — Messages](screens/103-01-text-language-studio-messages.png)

**Text & language studio — Import & export**

![Text & language studio — Import & export](screens/103-02-text-language-studio-import-export.png)

## Plan & usage

**Plan & usage — Modules**

![Plan & usage — Modules](screens/104-01-plan-usage-modules.png)

**Plan & usage — Usage**

![Plan & usage — Usage](screens/104-02-plan-usage-usage.png)

## Audit & privacy

**Audit & privacy — Audit log**

![Audit & privacy — Audit log](screens/105-01-audit-privacy-audit-log.png)

**Audit & privacy — Consents**

![Audit & privacy — Consents](screens/105-02-audit-privacy-consents.png)

**Audit & privacy — Data requests**

![Audit & privacy — Data requests](screens/105-03-audit-privacy-data-requests.png)

**Audit & privacy — Compliance**

![Audit & privacy — Compliance](screens/105-04-audit-privacy-compliance.png)

## Notifications

**Notifications — Templates**

![Notifications — Templates](screens/106-01-notifications-templates.png)

**Notifications — Delivery log**

![Notifications — Delivery log](screens/106-02-notifications-delivery-log.png)

**Notifications — My preferences**

![Notifications — My preferences](screens/106-03-notifications-my-preferences.png)

## Sync centre

**Sync centre — This device**

![Sync centre — This device](screens/107-01-sync-centre-this-device.png)

**Sync centre — Devices**

![Sync centre — Devices](screens/107-02-sync-centre-devices.png)

**Sync centre — Conflicts**

![Sync centre — Conflicts](screens/107-03-sync-centre-conflicts.png)

## Data vault & access

**Data vault & access — Access requests**

![Data vault & access — Access requests](screens/108-01-data-vault-access-access-requests.png)

**Data vault & access — Grants**

![Data vault & access — Grants](screens/108-02-data-vault-access-grants.png)

**Data vault & access — Keys**

![Data vault & access — Keys](screens/108-03-data-vault-access-keys.png)

**Data vault & access — Emergency access**

![Data vault & access — Emergency access](screens/108-04-data-vault-access-emergency-access.png)

## AI settings

**AI settings**

![AI settings](screens/109-01-ai-settings.png)

---

# Platform & tools

## Component library (Storybook)

*Every building block of the screens, with its states. Open it to browse the components.*

Open: http://127.0.0.1:6006 (start it with `pnpm --dir frontend/packages/ui-storybook dev`)

**Storybook: components on the left, the selected one on the right**

![Storybook: components on the left, the selected one on the right](screens/200-01-storybook-components-on-the-left-the-selected-on.png)

## The app on the real server (dev cell)

*Same screens as the demo, but on the real server and database. People sign in through the sign-in service.*

Open: `uv run --project backend nexus-compose-up`, `nexus-dev`, then `pnpm --dir frontend dev:real` → http://127.0.0.1:3100

**1. Sign-in page of a real installation**

![1. Sign-in page of a real installation](screens/210-01-1-sign-in-page-of-a-real-installation.png)

**2. The sign-in service asks for the password (or the school’s own login)**

![2. The sign-in service asks for the password (or the school’s own login)](screens/210-02-2-the-sign-in-service-asks-for-the-password-or-t.png)

**3. Signed in: no demo banner, real data**

![3. Signed in: no demo banner, real data](screens/210-03-3-signed-in-no-demo-banner-real-data.png)

## Sign-in service (Keycloak)

*Holds passwords, single sign-on and multi-factor login. Each institution is an organisation.*

Open: Admin console → http://127.0.0.1:58080/admin (user `admin`, password `NEXUS_KEYCLOAK_ADMIN_PASSWORD` in backend/.env)

**1. The dev cell realm (nexus-dev; an own-server install uses nexus)**

![1. The dev cell realm (nexus-dev; an own-server install uses nexus)](screens/220-01-1-the-dev-cell-realm-nexus-dev-an-own-server-ins.png)

**2. Organisations: one per institution**

![2. Organisations: one per institution](screens/220-02-2-organisations-one-per-institution.png)

**3. Users: the people who can sign in**

![3. Users: the people who can sign in](screens/220-03-3-users-the-people-who-can-sign-in.png)

**4. Clients: the NexusCampus app**

![4. Clients: the NexusCampus app](screens/220-04-4-clients-the-nexuscampus-app.png)

**5. Login flows (password, single sign-on, multi-factor)**

![5. Login flows (password, single sign-on, multi-factor)](screens/220-05-5-login-flows-password-single-sign-on-multi-fact.png)

## Key management (Vault)

*Every institution’s encryption keys live here, never in the database. The app’s Data vault screen shows their status only.*

Open: http://127.0.0.1:58200/ui → method Token, token `NEXUS_VAULT_TOKEN` in backend/.env (dev only)

**1. Sign in to the key vault**

![1. Sign in to the key vault](screens/230-01-1-sign-in-to-the-key-vault.png)

**2. Secrets engines: “transit” holds the encryption keys**

![2. Secrets engines: “transit” holds the encryption keys](screens/230-02-2-secrets-engines-transit-holds-the-encryption-k.png)

**3. One key per institution and purpose, plus the audit-signing key**

![3. One key per institution and purpose, plus the audit-signing key](screens/230-03-3-one-key-per-institution-and-purpose-plus-the-a.png)

**4. A key’s details: type and versions; the key itself never leaves the vault**

![4. A key’s details: type and versions; the key itself never leaves the vault](screens/230-04-4-a-key-s-details-type-and-versions-the-key-itse.png)

## Backend API (dev cell)

*What the app talks to. Developers and integrators read every endpoint here.*

Open: http://127.0.0.1:8000/docs (interactive) · http://127.0.0.1:8000/healthz · http://127.0.0.1:8000/readyz

**1. Interactive API reference, grouped by module**

![1. Interactive API reference, grouped by module](screens/240-01-1-interactive-api-reference-grouped-by-module.png)

**2. One endpoint: its inputs, outputs and errors**

![2. One endpoint: its inputs, outputs and errors](screens/240-02-2-one-endpoint-its-inputs-outputs-and-errors.png)

**3. Health check: the database and cache answer**

![3. Health check: the database and cache answer](screens/240-03-3-health-check-the-database-and-cache-answer.png)

---

## Keeping this manual up to date

Run `fnm exec --using=24 -- pnpm --dir frontend manual`. It retakes every screenshot and rewrites this file.
For the *Platform & tools* part, start the dev stack first: `uv run --project backend nexus-compose-up`,
`uv run --project backend nexus-dev` and `pnpm --dir frontend dev:real`; tools that are not running are listed
as not captured.

- A new module or tab appears under *Every screen* by itself.
- To add a step-by-step example for a new feature, add one `flow` test to `frontend/e2e/manual/manual.spec.ts`:
  a title, a one-line intro, and a `shot(...)` after each step.
