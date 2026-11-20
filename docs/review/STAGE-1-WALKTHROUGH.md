# Stage 1 review build — walkthrough

> For the Owner's review before the Stage 1 freeze (NEX-022). Everything runs on **fictional demo data** in your
> browser; nothing is sent anywhere. Note what you find in `docs/review/STAGE-1-FEEDBACK.md`.

## 1. Run it (one command)

From the repository root, in PowerShell or any terminal:

```bash
fnm exec --using=24 -- pnpm --dir frontend install
```

```bash
fnm exec --using=24 -- pnpm --dir frontend review:start
```

`review:start` builds the app in review mode (production build on mock data, with the offline app worker) and opens
it in your browser (the address is printed as `Local: http://localhost:4173/`). It prints `[timing]` lines for the
build and for "ready". Stop it with Ctrl+C.

Optional — the automatic checks (smoke on every screen, Hindi and Tamil, pseudo-locale, offline, accessibility):

```bash
fnm exec --using=24 -- pnpm --dir frontend exec playwright install chromium
```

```bash
fnm exec --using=24 -- pnpm --dir frontend e2e
```

The HTML report lands in `frontend/playwright-report/` (open `index.html`).

## 2. How to move around
- **Sign in:** pick an institution and a role on the first page. No password. **Switch persona** with the people icon
  in the top bar; **Sign out** with the arrow icon.
- **Language:** the language picker sits at the bottom of the menu (Riverside offers Hindi and English, Apex Coaching Tamil and English).
- **Light / dark:** the moon / sun icon in the top bar.
- **Phone size:** narrow the browser window (or DevTools → device toolbar, 360 px). The menu moves behind the ☰ button.
- **Offline:** DevTools → Network → "Offline", then reload. Turn it back on to see queued changes sync.
- **Reset the demo:** close all tabs of the app (the mock data lives in each tab; reopening starts fresh).

## 3. Who sees what (menu per persona)

| Role | Menu |
|---|---|
| Admin (all except Little Steps, Harmony) | Home · Institution setup · Users & access · Theme studio · Text & language studio · Plan & usage · Audit & privacy · Notifications · Sync centre · AI settings · Data vault & access |
| Admin — Little Steps (no AI in plan) | as above without AI settings |
| Admin — Harmony (no AI, no offline sync in plan) | as above without AI settings and Sync centre |
| Teacher | Home · Users & access (read) · Notifications · Sync centre (Harmony: no Sync centre) |
| Guardian / Learner | Home · Notifications · Sync centre (Harmony: no Sync centre) |

The ✨ **Assist** button in the top bar appears where the institution has AI on.

## 4. Walkthrough per institution type

Tick each line in the feedback file as you go. "Look for" says what should be true.

### EY — Little Steps (en-IN) · Priya (Admin), Arjun (Teacher), Sunita (Guardian)
1. **Priya → Institution setup:** profile, one campus, Indian locale, rupee currency, calendar with holidays.
   Look for: Indian date and number formats; saving a profile change shows a success message.
2. **Priya → Users & access:** invite a user, open a user, change roles, sessions, SSO screen.
   Look for: the permission matrix is readable; a child's contact details stay masked.
3. **Priya → Theme studio:** change brand colour, see the live preview; a low-contrast choice is blocked with a reason.
4. **Priya → Plan & usage:** modules on/off, usage meters; AI is not in this plan.
5. **Arjun:** smaller menu; Users & access is read-only. **Sunita:** Notifications → My preferences only.

### K12 group — Riverside School (Hindi `hi-IN` + British English, 2 campuses: North / South) · Helen (Admin), Tom (Teacher), Grace (Guardian), Oliver (Learner)
1. **Helen → Institution setup → Structure:** the group with two campuses; edit a campus.
2. **Helen → Text & language studio:** search a text, override it, see it change in the app; history and undo.
3. **Helen → AI settings:** AI on/off and credits; then the ✨ Assist panel answers with sources.
4. **Helen → Audit & privacy:** audit log (filters, "check the chain"), consents, data requests with due dates.
5. **Tom / Grace / Oliver:** menus match the table above; nothing an admin-only screen shows leaks.

