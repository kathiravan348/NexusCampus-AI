# Owner checklist

> Everything that waits for you, in one place, in the order that saves the most time. State as of 2026-11-23.
> Tick a box when done. Details behind each item are linked; the full decision log is
> [`OWNER-AWAY-DECISIONS.md`](OWNER-AWAY-DECISIONS.md).

## Where things stand

- **Stage 1** (platform foundation) is released (D54).
- **Stage 2** (Nexus Control and delivery) is **built**: every Nexus Control page (P01–P18) runs on its own backend
  and database, the install agent (M84) runs self-hosted installs, and provisioning, offboarding, moves, the access
  broker and Razorpay payment links for India work end to end. The last tasks are done and merged: the
  frozen-institution banner, the Control job buttons (NEX-140–142, D65) and one open offboarding or move per tenant
  (NEX-143, D66). Stripe for Europe moved to a later stage (D64).
- **Release review started 2026-11-23:** every automated check was re-run on the final `main` and passes (backend,
  frontend, browser checks on demo and real data, accessibility, languages, speed). Results:
  [`STAGE-2-RELEASE.md`](STAGE-2-RELEASE.md). It now waits for your decisions in section 0.

## 0. Approve the Stage 2 release (when the items below suit you)

- [ ] Read [`STAGE-2-RELEASE.md`](STAGE-2-RELEASE.md) (what was built and tested, timings, open items) and
      [`STAGE-2-SECURITY.md`](STAGE-2-SECURITY.md).
- [ ] Confirm or change the decisions in section 2 (made while you were away; each can be undone).
- [ ] Decide on the one gap left on a frozen screen: admins can review, approve or discard a support diagnostic
      bundle only through the API (NEX-112). Either OK a small task for the **Review / Approve / Discard** buttons on
      **Install & updates** before the release, or let it wait for Stage 3.
- [ ] Decide which of sections 4 and 5 must be done before the release, and which can wait (none blocks the
      software itself: they are prices, live payment keys, a Kubernetes test, trust-page facts, the deck contact line,
      the Hindi / Tamil check, and production unseal / penetration test).
- [ ] Say **"approve the Stage 2 release"**. I then mark Stage 2 released and open the Stage 3 board.

## 1. Review Stage 2, then freeze it — done 2026-11-22 ("all good", D56)

- [x] Start Nexus Control on demo data: `fnm exec --using=24 -- pnpm --dir frontend review:start:control`
- [x] Follow [`STAGE-2-WALKTHROUGH.md`](STAGE-2-WALKTHROUGH.md): one row per staff role, what to try, what to look for.
- [x] Also open the institution app (`pnpm --dir frontend review:start`), sign in as **Apex Coaching** admin, and open
      **Install & updates**.
- [x] Write anything you find in [`STAGE-2-FEEDBACK.md`](STAGE-2-FEEDBACK.md), one line each.
- [x] Say **"approve the Stage 2 freeze"** (NEX-092), or list what must be fixed first.

The pictures of every screen, including all 18 Control pages, are in
[`docs/manual/USER-MANUAL.md`](../manual/USER-MANUAL.md) (106 screenshots), if you prefer to look before running it.

## 2. Confirm or change the decisions made while you were away (about 15 minutes)

Each one can be undone; the log says how. The ones worth a conscious yes:

- [ ] **D55: the Stage 2 build started before the freeze.** Changes from your review become fix tasks.
- [ ] **Staff sign-in = our own Keycloak realm `nexus-staff` with password + one-time code (TOTP) at every
      sign-in.** Passkeys can be added later.
- [ ] **Lago set-up:**
  - version 1.57.0, with its own database
  - no Lago web screens and no PDF service
  - Lago's usage tracking is off
  - reachable only from inside our own systems

  Nexus Control is the only billing screen.
- [ ] **Apex Coaching is the demo "own server" institution** for the Install & updates page.
- [ ] Implementation staff may read the price list (they need it to start trial tenants).
- [ ] Dev-only secrets were generated into your git-ignored `backend/.env`:
  - the staff sign-in client secret
  - Lago passwords and keys

  They never leave your machine. Production secrets will live in OpenBao.

- [ ] **Frozen-screen change (D56):** the backend now lets an admin read, approve or discard a support diagnostic
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

- After your release approval: mark Stage 2 released, then open the Stage 3 board (core institution operations).
- NEX-140–143 are reviewed and merged. Gemini and Codex build; I plan and review (D68).
- Anything that needs a new download, I hold and ask you first.
