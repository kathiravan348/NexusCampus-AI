# API

> State as of: 2026-11-21 (Stage 2 prototype: mock Nexus Control API, NEX-070. Stage 1 build — real backend: sign-in, `GET /me` (NEX-045), M01 (NEX-047), M02 users & access (NEX-048) with SSO + SCIM (NEX-049), M83 `GET /vault/keys` (NEX-050), M83 provider access (NEX-051), M06 audit & privacy (NEX-052), M03 theme + fonts (NEX-053), M04 texts (NEX-054), M05 plan & usage (NEX-055), M07 notifications + outbox worker (NEX-056), M10 sync (NEX-057), M11 Assist via the AI gateway (NEX-058); the rest is still the MSW mock API under `/api/v1`)

In prototype mode (`VITE_DATA_MODE=mock`), MSW serves `/api/v1/*` using request headers `X-Nexus-Tenant`, `X-Nexus-User`, and optional `X-Nexus-Scenario` (`empty`, `error`, `slow`, `offline`). Lists return `{ items, total, page, pageSize }` (D15); errors return `{ error: { code, message, details? } }`.

## Real backend: sign-in and sessions (NEX-045, D44)

The real API (`backend/`) knows the caller only from the **session cookie** `nexus_session` (HttpOnly, Secure,
SameSite=Lax); the tenant is never taken from a header. Unsafe methods (POST, PUT, PATCH, DELETE) must send the
`nexus_csrf` cookie's value in `X-CSRF-Token`. Sessions end after 30 idle minutes or 12 hours. Every signed-in endpoint answers `403 module_disabled` when its
module is off for the tenant, then `403 forbidden` without the permission (deny by default, NEX-046).

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/auth/login` | Public | `?returnTo=/path` (same-app paths only) → `302` to Keycloak (code + PKCE S256, state, nonce) | `503 internal` if Keycloak is unreachable |
| `GET /api/v1/auth/callback` | Public (Keycloak redirect) | `?code=&state=` → `302` to the app at `returnTo`; sets `nexus_session`, `nexus_csrf`, `nexus_device` | `400 invalid_request` (unknown or reused state), `401 unauthorized` (token, nonce), `403 forbidden` (no account, not active, no single organization), `503 internal` (tenant of another region); audits `m02.user.signedIn` |
| `POST /api/v1/auth/logout` | Signed in + CSRF | — → `{ logoutUrl }` (Keycloak end-session page, or null); clears cookies, revokes the session | `401`, `403`; audits `m02.user.signedOut` |
| `GET /api/v1/me` | Signed in | — → `{ user, person, roleProfiles, assignments, permissions }`; `permissions` = codes in force today (NEX-046) | `401`, `403 module_disabled` |

## Institution setup (M01) — real backend (NEX-047) and mock

In the real backend, reads need M01 switched on (any signed-in user); writes need `m01.institution.manage`.
`GET /demo-tenants` exists only in the mock.

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

## SCIM 2.0 — real backend only (NEX-049)

`/scim/v2/Users` for an institution's directory. Auth: `Authorization: Bearer <token>` issued by
`uv run --project backend nexus-scim-token <tenantId>` (shown once; stored as a hash). Needs M02 on and an enabled SSO
provider with `scimEnabled`. Errors use the SCIM error schema.

| Method & path | Input / Output | Errors & audit |
|---|---|---|
| `GET /scim/v2/Users` | `?filter=userName eq "…"&startIndex=&count=` (≤ 200) → `ListResponse` | `400 invalidFilter`, `401`, `403`|
| `GET /scim/v2/Users/:id` | → `User` (`userName` = email, `active` = status active) | `401`, `403`, `404` |
| `POST /scim/v2/Users` | `{ userName, name?, active? }` → `201 User` (status `invited`, SSO only) | `400 invalidValue`, `409 uniqueness`; audits `m02.scim.userProvisioned` |
| `PATCH /scim/v2/Users/:id` | PatchOp `replace` of `active` only | `400 invalidPath`; audits `m02.scim.userUpdated` / `m02.scim.userDeactivated` |
| `DELETE /scim/v2/Users/:id` | → `204` (suspends; records stay) | `404`; audits `m02.scim.userDeactivated` |

## Users & access (M02) — real backend (NEX-048, NEX-049) and mock

Saving an SSO provider also creates or updates a Keycloak identity provider `<tenant>-<providerId>` linked to the
institution's organization (no client secret until the vault, NEX-050; it stays disabled in Keycloak until then).

In the real backend, invite also creates the Keycloak account (in the institution's organization) and status
changes enable or disable it; a Keycloak failure rolls the change back (`503 internal`). Suspending a user also
revokes their sessions.

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

## Plan & usage (M05)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/plan` | `m05.plan.read` | — → `Plan` | `401`, `403`, `404` |
| `GET /api/v1/entitlements` | Authenticated | `?page=&pageSize=` → `Page<Entitlement>` (drives the menu) | `400`, `401` |
| `GET /api/v1/usage` | `m05.plan.read` | `?page=&pageSize=` → `Page<UsageMeter>` | `400`, `401`, `403` |
| `PATCH /api/v1/entitlements/:moduleId` | `m05.module.manage` | `{ enabled }` → `Entitlement` | `400`, `401`, `403`, `403 module_disabled` (not in plan), `409 conflict` (core module); audits `m05.module.enabled` / `m05.module.disabled` |

