# API

> State as of: 2026-11-19 (Stage 1 prototype — MSW mock API under `/api/v1`; M01, M02, M03, and M04 write endpoints landed)

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

## Users & access (M02)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/me` | Authenticated | — → `{ user, person, roleProfiles, assignments, permissions }` | `401`, `403 module_disabled` |
| `GET /api/v1/people` | Authenticated (all with `m02.user.read`, else self + linked learners) | `?page=&pageSize=` → `Page<Person>` (minors masked, G-6) | `400`, `401`, `403` |
| `GET /api/v1/users` | `m02.user.read` | `?page=&pageSize=` → `Page<User>` | `400`, `401`, `403` |
| `GET /api/v1/roles` · `/permissions` · `/role-assignments` | `m02.role.manage` | `?page=&pageSize=` → `Page<Role>` · `Page<Permission>` · `Page<RoleAssignment>` | `400`, `401`, `403` |
| `GET /api/v1/sessions` | Authenticated (all with `m02.user.invite`, else own) | `?page=&pageSize=` → `Page<Session>` | `400`, `401`, `403` |
| `GET /api/v1/sso-providers` | `m02.sso.manage` | `?page=&pageSize=` → `Page<SsoProvider>` | `400`, `401`, `403` |
| `POST /api/v1/users/invite` | `m02.user.invite` | `{ legalName, email, roleId, scope }` → `201 User` (`invited`; creates person + assignment) | `400 invalid_request` (scope kind not allowed by role, unknown scope target), `401`, `403`, `404` (role), `409 conflict` (email has an account); audits `m02.user.invited` |
| `PUT /api/v1/users/:id/status` | `m02.user.invite` | `{ status: active \| suspended }` → `User` | `400`, `401`, `403`, `404`, `409 conflict` (own account); audits `m02.user.suspended` / `m02.user.reactivated` |
| `POST /api/v1/roles` | `m02.role.manage` | `{ name, permissions, allowedScopeKinds }` → `201 Role` (custom) | `400`, `401`, `403`; audits `m02.role.created` |
| `PUT /api/v1/roles/:id` | `m02.role.manage` | `{ name, permissions, allowedScopeKinds }` → `Role` | `400`, `401`, `403`, `404`, `409 conflict` (system role); audits `m02.role.updated` |
| `POST /api/v1/role-assignments` | `m02.role.manage` | `{ userId, roleId, scope, effectiveFrom, effectiveTo }` → `201 RoleAssignment` | `400 invalid_request` (scope kind not in role's `allowedScopeKinds`, bad dates), `401`, `403`, `404`; audits `m02.role.assigned` |
| `DELETE /api/v1/role-assignments/:id` | `m02.role.manage` | — → `204` | `401`, `403`, `404`, `409 conflict` (your own last admin role); audits `m02.role.unassigned` |
| `DELETE /api/v1/sessions/:id` | Own session, or `m02.user.invite` | — → `Session` (with `revokedAt`) | `401`, `403`, `404`; audits `m02.session.revoked` |
| `POST /api/v1/sso-providers` · `PUT /api/v1/sso-providers/:id` | `m02.sso.manage` | `{ institutionId, protocol, name, issuerUrl (https), clientId, domains, scimEnabled, enabled }` → `201` / `200 SsoProvider` (no secrets) | `400 invalid_request` (non-https issuer, bad domain), `401`, `403`, `404`; audits `m02.sso.created` / `m02.sso.updated` |

## Theme studio (M03)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/theme` | Authenticated | `?campusId=` → `{ effective, layers, lockedTokens }` | `401`, `403 module_disabled`, `404` |
| `PUT /api/v1/theme` | `m03.theme.manage` | `?institutionId=` + `ThemeUpdateInput` → `{ effective, layers, lockedTokens }` (bumps `version`) | `400 invalid_request` (bad schema, unknown token/font, WCAG contrast failures with `details`), `401`, `403`, `404`, `409 conflict` (locked group tokens with `details`); audits `m03.theme.updated` |
| `GET /api/v1/fonts` | Authenticated | `?page=&pageSize=` → `Page<Font>` | `400`, `401`, `403 module_disabled` |

## Text & language studio (M04)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/texts/overrides` | Authenticated | `?locale=&page=&pageSize=` → `Page<TextOverride>` | `400`, `401`, `403 module_disabled` |
| `GET /api/v1/texts/revisions` | `m04.text.manage` | `?key=&locale=&page=&pageSize=` → `Page<TextOverrideRevision>` | `400`, `401`, `403` |
| `PUT /api/v1/texts/overrides/:key` | `m04.text.manage` | `?locale=` + `{ message }` → `TextOverride` (bumps `version`) | `400 invalid_request` (unknown key, bad locale, invalid ICU with `details`), `401`, `403`, `409 conflict` (group-locked); audits `m04.text.updated` |
| `DELETE /api/v1/texts/overrides/:key` | `m04.text.manage` | `?locale=` → `{ deleted: true, key, locale, version }` | `400`, `401`, `403`, `404`, `409 conflict` (group-locked); audits `m04.text.deleted` |
| `POST /api/v1/texts/overrides/import` | `m04.text.manage` | `{ locale, entries, dryRun? }` → `{ dryRun, locale, added, changed, unchanged, rejected, appliedCount }` | `400 invalid_request` (when `dryRun: false` and any entry is invalid/locked, with `details`), `401`, `403`; audits `m04.text.imported` |
| `POST /api/v1/texts/overrides/:key/rollback` | `m04.text.manage` | `?locale=` + `{ version }` → `{ override, revision }` | `400`, `401`, `403`, `404`, `409 conflict` (group-locked); audits `m04.text.rolledBack` |
