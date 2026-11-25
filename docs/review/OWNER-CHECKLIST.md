# Owner checklist

> Everything that waits for you, in one place, in the order that saves the most time. State as of 2026-11-25
> (Stage 3 prototype frozen, D78). Tick a box when done. Details behind each item are linked; the
> full decision log is [`OWNER-AWAY-DECISIONS.md`](OWNER-AWAY-DECISIONS.md).

## Where things stand

- **Stage 1** (platform foundation) released 2026-11-21 (D54); **Stage 2** (Nexus Control and delivery) released
  2026-11-23 (D70). Results: [`STAGE-2-RELEASE.md`](STAGE-2-RELEASE.md).
- **Stage 3** (core institution operations) — the clickable preview is finished: all 35 tasks (NEX-146–179, 181)
  are done, reviewed and merged on [`../tasks/stage-3/BOARD.md`](../tasks/stage-3/BOARD.md). Your review points 1–2
  were fixed (NEX-182) and Stage 3 is **frozen** (NEX-180, D78). The build step (NEX-183–199) is on the board as
  draft. The Stage 3 tick task is switched off (2026-11-25).

## A. Review Stage 3, then freeze it (NEX-180) — done 2026-11-25 (D78)

**Before you start (5 minutes)**

- [ ] Open the demo: **http://localhost:4173** (sample data, no server). If it is not running, start it with
      `fnm exec --using=24 -- pnpm --dir frontend review:start`, which builds and opens it. Pick an institution and a
      role on the sign-in page; **Switch user** in the top bar changes role.
- [ ] Optional: look at the pictures first. [`USER-MANUAL.md`](../manual/USER-MANUAL.md) now has 6 Stage 3
      step-by-step examples (attendance, fees, marks, an enquiry, the three portals, leader dashboards) and a
      picture of every Stage 3 screen.
- [ ] Optional: [`NexusCampus-Introduction.pptx`](../presentation/NexusCampus-Introduction.pptx) is updated for
      Stage 3 (Stage 2 released, Stage 3 "preview, in review", new slide 19 with Stage 3 screens, progress figures).

Automatic browser checks (`pnpm --dir frontend e2e`, 2026-11-25): all 73 pass. The two desktop accessibility scans
timed out once under full load (60 s limit) and passed on a re-run in 17 s each, with no violations.

**Walk through it** — follow [`STAGE-3-WALKTHROUGH.md`](STAGE-3-WALKTHROUGH.md); write findings in
[`STAGE-3-FEEDBACK.md`](STAGE-3-FEEDBACK.md), one row per module.

