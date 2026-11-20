# Stage 1 review — Owner feedback checklist

> Fill in while following `STAGE-1-WALKTHROUGH.md`. Per line: mark **Works**, **Change** or **Missing** with an `x`
> and add a note. The planner turns every Change / Missing into a task at the freeze (NEX-022).

Reviewer: ________ · Date: ________ · Browser / device: ________

## Shell and sign-in

| Item | Works | Change | Missing | Notes |
|---|---|---|---|---|
| Demo sign-in: institutions and roles are clear | | | | |
| Persona switch and sign-out | | | | |
| Menu shows only what the role may use | | | | |
| Light / dark theme and logo | | | | |
| Phone size (360 px): menu, header, tables as cards | | | | |
| Demo banner on every screen | | | | |

## Modules

| Module | Item | Works | Change | Missing | Notes |
|---|---|---|---|---|---|
| M01 Institution setup | Profile, structure (campuses), locale & formats, calendar | | | | |
| M02 Users & access | Users list, invite, user detail, masking of minors' details | | | | |
| M02 Users & access | Roles and permission matrix, scopes | | | | |
| M02 Users & access | Sessions, SSO settings | | | | |
| M03 Theme studio | Colours, fonts, logo, live preview, contrast guard | | | | |
| M04 Text & language studio | Search, overrides, in-context preview, import / export, history | | | | |
| M05 Plan & usage | Modules on / off, AI credits, usage meters | | | | |
| M06 Audit & privacy | Audit log + chain check, consents, data requests, compliance | | | | |
| M07 Notifications | Templates per language + preview, delivery log | | | | |
| M07 Notifications | My preferences: channels, quiet hours | | | | |
| M10 Sync centre | This device, devices, conflicts, remote wipe | | | | |
| M11 Nexus Assist | Assist panel answers with sources; AI settings; AI-off state | | | | |
| M83 Data vault & access | Requests (approve / deny), grants, keys, break-glass, history | | | | |

## Language, offline, install, accessibility

| Item | Works | Change | Missing | Notes |
|---|---|---|---|---|
| Hindi (Riverside) and Tamil (Apex): nothing left in English, nothing clipped, wording reads naturally | | | | |
| Formats per institution (dates, numbers, currency, time zone) | | | | |
| Offline: app opens, cached screens, "Needs a connection" screens | | | | |
| Offline save → sign-out blocked → syncs when back online | | | | |
| Install the app; update notice | | | | |
| Keyboard only: every screen usable, focus visible | | | | |

## Anything else

| Topic | Note |
|---|---|
| Wording / tone | |
| Things to remove | |
| Things missing for Stage 2 | |
| Overall: ready to freeze Stage 1? (yes / after changes) | |

## Freeze outcome (NEX-022, 2026-11-20)
Owner: "all good" — every row accepted as **Works**; no change requests. Carried items:

| Item | Outcome |
|---|---|
| Hindi / Tamil wording (machine-drafted, NEX-040) | Owner action: native-speaker review before real users; fixes go through M04 text overrides or a text task |
| Per-screen "last synced" on L1 screens (NEX-021 finding, ARCHITECTURE §5) | Fix task **NEX-041** |
| Everything else | Frozen as built (D43); backend build step NEX-042–065 |