Backend notes (NEX-055): a switch applies to the next request (guards read `entitlements`; no cache). Usage shows
the tenant's latest stored period: learners and staff are counted live from role profiles, the learner and AI
credit limits come from the plan, other counters are stored (`usage_meters`). Plans are read-only here.

## Theme studio (M03)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/theme` | Authenticated | `?campusId=` → `{ effective, layers, lockedTokens }` | `401`, `403 module_disabled`, `404` |
| `PUT /api/v1/theme` | `m03.theme.manage` | `?institutionId=` + `ThemeUpdateInput` → `{ effective, layers, lockedTokens }` (bumps `version`) | `400 invalid_request` (bad schema, unknown token/font, WCAG contrast failures with `details`), `401`, `403`, `404`, `409 conflict` (locked group tokens with `details`); audits `m03.theme.updated` |
| `GET /api/v1/fonts` | Authenticated | `?page=&pageSize=` → `Page<Font>` | `400`, `401`, `403 module_disabled` |

Backend notes (NEX-053): `PUT /theme` checks in the mock's order — institution and its layer (`404`), body (`400`),
unknown colour / radius tokens and font ids (`400`), group-locked tokens (`409`), then the WCAG 2.2 AA contrast
guard on the merged theme (`400`, one detail per failing pair: `light.on-brand` — "on-brand on brand-primary is
1.53:1 (needs 4.5:1)"). The guard is `m03/contrast.py`, the same maths and pairs as `@nexus/ui-core/contrast`
(tokens and sample results exported to `m03/design_tokens.json`; parity test). Fonts are listed by family.

## Text & language studio (M04)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/texts/overrides` | Authenticated | `?locale=&page=&pageSize=` → `Page<TextOverride>` | `400`, `401`, `403 module_disabled` |
| `GET /api/v1/texts/revisions` | `m04.text.manage` | `?key=&locale=&page=&pageSize=` → `Page<TextOverrideRevision>` | `400`, `401`, `403` |
| `PUT /api/v1/texts/overrides/:key` | `m04.text.manage` | `?locale=` + `{ message }` → `TextOverride` (bumps `version`) | `400 invalid_request` (unknown key, bad locale, invalid ICU with `details`), `401`, `403`, `409 conflict` (group-locked); audits `m04.text.updated` |
| `DELETE /api/v1/texts/overrides/:key` | `m04.text.manage` | `?locale=` → `{ deleted: true, key, locale, version }` | `400`, `401`, `403`, `404`, `409 conflict` (group-locked); audits `m04.text.deleted` |
| `POST /api/v1/texts/overrides/import` | `m04.text.manage` | `{ locale, entries, dryRun? }` → `{ dryRun, locale, added, changed, unchanged, rejected, appliedCount }` | `400 invalid_request` (when `dryRun: false` and any entry is invalid/locked, with `details`), `401`, `403`; audits `m04.text.imported` |
| `POST /api/v1/texts/overrides/:key/rollback` | `m04.text.manage` | `?locale=` + `{ version }` → `{ override, revision }` | `400`, `401`, `403`, `404`, `409 conflict` (group-locked); audits `m04.text.rolledBack` |
| `GET /api/v1/texts/bundle` | Authenticated | `?locale=` (required) → `{ locale, etag, group, institutions, campuses }` (active overrides only, per layer: key → message; `ETag` header, `Cache-Control: private, no-cache`) | `304` (matching `If-None-Match`), `400` (missing / bad locale), `401`, `403 module_disabled` |

Backend notes (NEX-054): messages are checked by `m04/icu.py` (formatjs rules, parity-tested); known keys come from
`m04/message_keys.json` (exported from `messages/en.json`). The studio edits the tenant's first institution layer;
deleting keeps the row (`deleted_at`) so versions continue; rollback to a `null` revision deletes again.

## Audit & privacy (M06)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/audit-events` | `m06.audit.read` | `?action=&actorId=&grantId=&from=&to=&page=&pageSize=` (UTC instants, inclusive) → `Page<AuditEvent>` (field names only) | `400 invalid_request` (bad dates), `401`, `403` |
| `GET /api/v1/audit-checkpoints` | `m06.audit.read` | `?page=&pageSize=` → `Page<AuditCheckpoint>` `{ id, tenantId, day, headSeq, headHash, signature, keyName, signedAt }`, newest first (backend-only, no UI contract) | `400`, `401`, `403` |
| `GET /api/v1/audit-checkpoints/verify` | `m06.audit.read` | → `{ ok, checkedEvents, brokenAt, checkpoints: [{ id, day, headSeq, signatureValid, headMatches }] }`: recomputes the whole chain and checks each checkpoint's Vault signature and signed head | `401`, `403`, `503` (Vault unreachable) |
| `GET /api/v1/consents` | `m06.consent.manage` (all with `m02.user.read`, else own family) | `?page=&pageSize=` → `Page<Consent>` | `400`, `401`, `403` |
| `GET /api/v1/data-requests` | `m06.request.manage` | `?page=&pageSize=` → `Page<DataSubjectRequest>` | `400`, `401`, `403` |
| `PATCH /api/v1/data-requests/:id` | `m06.request.manage` | `{ status, reason? }` → `DataSubjectRequest` (received → in_progress → completed \| rejected; `reason` required to reject, never stored in audit) | `400 invalid_request` (missing reason), `401`, `403`, `404`, `409 conflict` (step not allowed); audits `m06.dataRequest.started` / `.completed` / `.rejected` on the hash chain |
| `GET /api/v1/compliance-packs` | `m06.audit.read` | `?page=&pageSize=` → `Page<CompliancePack>` | `400`, `401`, `403` |

Backend notes (NEX-052): the audit log is returned in chain order (`seq`), so a page can be chain-checked in the
browser; each read of it is itself audited (`m06.auditLog.viewed`, after the page is read). A rejection reason is
kept on the request (`rejection_reason`, not in the contract) and never written to the audit log. Due dates use the
strictest `dsrDueDays` of the tenant's packs (30 days if none); the overdue badge = still open after `dueAt`.

Signed checkpoints (NEX-065, ARCHITECTURE §6): once a UTC day the worker (`nexus-worker`, or `nexus-checkpoints` by
hand) signs each tenant's chain head with the Ed25519 Transit key `nexus-audit-checkpoints` (never exported). Signed
text: `nexus-audit-checkpoint|v1|<tenantId>|<day>|<headSeq>|<headHash>`. A chain segment that does not verify is never
signed (logged, `refused`). Each signing is audited as `m06.auditCheckpoint.signed` (system actor). Verification
catches an edited row (chain), a rewritten chain (signed head) and an edited checkpoint (signature).

## Sync centre (M10)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/devices` | `m10.device.read` (all with `m10.device.wipe`, else own) | `?page=&pageSize=` → `Page<DeviceSync>` | `400`, `401`, `403` |
| `GET /api/v1/sync-conflicts` | `m10.device.read` (for the visible devices) | `?page=&pageSize=` → `Page<SyncConflict>` (no payloads) | `400`, `401`, `403` |
| `POST /api/v1/devices/:id/revoke` | `m10.device.wipe` | `{}` → `DeviceSync` (`revoke_pending`; pending writes counted as lost) | `401`, `403`, `404`, `409 conflict` (not active); audits `m10.device.revokeRequested` |
| `POST /api/v1/devices` | `m10.device.read` | `{ label, platform }` → `201 DeviceSync` (the caller's device) | `400`, `401`, `403`; audits `m10.device.registered` |
| `POST /api/v1/devices/:id/heartbeat` | `m10.device.read` (own device) | `{ pendingCount }` → `{ action: sync \| wipe, device }` (`wipe` once after a revoke; the device becomes `revoked`) | `400`, `401` (revoked device), `403`, `404`; audits `m10.device.wiped` |
| `POST /api/v1/sync-conflicts/:id/resolve` | `m10.device.wipe` | `{ resolution: keep_server \| keep_client \| merged }` → `SyncConflict` (device `conflictCount` − 1) | `400` (missing resolution), `401`, `403`, `404`, `409 conflict` (already resolved); audits `m10.conflict.resolved` |

Backend notes (NEX-057): revoke accepts `{ confirmOwnDevice }`; when `X-Device-Id` names the device being revoked
it must be `true` (the screen's second confirmation), else `409`. **Every** guarded write accepts
`Idempotency-Key` (1–128 printable characters): the first request is applied, replays with the same request get the
stored response (header `Idempotent-Replay: true`), the same key with another request or while the first still runs
→ `409 conflict`; a refused write frees its key; keys live 24 h. Guards commit their transaction before the response
is sent (`Depends(…, scope="function")`).

## Nexus Assist (M11)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/ai/settings` | `m11.assist.use` or `m11.settings.manage` | — → `AiSettings` (no keys) | `401`, `403`, `404` |
| `GET /api/v1/ai/credits` | `m11.settings.manage` | `?page=&pageSize=` → `Page<AiCredit>` | `400`, `401`, `403` |
| `POST /api/v1/assist/ask` | `m11.assist.use` | `{ question, locale }` → `{ answer: AssistAnswer \| null, credits }` (mock fixture answer, always with sources; decrements credits and the `ai_credits` meter) | `403 module_disabled` (not entitled), `403 forbidden` with `details[0].path` `ai_off` or `consent` (minor without guardian consent), `429 rate_limited` path `credits`, `400`, `401` |
| `PUT /api/v1/ai/settings` | `m11.settings.manage` | `{ enabled, modules, safeguardingEnabled, defaultTier }` → `AiSettings` | `400 invalid_request` (`modules.M61` / `modules.M83` can never be on), `401`, `403`; audits `m11.settings.updated` |

Backend notes (NEX-058): `POST /assist/ask` runs the gateway pipeline: AI on (`ai_off`) → minor guardian consent
(`consent`) → credits (`429 credits`) → retrieval in the tenant's own pgvector chunks (modules switched on and
entitled; never M61 / M83; M62 only with safeguarding) → **no source = `answer: null`, no model call, no credit** →
PII redaction (names, e-mails, phones) → Claude by the tenant's tier → names restored, sources cited → credits and
the `ai_credits` meter charged together (cost fast 1 / balanced 2 / reasoning 5, capped by what is left). A refused
answer returns `answer: null` uncharged. The log keeps metadata only. Provider: `NEXUS_AI_PROVIDER` = `fake`
(default, tests) / `anthropic` (direct, dev key) / `bedrock` (cell region).

## Data vault & access (M83)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/vault/keys` · `/access-requests` · `/access-grants` · `/break-glass-notices` | `m83.vault.read` | `?page=&pageSize=` → `Page<KeyStatus>` · `Page<AccessRequest>` · `Page<AccessGrant>` · `Page<BreakGlassNotice>` (metadata only, never key material) | `400`, `401`, `403` |
| `POST /api/v1/access-requests/:id/approve` | `m83.grant.approve` | `{ modules, mode, durationHours }` (equal or narrower) → `{ request, grant }` (grant ends ≤ 72 h after now) | `400 invalid_request` (widening), `401`, `403`, `404`, `409 conflict` (not pending); audits `m83.accessRequest.approved` |
| `POST /api/v1/access-requests/:id/deny` | `m83.grant.approve` | `{ reason }` → `AccessRequest` (`denied`; reason not stored, only audited as a field name) | `400` (no reason), `401`, `403`, `404`, `409`; audits `m83.accessRequest.denied` |
| `POST /api/v1/access-grants/:id/revoke` | `m83.grant.approve` | `{}` → `AccessGrant` (`revokedAt` set; request → `revoked`) | `401`, `403`, `404`, `409 conflict` (ended or revoked); audits `m83.accessGrant.revoked` |

Grant history uses `GET /api/v1/audit-events?grantId=` (M06).

**Provider grant credentials (NEX-051, ARCHITECTURE §10).** Provider staff never hold standing access. With an
approved, active grant they call tenant endpoints with `Authorization: Bearer ngc1.<tenant>.<grant>.<staff>.<exp>.<sig>`
(HMAC-signed, valid ≤ 60 min and never past the grant's end; key `NEXUS_GRANT_SIGNING_KEY`). Every `require` guard
reloads the grant on each request: outside its window, after a revoke, for a module it does not list, or a non-GET
on a `read` grant → `403 forbidden`; a forged or expired credential → `401`. A grant holds the non-sensitive
permissions of its modules tenant-wide; sensitive ones (`m02.person.read_restricted`, `m06.request.manage`,
`m83.grant.approve`) never. Each attempt is audited as `m83.accessGrant.used` / `.refused`, and every write made on a
grant is recorded with `actorKind = provider_grant` and its `grantId`. An approved request whose grant ran out reads
as `expired`.

Dev-only access broker stub (not mounted in `prod`; replaced by P10 in Stage 2; no staff sign-in):

| Method & path | Input / Output | Errors |
|---|---|---|
| `POST /api/v1/dev/broker/tenants/:tenantId/access-requests` | `{ staffRef, staffDisplayName, reason, modules, mode, durationHours }` → `201 AccessRequest` (`pending`); audits `m83.accessRequest.filed` | `400`, `401` (unknown tenant), `503` (other region) |
| `POST /api/v1/dev/broker/tenants/:tenantId/access-grants/:id/credential` | `{ staffRef }` → `{ credential, expiresAt }` | `400`, `404` (unknown or another staff member's), `409 conflict` (grant not active) |

## Notifications (M07)

| Method & path | Permission | Input / Output | Errors & audit |
|---|---|---|---|
| `GET /api/v1/notification-templates` | `m07.template.manage` | `?page=&pageSize=` → `Page<NotificationTemplate>` | `400`, `401`, `403` |
| `PUT /api/v1/notification-templates/:id` | `m07.template.manage` | `{ subject, body, enabled }` → `NotificationTemplate` (version + 1) | `400 invalid_request` (invalid ICU), `401`, `403`, `404`; audits `m07.template.updated` |
| `POST /api/v1/notification-templates` | `m07.template.manage` | `{ eventType, channel, locale, subject, body, enabled }` → `201 NotificationTemplate` | `400` (invalid ICU), `401`, `403`, `409 conflict` (event + channel + locale exists); audits `m07.template.created` |
| `GET /api/v1/notification-deliveries` | `m07.template.manage` | `?status=&channel=&page=&pageSize=` → `Page<NotificationDelivery>` (newest first) | `400`, `401`, `403` |
| `GET /api/v1/notification-preferences` | `m07.preference.manage` | — → `{ preferences, channels: [{ channel, available }] }` (prototype-only shape: `available` = the institution has templates for that channel; push needs a provider) | `401`, `403` |
| `PUT /api/v1/notification-preferences` | `m07.preference.manage` (own only) | `{ channels: [{ channel, enabled }], quietHours }` → same as GET; accepts `Idempotency-Key` (outbox replay) | `400` (equal quiet-hour times), `401`, `403`; audits `m07.preference.updated` |

Backend notes (NEX-056): `PUT /notification-preferences` with `Idempotency-Key` stores the first answer; a replay
with the same key and body returns it unchanged (no second audit), the same key with another body → `409 conflict`.
Events that notify carry `payload.recipientPersonIds` and `payload.values` (`payload.urgent: true` ignores quiet
hours). `nexus-worker` picks the template locale (person → institution default → English), applies the recipient's
preference and quiet hours (`suppressed` with a reason), renders ICU and records one delivery per event + person +
channel. Stage 1 channels only log (`LogChannel`); push has no provider and fails.

## Nexus Control — mock API (Stage 2 prototype, NEX-070, D50)

**Mock only until the Stage 2 build step** (the control backend has its own database and staff SSO, D21). MSW serves
`/control/api/v1/*` for `apps/control`. The caller is the header `X-Nexus-Staff` (a staff id; unknown, inactive or
not MFA-enrolled → `401 unauthorized`); `X-Nexus-Scenario` works as above. Each route needs one `ctl.<area>.<action>`
permission from the staff member's roles (`403 forbidden` otherwise). **Partner users** see only rows of the
accounts their partner manages (others → `404 not_found`). Everything is metadata only (V-7).

| Method | Path | Permission | Filters (`?field=value`) |
|---|---|---|---|
| GET | `/me` | — | → `StaffSession` |
| GET | `/accounts`, `/accounts/:id` | `ctl.account.read` | stage, deliveryModel, partnerId, region |
| GET | `/contacts`, `/notes` | `ctl.account.read` | accountId (+ kind) |
| GET | `/opportunities[/:id]`, `/contracts[/:id]` | `ctl.account.read` | accountId, stage / kind, status |
| GET | `/catalogue[/:id]`, `/quotes[/:id]` | `ctl.quote.read` | kind / accountId, status |
| GET | `/subscriptions[/:id]`, `/invoices[/:id]` | `ctl.billing.read` | accountId, status |
| GET | `/payments`, `/credit-notes`, `/dunning[/:accountId]` | `ctl.billing.read` | invoiceId, status / stage |
| GET | `/usage` | `ctl.usage.read` | accountId, metric, tenantId, deploymentId |
| GET | `/partners[/:id]`, `/commissions` | `ctl.partner.read` | partnerId, status |
| GET | `/deals` | `ctl.deal.read` | partnerId, accountId, status |
| GET | `/provisioning-jobs[/:id]`, `/offboarding-jobs[/:id]`, `/shred-certificates[/:id]` | `ctl.provisioning.read` | status, accountId, tenantId |
| GET | `/licences[/:id]` | `ctl.licence.read` | accountId, state, edition |
| GET | `/deployments[/:id]`, `/health-signals[/:deploymentId]` | `ctl.fleet.read` | kind, region, accountId, health, channel |
| GET | `/releases[/:id]`, `/rollouts` | `ctl.release.read` | channel, status / releaseId |
| GET | `/extensions[/:id]`, `/extension-compatibility` | `ctl.extension.read` | accountId / extensionId, releaseVersion, result |
| GET | `/sandboxes[/:id]` | `ctl.sandbox.read` | kind, status, accountId |
| GET | `/portability-jobs[/:id]` | `ctl.portability.read` | accountId, status, direction |
| GET | `/tickets[/:id]`, `/ticket-replies`, `/sla-policies[/:slaTier]`, `/kb-articles[/:id]` | `ctl.ticket.read` | accountId, status, priority, assigneeStaffId / ticketId / locale |
| GET | `/broker-requests[/:id]`, `/broker-sessions`, `/break-glass-cases[/:id]` | `ctl.broker.read` | accountId, status, ticketId / requestId |
| GET | `/staff[/:id]` | `ctl.staff.read` | — |
| GET | `/staff-directory` | any signed-in staff | — (id + display name only, NEX-072) |
| POST | `/notes` | `ctl.account.manage` | body `{ accountId, body }` (1–2000 chars) → `201 AccountNote`; unknown or not-visible account → `404`; bad body → `400 invalid_request` (NEX-072) |
| GET | `/sub-processors`, `/certifications`, `/incidents[/:id]`, `/dpas` | `ctl.trust.read` | status, severity / accountId |
| GET | `/projects[/:id]` | `ctl.project.read` | accountId, status, kind |
| GET | `/metrics[/:month]`, `/account-health[/:accountId]` | `ctl.analytics.read` | churnRisk |

| POST | `/quotes/:id/send` | `ctl.quote.manage` | body `{ checkedByHuman? }`; only `draft` (else `409 conflict`); an AI-drafted quote without `checkedByHuman: true` → `400 invalid_request`; partners only their accounts (`404`) (NEX-073) |

| POST | `/invoices/:id/record-transfer` | `ctl.billing.manage` | body `{ reference }` (3–64 chars, our statement reference); only `open` / `overdue` (else `409`); → `{ invoice, payment }`: invoice paid, `manual` payment added, dunning cleared, past-due subscription active (NEX-074) |

| POST | `/provisioning-jobs` | `ctl.provisioning.manage` | body `ProvisioningRequest` (account visible and not self-hosted, else `404` / `409`) → `201` job, all steps `pending` (NEX-075) |
| POST | `/provisioning-jobs/:id/advance` | `ctl.provisioning.manage` | demo: completes the next step; `create_tenant` assigns a tenant id and adds it to the account; finished job → `409` (NEX-075) |

| GET | `/licence-files/:licenceId` | `ctl.licence.issue` | the signed licence file (`nexus-licence/1`, mock signature) for offline activation; no internal fields (NEX-076) |
| POST | `/licences/:id/renew` | `ctl.licence.issue` | term: expiry + support end +1 year; perpetual: support end +1 year; new fingerprint; revoked → `409` (NEX-076) |

| POST | `/releases/:id/publish` | `ctl.release.manage` | body `{ notesReviewed? }`; draft only (`409`); AI-drafted notes without `notesReviewed: true` → `400`; signs and publishes (NEX-078) |
| POST | `/rollouts/:id/start` | `ctl.release.manage` | pending ring of a published release whose earlier rings are done (else `409`); marks it done and moves its deployments to the release version (NEX-078) |

| POST | `/tickets/:id/replies` | `ctl.ticket.reply` | body `{ body (1–5000), internal }` → `201 TicketReply`; closed ticket → `409`; assigns an unassigned ticket to the replier; a public reply sets `waiting_customer`, an internal note opens a new ticket (NEX-080) |

Write routes are added by each Control screen task (NEX-072+).
