# Decisions made while the Owner was away

> Started 2026-11-21 (Owner instruction: keep building, don't wait for approval, hold anything that needs a download,
> keep everything open source, highly secure and standard; users want low cost without losing security or privacy).
> Each line says what Claude decided, why, and how to undo it. Formal entries are in `docs/DECISIONS.md`.
> **Please review this list when you are back.** Anything marked *provisional* is easy to reverse.

## Needs your action

| # | What | Why it waits for you |
|---|---|---|
| 1 | **Stage 1 release approval** (`docs/review/STAGE-1-RELEASE.md`) and native-speaker review of Hindi / Tamil texts | Only you can approve a release; all automated checks pass |
| 2 | **NEX-066 OpenBao + Valkey swap is held** | Needs two new Docker image downloads (`openbao/openbao`, `valkey/valkey`). Say "OK to pull" and it gets built next |

## Decisions

| When | Decision | Why | Undo |
|---|---|---|---|
| 2026-11-21 | Committed and merged the picture-first **user manual** (`docs/manual/`, 78 screenshots, `pnpm --dir frontend manual`) that the previous session had finished but not committed | Work was complete and checks were green | Revert merge `5faa8ca` |
| 2026-11-21 | **D48: OpenBao replaces HashiCorp Vault, Valkey replaces Redis** (decided; build held for downloads) | Vault 1.20 is BUSL and Redis 7.4 is RSAL/SSPL — not open source, and self-hosted installs ship them. OpenBao (MPL-2.0) and Valkey (BSD-3) are the Linux Foundation drop-ins: same API, same security, no licence cost | Withdraw NEX-066 |
| 2026-11-21 | **D49: Owner-away mode** — Claude plans, builds, **self-reviews** and merges one task at a time; Stage 2 opened although Stage 1 release approval is pending | Your instruction. Gemini or you can re-check any task (each review note says "self-review") | Set Stage 2 back to "later" in `docs/tasks/BOARD.md` |
| 2026-11-21 | **D50: Nexus Control frontend layout** — `apps/control` + `@nexus/ui-control`; contracts/mocks/hooks live in the existing packages under `control/`; a test blocks any learner/family/staff field in Control contracts (V-7) | Reuses the proven campus tooling; no new dependencies; privacy enforced by a test, not by memory | Re-plan NEX-067–071 |
| 2026-11-21 | **D51: Billing engine = Lago** (open source, self-hosted in our own cloud) behind an adapter; Razorpay (India) / Stripe (EU) for payments — *provisional* | Open source, our billing data stays in our cell, no revenue-share fee (cheaper than Chargebee / Stripe Billing), GST/VAT and usage billing built in. Prototype uses mock data only, so nothing is locked in yet | Change D51 before the Stage 2 build step |
| 2026-11-21 | **D52: Self-hosted licence = Standard / Enterprise editions, per active learner per year** (bands, per-campus minimum), perpetual or term — *provisional* | Same unit as SaaS so customers can compare and move between models; learner cap can be checked offline | Change D52; prices and bands are not set anywhere |
| 2026-11-21 | **Stage 2 board** planned as NEX-066–092: 3 contract tasks, mocks, app shell, one screen task per module P01–P18, M84 screen, review build, freeze | Follows `docs/PLAN.md` Stage 2 outline and the module catalogue | Edit `docs/tasks/stage-2/BOARD.md` |
| 2026-11-21 | **D53: Nexus Control texts get their own catalogue** (`i18n/control/{en,hi,ta}.json`), not the institution text catalogue | Otherwise every institution could override our staff screens' texts in its Text studio, and the backend key export and campus bundle would grow. Still English/Hindi/Tamil (D42) | Move keys into `messages/*.json` |
| 2026-11-21 | Control keeps **no persisted cache** in the browser; switching staff clears all cached answers | Provider records are commercially sensitive; nothing should stay on a shared laptop | — |
| 2026-11-21 | Mock-only `mockHeaders` option added to the shared API client (for `X-Nexus-Staff`) | Smallest change that lets one client serve both apps; real mode ignores it | Revert in `services/src/client.ts` |

## Follow-ups found (not done — Stage 1 screens are frozen, D43)

| Where | Problem | Suggested fix |
|---|---|---|
| campus `modules/m04/KeyEditor.tsx` | Class `divide-border-subtle` has no theme token (row dividers fall back to the default colour) | Use `divide-border-default` |
| campus `modules/m04/HistoryPanel.tsx`, `ImportExport.tsx` | Class `text-caption` has no theme token (text renders at the inherited size) | Use `text-body-sm`; extend the token check to app screens like `apps/control/src/themeClasses.test.ts` |