### HE — Northbridge University (en-US) · Robert (Admin), Elena (Teacher), Patricia (Guardian), Jordan (Learner)
1. **Robert → Notifications:** templates per language, edit with preview, delivery log filters.
2. **Robert → Data vault & access:** a provider access request → approve with a time limit or deny; grants; keys;
   break-glass notices. Look for: nothing provider-side happens without an approved grant.
3. **Robert → Sync centre:** this device, devices list, conflicts.
4. **Jordan (Learner):** Notifications preferences and quiet hours.

### TP Tamil — Apex Coaching, Chennai (Tamil `ta-IN` + Indian English) · Karthik (Admin), Meena (Teacher), Lakshmi (Guardian), Arun (Learner)
1. **Karthik:** the whole app in Tamil, Indian rupee and India time; the top bar still fits on a phone.
2. Switch to **English** in the language picker, then back to Tamil.
3. **Karthik → Text studio:** the "learner" override reads பயிற்சியாளர்; edit a Tamil text and see it change.
4. **Arun:** Tamil notifications preferences. Look for: no English left on screen, no clipped text.

Riverside opens in **Hindi** the same way (Helen): switch to English and back; all screens are in Hindi.

### SK — Harmony Music Academy (en-SG) · Wei Ling (Admin), Daniel (Teacher), Mei (Guardian), Rachel (Learner)
1. **Wei Ling → Plan & usage:** a small plan — AI settings and Sync centre are off, and their menu items are hidden.
2. **Wei Ling → Users & access:** a smaller school's users and roles.
3. **Mei / Rachel:** the smallest menu (Home, Notifications).

### Everyone — install, offline and updates
1. In Chrome or Edge, the **install** icon appears in the top bar; install and open the app from your desktop.
2. Go **offline** (DevTools) and reload: the app still opens. Users & access shows cached users with an offline note;
   Institution setup says "Needs a connection".
3. Offline, change **Notifications → My preferences** and save: "Saved on this device". Try **Sign out**: it is blocked
   while the change waits. Go back online: it syncs, the top bar shows "Last synced …", and sign-out works.

## 4b. Real mode (backend, NEX-060–063)

Every Stage 1 screen also runs on the real backend. One-time setup: `uv run --project backend nexus-compose-up`,
`uv run --project backend alembic upgrade head`, `uv run --project backend nexus-seed`,
`uv run --project backend nexus-keycloak-dev`. Then start `uv run --project backend nexus-dev` and
`pnpm --dir frontend dev:real`, open `http://127.0.0.1:3100` and choose **Sign in with your institution account**
(a seeded admin, e.g. the Little Steps administrator; password = `NEXUS_DEMO_USER_PASSWORD` in `backend/.env`).

- No demo banner or persona switch; sign-out also ends the server session.
- Nexus Assist uses the AI gateway. With `NEXUS_AI_PROVIDER=fake` (default) answers are built from the records
  without a paid model; Little Steps has AI switched off until you turn it on (Plan & usage, then AI settings).
- Data vault: provider requests are filed with the dev broker stub
  (`POST /api/v1/dev/broker/tenants/<tenant>/access-requests`), then approved or denied in the screen.
- The dev cell is India-region (D45): Little Steps and Apex sign in; the EU-region demo tenants need an EU cell.
- `pnpm --dir frontend e2e:real` walks all of it (set `NEXUS_E2E_EMAIL` / `NEXUS_E2E_PASSWORD`).

## 5. Known limits of this build
- Demo data only; changes last until the tab closes. There is no backend yet (Stage 1 build step).
- Assist answers are canned demo answers with sources; no AI model is called.
- E-mail / SMS / push are not sent; the delivery log is sample data.
- Hindi and Tamil texts are first drafts (machine-written); a native speaker should review them.
- Screens show "last synced" in the top bar only after a sync; per-screen "last synced" labels are not shown yet.
- In review mode a new build activates straight away (the "new version" prompt only shows in real-data builds).
- The pseudo-locale (`en-XA`, for spotting untranslated or clipped text) is only in the developer build
  (`pnpm --dir frontend dev`).
