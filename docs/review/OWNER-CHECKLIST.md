# Owner checklist

> Everything that waits for you, in one place, in the order that saves the most time. State as of 2026-11-23 (Stage 2 released).
> Tick a box when done. Details behind each item are linked; the full decision log is
> [`OWNER-AWAY-DECISIONS.md`](OWNER-AWAY-DECISIONS.md).

## Where things stand

- **Stage 1** (platform foundation) released 2026-11-21 (D54); **Stage 2** (Nexus Control and delivery) released
  2026-11-23 (D70). Results: [`STAGE-2-RELEASE.md`](STAGE-2-RELEASE.md).
- **Stage 3** (core institution operations) is open: [`../tasks/stage-3/BOARD.md`](../tasks/stage-3/BOARD.md). The
  first two contract tasks are planned (NEX-146 academic structure, NEX-147 fields, forms, workflows, numbering).

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
      [email] · [website]"). It is now a 25-slide product overview marked "work in progress": every module by stage (released, in review, planned), the technology, progress and a living-plan slide; the contact line is on the last slide.

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

- Gemini and Codex build NEX-146 and NEX-147 (they do not overlap); I review and merge them (D68).
- Write the next Stage 3 tasks two ahead in board order (D72): contracts first, then demo data and screens.
- Anything that needs a new download, I hold and ask you first.
