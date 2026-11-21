# Stage 2 review build — walkthrough

> For the Owner's review before the Stage 2 freeze (NEX-092). Everything runs on **fictional demo data** in your
> browser; nothing is sent anywhere. Note what you find in `docs/review/STAGE-2-FEEDBACK.md`.

## 1. Run it (one command)

From the repository root:

```bash
fnm exec --using=24 -- pnpm --dir frontend review:start:control
```

It builds Nexus Control on mock data and opens it in your browser (address printed as `Local: http://...`). Stop it
with Ctrl+C. The institution app (with the new **Install & updates** page) still starts with
`pnpm --dir frontend review:start`.

Optional — the automatic check (every staff role opens every page in its menu):

```bash
fnm exec --using=24 -- pnpm --dir frontend exec playwright test -c e2e/playwright.config.ts --project control
```

## 2. Sign in as each role

The sign-in page lists one demo staff member per role. Use the name switch in the top bar to change role without
signing out. Every page states its rules on screen; the full guide is `docs/guides/CONTROL-GUIDE.md`.

| Sign in as | Role | Try this |
|---|---|---|
| **Nisha Verma** | Super admin | Open every menu item (18 pages). Check **Home** tiles match the menu. |
| **Arjun Mehta** | Sales | **Accounts** → open Sunrise Montessori, add a note. **Pricing & quotes** → open the AI-drafted quote: it cannot be sent until you tick "I checked this AI draft". **Analytics** → customer health is labelled AI, reasons in words. **Sandboxes** → demos hold synthetic data only. |
| **Farah Khan** | Billing | **Billing** → record a bank transfer (statement reference only, no card or bank numbers). **Usage**. |
| **A. Morgan** | Support | **Support** → reply to a ticket, add an internal note. **Access requests** → ask an institution for time-limited access; the institution approves it in its own app (Data vault & access). |
| **Ravi Shankar** | Implementation | **Provisioning** → start a trial tenant and watch the steps. **Licences** → signed licences with their caps. **Projects** → checklists, overdue tasks, AI-draft mark. **Moves** → seven steps, export always encrypted with the tenant's keys. |
| **Lena Fischer** | Release manager | **Releases** → AI-drafted release notes need a person; start a rollout wave. **Extensions**. |
| **E. Lindqvist** | Site reliability | **Fleet** → health check-ins are counts and timings only. **Access requests** → break-glass needs a second approver. |
| **C. Okafor** | Security officer | **Staff** → MFA for everyone; no role reads institution data. **Trust** → certifications, incidents with the breach clock ("Notified … on time"), sub-processors, customer agreements. |
| **Suresh Babu** | Partner | **Partners** shows only his own deal registrations; **Accounts** only his customers. |

## 3. What to look for

- Does each page say plainly what it shows and what it never shows (institution data)?
- Are AI drafts always marked and always need a person before anything is sent?
- Language switch (English, हिन्दी, தமிழ்) on any page: Hindi and Tamil are machine drafts — correct them later in
  `docs/review/TRANSLATIONS.csv` (see `TRANSLATIONS.md`).
- Light and dark theme; a narrow window (phone width).

## 4. Known limits of this prototype

- Most pages are read-only; actions shown are on mock data and reset on reload.
- No Control backend yet: real sign-in (SSO + MFA), audit of staff actions and the install agent's live data come in
  the Stage 2 build step after the freeze.
