# NexusCampus — Repository map

> Update this file in the same task that adds or moves a folder. Folders marked (planned) do not exist yet.

```
/
├─ AGENTS.md            rulebook (all agents)
├─ CLAUDE.md            Claude's role (default implementer)
├─ GEMINI.md            Gemini's role (default planner / reviewer)
├─ START-HERE.md        first-run steps (delete after setup)
├─ brand.config.ts      platform brand names
├─ docs/
│  ├─ REQUIREMENTS.md   vision, institution types, global / customisation / offline / enterprise / AI requirements
│  ├─ MODULES.md        all modules (M01–M91, Nexus Control P01–P18): stage, types, offline level, AI
│  ├─ PLAN.md           7 stages and the current stage's task order
│  ├─ ARCHITECTURE.md  DECISIONS.md  STRUCTURE.md  CONTRACTS.md  COMPONENTS.md
│  ├─ guides/           USER-GUIDE.md, API.md, DATABASE.md (living guides, AGENTS.md §7a)
│  ├─ presentation/     NexusCampus-Introduction.pptx (plain-language project intro deck)
│  ├─ tasks/            BOARD.md (index) + stage-N/ (BOARD.md + task files NEX-###.md per stage)
│  └─ templates/        TASK.md, HANDOFF.md, REVIEW.md
├─ frontend/            (planned, NEX-001)
│  ├─ packages/
│  │  ├─ ui-core/       generic components + theme engine (NEX-002, 005, 006)
│  │  ├─ ui-edu/        education components built on ui-core
│  │  ├─ i18n/          messages, formatters, layered text overrides, RTL (NEX-003)
│  │  ├─ offline/       IndexedDB store, outbox, sync status (NEX-007)
│  │  ├─ ui-storybook/  Storybook (NEX-004)
│  │  ├─ contracts/     API types + Zod schemas (NEX-008, 009)
│  │  ├─ mocks/         demo tenants + MSW handlers (NEX-010)
│  │  └─ services/      data layer, mock | real, offline-aware (NEX-011)
│  │  └─ ui-control/    Nexus Control components (planned, Stage 2)
│  └─ apps/
│     ├─ campus/        the PWA for every institution role
│     └─ control/       Nexus Control provider platform (planned, Stage 2)
├─ backend/             product backend (planned, Stage 1 build step)
├─ control/             Nexus Control backend (planned, Stage 2)
└─ deploy/              Compose, Helm, air-gapped bundle tooling (planned, Stage 1 build step / Stage 2)
```
