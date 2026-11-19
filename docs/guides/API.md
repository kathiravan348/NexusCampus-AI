# API

> State as of: 2026-11-19 (Stage 1 prototype — MSW mock API under `/api/v1`; M01 and M03 write endpoints landed)

In prototype mode (`VITE_DATA_MODE=mock`), MSW serves `/api/v1/*` using request headers `X-Nexus-Tenant`, `X-Nexus-User`, and optional `X-Nexus-Scenario` (`empty`, `error`, `slow`, `offline`). Lists return `{ items, total, page, pageSize }` (D15); errors return `{ error: { code, message, details? } }`.

## Institution setup (M01)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/demo-tenants` | Public (mock only) | — → `DemoTenantEntry[]` | — |
| `GET /api/v1/tenant` | Authenticated | — → `{ group, institutions, campuses }` | `401`, `403 module_disabled` |
| `GET /api/v1/institutions/:id/profile` | Authenticated | — → `InstitutionTypeProfile` | `401`, `403`, `404` |
| `GET /api/v1/institutions/:id/calendars` | Authenticated | `?page=&pageSize=` → `Page<AcademicCalendar>` | `400`, `401`, `403`, `404` |
| `GET /api/v1/locale-settings` | Authenticated | `?institutionId=` → `LocaleSettings` | `401`, `403`, `404` |
| `PUT /api/v1/locale-settings` | `m01.institution.manage` | `?institutionId=` + `LocaleSettings` → `LocaleSettings` | `400 invalid_request` (with field `details`), `401`, `403`, `404`; audits `m01.institution.updated` |
| `POST /api/v1/campuses` | `m01.institution.manage` | `CampusInput` → `201 Campus` | `400 invalid_request` (incl. duplicate `code`), `401`, `403`, `404`; audits `m01.campus.created` |
| `PUT /api/v1/campuses/:id` | `m01.institution.manage` | `CampusInput` → `200 Campus` | `400 invalid_request`, `401`, `403`, `404`; audits `m01.campus.updated` |
| `PUT /api/v1/institutions/:id/calendars/:calendarId` | `m01.institution.manage` | `CalendarInput` → `200 AcademicCalendar` | `400 invalid_request` (overlaps, out-of-range dates), `401`, `403`, `404`; audits `m01.calendar.updated` |

## Theme studio (M03)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/theme` | Authenticated | `?campusId=` → `{ effective, layers, lockedTokens }` | `401`, `403 module_disabled`, `404` |
| `PUT /api/v1/theme` | `m03.theme.manage` | `?institutionId=` + `ThemeUpdateInput` → `{ effective, layers, lockedTokens }` (bumps `version`) | `400 invalid_request` (bad schema, unknown token/font, WCAG contrast failures with `details`), `401`, `403`, `404`, `409 conflict` (locked group tokens with `details`); audits `m03.theme.updated` |
| `GET /api/v1/fonts` | Authenticated | `?page=&pageSize=` → `Page<Font>` | `400`, `401`, `403 module_disabled` |