- [ ] **Each role, at least once:** administrator, teacher, guardian, learner (the walkthrough's role table). Each
      should see only its own menu, and only its own records.
- [ ] **Each institution type, at least once:** Little Steps (early years), Riverside (K-12 group, Hindi),
      Northbridge (university), Apex (coaching, Tamil), Harmony (music academy).
- [ ] **The day-to-day jobs work end to end:**
  - [ ] Teacher takes attendance: group → today's session → Late + minutes → Save.
  - [ ] Office checks an invoice (**Show lines**) and opens **Record payment**.
  - [ ] Teacher enters a mark in **Gradebook** and the percentage updates.
  - [ ] Office adds an admissions enquiry and it shows as **New**.
  - [ ] Guardian, learner and teacher each land on their own portal home.
  - [ ] Leader sees **Dashboards** with an **As of** time on every figure.
- [ ] **Wording and language:** switch Riverside to Hindi and Apex to Tamil; look for English left over, cut-off
      text, or wording an institution would not use.
- [ ] **Phone width (360 px) and dark theme:** the menu opens from the menu button and nothing runs off the screen.
- [ ] **Offline:** in Attendance, go offline in the browser, save a mark, see **Waiting to sync**, reconnect.

**Things I noticed while preparing — please judge them** (none blocks the freeze; say "fix" or "fine")

- [x] **Fixed (NEX-182).** **Family home card "Attendance 0"** (Riverside guardian) counts *absences*, so 0 is good news, but it reads
      like "no attendance". Rename it "Absences", or show an attendance percentage instead?
- [x] **Fixed (NEX-182).** **Phone numbers with spaces are refused** in **Add enquiry** (`+91 98765 00000`), with the message "Include
      the country code, starting with +", although it has one. Accept spaces, or change the message?
- [x] **Build tasks NEX-193/194.** **Year-end rollover is read-only in this preview** (D76): runs can be inspected, not started or reversed.
      OK for the freeze?
- [x] **Build tasks NEX-185/186.** **Admissions public form** (families applying from the website) is a follow-up, not in this preview (NEX-164).
      OK to plan it as a build task?

**Decide**

- [x] Say **"approve the Stage 3 freeze"** — the screens and data shapes are frozen (new decision entry), and I plan
      the Stage 3 build tasks (real backend, one module at a time). Or list what must change first; each item
      becomes a fix task before the freeze.
- [ ] Say whether to **push `main`** to GitHub after the freeze commit.

## 0. Approve the Stage 3 module list and order — approved 2026-11-23 (D72)

- [x] Read the Stage 3 plan in [`PLAN.md`](../PLAN.md) (Stage 3 detail) and the board: contracts → demo data → one
      screen task per module → review build → freeze. Say **"approve the Stage 3 plan"**, or what to change (a module
      to drop, add or move). The screen tasks are planned only after your OK.

## Stage 2 release — approved 2026-11-23 (D70)

- [x] Read [`STAGE-2-RELEASE.md`](STAGE-2-RELEASE.md) and [`STAGE-2-SECURITY.md`](STAGE-2-SECURITY.md).
- [x] Decisions made while you were away (section 2) confirmed with the release.
- [x] Diagnostic-bundle buttons and their audit events added before the release (D69, NEX-144, NEX-145).
- [x] Sections 4 and 5 stay open as Owner items before the first production customer; none blocks Stage 3.
- [x] "Approve Stage 2" → Stage 2 released, Stage 3 board opened.

## 1. Review Stage 2, then freeze it — done 2026-11-22 ("all good", D56)

- [x] Start Nexus Control on demo data: `fnm exec --using=24 -- pnpm --dir frontend review:start:control`
- [x] Follow [`STAGE-2-WALKTHROUGH.md`](STAGE-2-WALKTHROUGH.md): one row per staff role, what to try, what to look for.
- [x] Also open the institution app (`pnpm --dir frontend review:start`), sign in as **Apex Coaching** admin, and open
      **Install & updates**.
- [x] Write anything you find in [`STAGE-2-FEEDBACK.md`](STAGE-2-FEEDBACK.md), one line each.
- [x] Say **"approve the Stage 2 freeze"** (NEX-092), or list what must be fixed first.

The pictures of every screen, including all 18 Control pages, are in
[`docs/manual/USER-MANUAL.md`](../manual/USER-MANUAL.md) (106 screenshots), if you prefer to look before running it.

## 2. Decisions made while you were away — confirmed with the Stage 2 release (D70)

Each one can be undone; the log says how. The ones worth a conscious yes:

- [x] **D55: the Stage 2 build started before the freeze.** Changes from your review become fix tasks.
- [x] **Staff sign-in = our own Keycloak realm `nexus-staff` with password + one-time code (TOTP) at every
      sign-in.** Passkeys can be added later.
- [x] **Lago set-up:**
  - version 1.57.0, with its own database
  - no Lago web screens and no PDF service
  - Lago's usage tracking is off
  - reachable only from inside our own systems

  Nexus Control is the only billing screen.
- [x] **Apex Coaching is the demo "own server" institution** for the Install & updates page.
- [x] Implementation staff may read the price list (they need it to start trial tenants).
- [x] Dev-only secrets were generated into your git-ignored `backend/.env`:
  - the staff sign-in client secret
  - Lago passwords and keys

  They never leave your machine. Production secrets will live in OpenBao.

- [x] **Frozen-screen change (D56):** the backend now lets an admin read, approve or discard a support diagnostic
      bundle (NEX-112). Showing **Review / Approve / Discard** on the frozen **Install & updates** page needs your OK.

## 3. Decide whether to push to GitHub (2 minutes)

- [x] Pushed `main` to `origin` on 2026-11-22 (secret scan first: only placeholders; `backend/.env` is git-ignored).

## 4. Give the business inputs only you can give (when ready)

These are not blocking the build, but real billing and the trust page need them before the first paying customer:

- [ ] **Prices:**
  - per active learner per year, and the bands (D52)
  - the per-campus minimum
  - support and update fee for perpetual licences
- [ ] **Payment gateways:** Razorpay payment links for Indian invoices are built and tested with test-mode keys
      (NEX-107). For real payments: your live Razorpay keys and a public web address for its payment notices
      (webhook). Stripe for Europe moved to a later stage (D64): a Stripe test account is only needed when the first
      EU customer signs; until then EU invoices are paid by bank transfer.
- [ ] **Kubernetes test (optional):** switch on Docker Desktop Kubernetes (or give a staging cluster) so the Helm
      chart (NEX-120) can be installed for real once; lint and template checks already pass.
- [ ] **Trust page facts:**
  - the real list of sub-processors (who hosts, who processes payments)
  - which certifications to aim for first, and when
- [ ] **Presentation:** fill in the contact line on the last slide of
      [`NexusCampus-Introduction.pptx`](../presentation/NexusCampus-Introduction.pptx) (it still says "[Contact name] ·
      [email] · [website]"). It is now a 26-slide product overview marked "work in progress": every module by stage (released, in review, planned), the technology, progress and a living-plan slide; the contact line is on the last slide.

## 5. Before production (not urgent now)

- [ ] **Correct the Hindi and Tamil texts.**
  - Run `pnpm --dir frontend texts:export`.
  - Correct the Hindi and Tamil columns in [`TRANSLATIONS.csv`](TRANSLATIONS.csv) (steps in
    [`TRANSLATIONS.md`](TRANSLATIONS.md)).
  - Run `pnpm --dir frontend texts:import`.
- [ ] **Optional:** try the staff sign-in yourself.
  - Run `uv run --project backend nexus-keycloak-staff-dev`.
  - Sign in at the dev Keycloak with a demo staff email. The first time, an authenticator app (any TOTP app) sets
    up the code.

## What I do next, unless you say otherwise

- Write the first two Stage 3 build task files (NEX-183, NEX-184) when you say to start the build; builders stay
  idle and the tick task stays off until then.
- Build order: DB + API per module group, the public enquiry form and rollover write flow, the demo seed, contract
  parity, then screens switched from demo data to real one at a time (NEX-183–199).
- Anything that needs a new download, I hold and ask you first.
