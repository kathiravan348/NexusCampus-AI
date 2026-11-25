# API

> State as of: 2026-11-25 (Stage 3 build — M12 staff admissions on the real backend (NEX-185), M14 families on the real backend (NEX-202), M13 learner records on the real backend (NEX-184), M08 configuration on the real backend (NEX-200), M15 academic structure on the real backend (NEX-183); M12 public admissions enquiry mock routes `GET /api/v1/public/enquiry-forms/:formId`, `POST /api/v1/public/enquiry-forms/:formId/enquiries`, `GET /api/v1/enquiry-forms` (NEX-186); Stage 3 prototype — M24 communication replies `POST /api/v1/message-threads/:id/messages` (NEX-173), M23 issued document revocation `POST /api/v1/issued-documents/:id/revoke` (NEX-172), M22 report card status changes (NEX-171), M21 exam seating plans (NEX-170), M20 assessment rosters and mark entry (NEX-169), M19 journal entry posting (NEX-168), M18 manual fee payment recording `POST /api/v1/fee-payments` (NEX-167), M17 attendance rosters and marks (NEX-166), M16 timetable slot creation `POST /api/v1/timetable-slots` (NEX-165), M12 enquiry creation (NEX-164), M08 custom field creation (NEX-161), M09 import job registration `POST /api/v1/import-jobs` (NEX-162), and M15 academic structure mock routes incl. `POST /api/v1/class-groups` (NEX-160). Stage 2 complete through NEX-145: every Nexus Control route P01–P18 on the control backend — no Control route is mock-only in real mode — plus the M84 install agent and diagnostic bundle decision audit events, D60 signed pull-only commands with D63 expiry, P04 provisioning / offboarding, P10 access broker, P18 moves, D66 one open offboarding or move per tenant, D62 Razorpay INR payment links and `NXTE/1` tenant export & import. Stage 1 build — real backend: sign-in, `GET /me` (NEX-045), M01 (NEX-047), M02 users & access (NEX-048) with SSO + SCIM (NEX-049), M83 `GET /vault/keys` (NEX-050), M83 provider access (NEX-051), M06 audit & privacy (NEX-052), M03 theme + fonts (NEX-053), M04 texts (NEX-054), M05 plan & usage (NEX-055), M07 notifications + outbox worker (NEX-056), M10 sync (NEX-057), M11 Assist via the AI gateway (NEX-058))

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
A frozen tenant (`tenants.frozen_at` set via `tenant.freeze`, D61, NEX-133) refuses every API write and background worker write with `423 tenant_frozen` while reads and exports keep working.
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

| POST | `/broker-requests` | `ctl.broker.request` | body `{ accountId, tenantId, ticketId, reason, modules, mode, durationHours (1–72) }`; M83 in scope or bad body → `400`; tenant not of a visible account → `404`; creates the Control row and the institution's M83 `AccessRequest`, both `pending`. Reads (`GET /broker-requests`) show the decision the institution made in M83 (NEX-081) |

Write routes are added by each Control screen task (NEX-072+).

## Install & updates (M84) — real backend on a self-hosted install (NEX-105)

Institution admins (`m01.institution.manage`), only when `NEXUS_INSTALL_MODE=self_hosted` and M84 is on (the install
agent turns it on for every tenant); otherwise `403 module_disabled`. Data comes from `nexus-agent`: versions and
counts, never people.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/install/status` | `InstallStatus`: version, channel, licence summary (verified offline; learners and campuses **counted**), air-gapped, health reports on / off |
| GET | `/api/v1/install/update` | `{ offer }`: the newest verified offline bundle in `inbox/`, or (if none) the online offer verified against pinned `release-keys.json` (NEX-117), or `null` |
| GET | `/api/v1/install/backups` | `BackupJob` page, newest first: every full backup (`backup`, NEX-112) and tenant export (`tenant_export`, NEX-106) is encrypted |
| GET | `/api/v1/install/diagnostics` | `DiagnosticBundle` page: support bundles with personal data removed |
| GET | `/api/v1/install/diagnostics/:id/content` | `{ id, content }` — exactly what would be sent, to read before approving |
| POST | `/api/v1/install/diagnostics/:id/approve`, `…/discard` | Only from `ready_for_review` (`409` otherwise). A successful decision writes an audit event (`m84.diagnosticBundle.approved` or `m84.diagnosticBundle.discarded`) with the reviewing admin, bundle ID and the changed field `status`. Sending is handled separately (NEX-113). |

Outbound health reports (NEX-114): `nexus-agent report` (and each `once` / `loop` run) probes `NEXUS_AGENT_PROBE_URL` (`NEXUS_AGENT_PROBES` GETs, 5 s timeout), measures `install_dir` disk use, running backups + generating diagnostics, and distinct active users in the last 15 min (`nexus_install_active_users`), and POSTs that PII-free payload to `NEXUS_CONTROL_URL/control/api/v1/agent/health` with `Authorization: Bearer <NEXUS_CONTROL_AGENT_TOKEN>` (TLS verified, 10 s timeout). Nothing is sent when `NEXUS_AIR_GAPPED=true`, `NEXUS_TELEMETRY_ENABLED=false`, or no token is set.

Pull-only signed Control commands (D60, NEX-129): `nexus-agent commands` (also run on SaaS cells, and in `nexus-agent loop` after the health report) fetches `GET /control/api/v1/agent/commands` via `control_endpoint` (HTTPS only, loopback HTTP in dev, no redirects, ≤ 64 KB), verifies each `nexus-command/1` signature against `install_dir/command-keys.json`, checks `deploymentId == NEXUS_DEPLOYMENT_ID`, records the command id in `agent_commands` so it never runs twice, executes allowed kinds (`ping` → `{"version": app_version}`; `access_request.file` → files a pending M83 access request and audits `m83.accessRequest.filed`, idempotent on replay, NEX-131; `tenant.provision` → SaaS cells only, runs the 5 idempotent tenant provisioning steps `create_tenant`, `create_keys`, `apply_profile`, `seed`, `invite_owner` and returns `{ tenantId, stepsDone, failedStep?, reason? }`, NEX-127; `tenant.freeze` / `tenant.export` / `tenant.destroy_keys` → SaaS cells only, D61, NEX-133: freezes writes idempotently with `m01.tenant.frozen`, exports a frozen tenant into the cell's local `NXTE/1` export folder for an RSA ≥ 3072 PEM without uploading to Control, and destroys tenant keys only when frozen with a matching on-disk export fingerprint and two distinct `approvedBy` staff ids; `tenant.import_key` / `tenant.import` → SaaS cells or self-hosted installs with commands switched on, D61, NEX-135: returns the destination `tenant-import` public PEM + `pemSha256`, and imports a plain filename from `NEXUS_IMPORT_DIR` (`install_dir/imports`), re-verifies the audit chain and checkpoints, and deletes the file on success), and posts results to `POST /control/api/v1/agent/commands/{id}/result` (`rejected` on bad signature, wrong deployment, or unknown/invalid args). Each run also reports any new M83 decisions (`approved`, `denied`, `expired`, `revoked`) for command-filed requests to `POST /control/api/v1/agent/access-decisions` (ids, statuses and timestamps only — never reason text or modules), tracked in `broker_reports`. Self-hosted installs default to `NEXUS_AGENT_COMMANDS=off`; SaaS cells default to `on`; air-gapped installs or missing keys/token/deployment id make no requests.

Tenant export & import (NEX-106, NEX-119, D58, D59): on the destination install `nexus-agent import-key` ensures the non-exportable RSA-4096 Transit key `tenant-import` exists in OpenBao and prints its public PEM. On the source install `nexus-agent export-tenant <tenant-id> --to <destination.pem>` writes one `NXTE/1` encrypted file (chunked AES-256-GCM under a fresh 256-bit data key wrapped with RSA-OAEP-SHA256 for the destination PEM; refuses non-RSA or `< 3072`-bit keys), decrypts any `FieldCipher` columns inside the encrypted stream, never exports `sessions`, `scim_tokens` or `idempotency_keys` (credentials and caches, D58), records a `tenant_export` job in `install_backups`, and prints counts and sizes only. On the destination install `nexus-agent import-tenant <file.nxte>` validates format, `pemSha256`, schema revision, empty tenant, table allow-list, and platform key custody before loading all rows (except source `audit_checkpoints`) in one owner transaction, commits only after verifying the final chunk and all table counts, creates destination OpenBao keys, re-encrypts `decryptedColumns`, appends `m84.tenant.imported` and signs today's checkpoint (re-verifying the full imported chain), printing counts only.

## Nexus Control — real backend (Stage 2 build, NEX-097, NEX-100, NEX-101)

Base `/control/api/v1` on the control backend (`nexus-control-dev`, port 8100; the Control app reaches it through
`pnpm --dir frontend dev:control:real`). Same shapes, filters and page envelope as the mock above. Every route needs a
staff session: the `nexus_control_session` cookie from staff sign-in (password + one-time code), or — in `dev` and
`test` only — the `X-Nexus-Staff` header. Missing session → `401`; missing permission → `403`. Partner users only
see rows of the accounts their partner manages (others → `404`).

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/health`, `/ready` | — | `ready` checks the control database (`503` when down) |
| GET | `/auth/login?returnTo=/…` | — | redirects to the `nexus-staff` realm with PKCE and `acr_values=mfa` |
| GET | `/auth/callback` | — | refuses `acr` ≠ `mfa`, unverified email, unknown / inactive staff; sets the HttpOnly session cookie (path `/control`, 60 min) |
| POST | `/auth/logout` | — | revokes the session; `{ redirect }` = the sign-in service's sign-out address |
| GET | `/me` | signed in | `StaffSession` |
| GET | `/accounts`, `/accounts/:id` | `ctl.account.read` | filters `stage`, `deliveryModel`, `partnerId`, `region` |
| GET | `/contacts` | `ctl.account.read` | filters `accountId`, `kind` |
| GET | `/opportunities`, `/opportunities/:id` | `ctl.account.read` | filters `accountId`, `stage` |
| GET | `/contracts`, `/contracts/:id` | `ctl.account.read` | filters `accountId`, `kind`, `status` |
| GET | `/notes` | `ctl.account.read` | filter `accountId`; newest first |
| POST | `/notes` | `ctl.account.manage` | body `{ accountId, body (1–2000, trimmed) }` → `201 AccountNote`; account not visible → `404` |
| GET | `/staff-directory` | signed in | `{ id, displayName }` of every staff member |
| GET | `/partners` | `ctl.partner.read` | partner names for the Accounts page |
| GET | `/catalogue`, `/catalogue/:id` | `ctl.quote.read` | filter `kind` (NEX-102) |
| GET | `/quotes`, `/quotes/:id` | `ctl.quote.read` | filters `accountId`, `status` |
| POST | `/quotes/:id/send` | `ctl.quote.manage` | body `{ checkedByHuman? }`; draft only (`409` otherwise); an AI-drafted quote needs `checkedByHuman: true` (`400` with `details[0].path = "checkedByHuman"`) |
| GET | `/subscriptions`, `/subscriptions/:id` | `ctl.billing.read` | filters `accountId`, `status` |
| GET | `/invoices`, `/invoices/:id` | `ctl.billing.read` | filters `accountId`, `status` |
| POST | `/invoices/:id/record-transfer` | `ctl.billing.manage` | body `{ reference (3–64, our statement reference) }`; open or overdue only (`409`); one transaction: `manual` payment with the reference, invoice `paid`, dunning cleared, past-due subscriptions `active` → `{ invoice, payment }` |
| POST | `/invoices/:id/payment-link` | `ctl.billing.manage` | creates or reuses a Razorpay Payment Link (`{ url, expiresAt }`, card/UPI/netbanking only, `accept_partial: false`, billing contact name+email only) for an `open`/`overdue` INR invoice of an Indian account (else `409`; `409` if Razorpay is off; D62, NEX-107) |
| POST | `/billing/lago-webhook` | HMAC signature (`X-Lago-Signature`) | Lago webhook (NEX-111, D51): no staff cookie or dev header; raw body ≤ 256 KB verified in constant time with `NEXUS_CONTROL_LAGO_WEBHOOK_KEY` (empty key or bad signature → `401`, oversize → `413`); deduplicated by raw-body SHA-256 (`200` no-op on replay); `invoice.created` (finalized only, drafts ignored) inserts an `open` `Invoice` (`inv-` + 12 hex, `INV-<year>-<6-digit>`, tax scheme IN → `gst`, EU/GB → `vat`, else `none`; unknown account or mismatched totals → `422`) and best-effort creates a Razorpay payment link for open INR IN invoices; `invoice.payment_status_updated` (`succeeded` → `paid` + `paidAt`; `failed` stays `open`); unknown events → `200` ignored |
| POST | `/billing/razorpay-webhook` | HMAC signature (`X-Razorpay-Signature`) | Razorpay webhook (NEX-107, D62): no staff cookie or dev header; raw body ≤ 256 KB verified in constant time (hex HMAC-SHA256 with `NEXUS_CONTROL_RAZORPAY_WEBHOOK_SECRET`, missing/bad → `401`, oversize → `413`); deduped on `X-Razorpay-Event-Id`; `payment_link.paid` validates link ownership, exact amount and currency (`422` on mismatch), settles invoice + `razorpay` payment + clears dunning + activates past-due subs, then notifies Lago (`mark_paid`; retries via `billing_sync` on failure); `payment_link.expired` marks the link expired; other events `200` ignored |
| GET | `/payments` | `ctl.billing.read` | filters `invoiceId`, `status` |
| GET | `/credit-notes` | `ctl.billing.read` | filter `invoiceId` |
| GET | `/dunning`, `/dunning/:accountId` | `ctl.billing.read` | filter `stage` |
| GET | `/usage` | `ctl.usage.read` | filters `accountId`, `metric`, `tenantId`, `deploymentId`; counts only |
| GET | `/licences`, `/licences/:id` | `ctl.licence.read` | filters `accountId`, `state`, `edition` (NEX-103) |
| GET | `/licence-files/:id` | `ctl.licence.issue` | the `nexus-licence/1` file, **really signed** (Ed25519 in OpenBao Transit, key `nexus-licence`); `signingKeyId` = `nexus-licence:v<N>`; a licence without a signed file is signed on first download; installs verify it offline with the public key |
| POST | `/licences/:id/renew` | `ctl.licence.issue` | expiry and support end + 1 year (a perpetual licence stays perpetual), state `active`, new signed file and fingerprint in one transaction; revoked → `409` |
| GET | `/deployments`, `/deployments/:id` | `ctl.fleet.read` | filters `kind`, `region`, `accountId`, `health`, `channel` (NEX-113) |
| GET | `/health-signals`, `/health-signals/:deploymentId` | `ctl.fleet.read` | filter `deploymentId`; latest check-in only; not shown to partner users |
| POST | `/agent/health` | agent bearer token | `Authorization: Bearer <token>` issued by `nexus-control-agent-token` (SHA-256 stored; no staff cookie, no CSRF); body = `HealthSignal` without `deploymentId` (strict, ≤ 4 KB); `204` upserts signal and updates deployment `version`, `lastCheckInAt` (server time), `telemetryEnabled` and derived `health` (`degraded` if uptime < 99%, error rate ≥ 2%, p95 latency ≥ 1500 ms or disk ≥ 90%, else `healthy`); unknown/revoked token `401`, air-gapped `403`, > 4 KB `413`, invalid/extra field `422`, > 1 per 60 s `429` |
| GET | `/releases`, `/releases/:id` | `ctl.release.read` | filters `channel`, `status`; not shown to partner users (NEX-115) |
| POST | `/releases/:id/publish` | `ctl.release.manage` | body `{ notesReviewed? }`; draft only (`409`); AI-drafted notes without `notesReviewed: true` → `422`; requires stored `signed_manifest` verified against OpenBao `nexus-release` public keys matching version & channel (else `409`) → `Release` (NEX-130) |
| GET | `/rollouts` | `ctl.release.read` | filters `releaseId`, `status`; not shown to partner users |
| POST | `/rollouts/:id/start` | `ctl.release.manage` | no body; published release + `pending` ring + every earlier ring `done` (else `409`) → `Rollout` (`running`, `startedAt` set; real installs move themselves; `POST /agent/health` marks a running ring `done` once all its deployments report that release's version or newer) (NEX-130) |
| GET | `/agent/update` | agent bearer token | `Authorization: Bearer <token>` (same check as `/agent/health`, no cookie); returns `200 { release, manifest }` for the newest published, signed release with a stored `nexus-release/1` manifest (imported by `nexus-control-release-import`, NEX-117) on the deployment's channel newer than its version, pre-releases only on `preview`, `minUpgradeFrom` ≤ deployment version, listed in a `running` or `done` rollout — or `200 { release: null, manifest: null }`; unknown/revoked `401`, air-gapped `403`, > 1 per 60 s `429` |
| GET | `/agent/commands` | agent bearer token | `Authorization: Bearer <token>` (D60, NEX-128; no staff cookie); expires past-due rows (and fails the job step that waited, D63, NEX-139), returns up to 20 oldest unexpired `pending`/`delivered` commands as `{ items: [{ command, signature }] }` (`nexus-command/1` canonical JSON signed with OpenBao Ed25519 `nexus-command`), and marks `pending` → `delivered`; unknown/revoked `401`, air-gapped `403`, > 1 per 30 s `429` |
| POST | `/agent/commands/:id/result` | agent bearer token | body `{ status: done \| failed \| rejected, result: object ≤ 4 KB }` → `200 { id, status }`; only the deployment's own command (`404` otherwise), once only (`409` after final status or expiry; a late result expires the command and fails its job step, D63), oversize `413`, air-gapped `403`; logs ids, kind and status only |
| GET | `/tickets`, `/tickets/:id` | `ctl.ticket.read` | filters `accountId`, `status`, `priority`, `assigneeStaffId`; partners see only their accounts' tickets (NEX-122) |
| GET | `/ticket-replies` | `ctl.ticket.read` | filter `ticketId`; joined through visible tickets (never by reply id alone) |
| POST | `/tickets/:id/replies` | `ctl.ticket.reply` | body `{ body (1–5000, trimmed), internal }` → `201 TicketReply`; invisible → `404`, closed → `409`, invalid/extra field → `400 invalid_request`; assigns unassigned tickets to replier, public reply sets `waiting_customer` (clearing `resolvedAt`), internal note moves `new` → `open` and preserves other statuses (incl. `resolved` + `resolvedAt`); logs ids only |
| GET | `/sla-policies`, `/sla-policies/:slaTier` | `ctl.ticket.read` | response/resolution minute targets per tier; not shown to partner users |
| GET | `/kb-articles`, `/kb-articles/:id` | `ctl.ticket.read` | filters `locale`, `slug`; not shown to partner users |
| GET | `/extensions`, `/extensions/:id` | `ctl.extension.read` | filter `accountId`; read-only (`control_app` SELECT only, NEX-123) |
| GET | `/extension-compatibility` | `ctl.extension.read` | filters `extensionId`, `releaseVersion`, `result`; not shown to partner users |
| GET | `/projects`, `/projects/:id` | `ctl.project.read` | filters `accountId`, `status`, `kind`; read-only |
| GET | `/sandboxes`, `/sandboxes/:id` | `ctl.sandbox.read` | filters `kind`, `status`, `accountId`; unattached sales demos (`accountId: null`) are not shown to partner users |
| GET | `/deals` | `ctl.deal.read` | filters `partnerId`, `accountId`, `status`; read-only (`control_app` SELECT only); partners see only their accounts' deals (NEX-124) |
| GET | `/commissions` | `ctl.partner.read` | filters `partnerId`, `status`; not shown to partner users |
| GET | `/metrics`, `/metrics/:month` | `ctl.analytics.read` | stored monthly business snapshots (`YYYY-MM`, ARR = 12 × MRR); not shown to partner users |
| GET | `/account-health`, `/account-health/:accountId` | `ctl.analytics.read` | filter `churnRisk`; AI-estimated score + message-key reasons; partners see only their accounts' health |
| GET | `/sub-processors`, `/certifications` | `ctl.trust.read` | list only (`control_app` SELECT only); not shown to partner users (NEX-126) |
| GET | `/incidents`, `/incidents/:id` | `ctl.trust.read` | filters `status`, `severity`; newest detected first; not shown to partner users |
| GET | `/dpas` | `ctl.trust.read` | filter `accountId`; partners see only their accounts' DPAs |
| GET | `/broker-requests`, `/broker-requests/:id` | `ctl.broker.read` | filters `accountId`, `status`, `ticketId`; partners see only their accounts' requests (NEX-125) |
| POST | `/broker-requests` | `ctl.broker.request` | body `{ accountId, tenantId, ticketId?, reason, modules, mode, durationHours }`; M83 in modules → `422`, unknown account/tenant → `404`, no reachable deployment / self-hosted / air-gapped → `409`; inserts `pending` request (`acr-` + 16 hex) and queues signed `access_request.file` D60 command for the tenant's cell (24 h TTL) → `201 BrokerRequest` |
| GET | `/broker-sessions` | `ctl.broker.read` | filter `requestId`; read-only (`control_app` SELECT only); not shown to partner users |
| GET | `/break-glass-cases`, `/break-glass-cases/:id` | `ctl.broker.read` | filter `accountId`; read-only (`control_app` SELECT only); partners see only their accounts' cases |
| POST | `/agent/access-decisions` | agent bearer token | body `{ items: [{ requestId, status: approved \| denied \| expired \| revoked, decidedAt }] }` (≤ 50); updates only requests routed to the calling deployment (first decision wins; `revoked` / `ended` may follow `approved`; `expired` → `ended`); returns `{ updated, ignored }` |
| GET | `/provisioning-jobs`, `/provisioning-jobs/:id` | `ctl.provisioning.read` | filters `status`, `tenantId`; not shown to partner users (NEX-121) |
| POST | `/provisioning-jobs` | `ctl.provisioning.manage` | body `ProvisioningRequest`; visible non-self-hosted account matching `deliveryModel`, reachable cell and executive/technical contact (else `404` / `409`); creates `pending` job (`prv-` + 16 hex) and queues signed `tenant.provision` command (`ten-` + 12 hex kept internal until `create_tenant` finishes); command results advance steps and append `tenantId` to the account once; `…/advance` stays unserved (`404`) → `201 ProvisioningJob` (NEX-132) |
| POST | `/provisioning-jobs/:id/retry` | `ctl.provisioning.manage` | failed jobs only (`409` otherwise); queues a fresh signed `tenant.provision` command with the same tenant id → `200 ProvisioningJob` (NEX-132) |
| GET | `/offboarding-jobs`, `/offboarding-jobs/:id` | `ctl.provisioning.read` | filters `accountId`, `status`, `tenantId`; partners see only their accounts' offboarding jobs |
| POST | `/offboarding-jobs` | `ctl.provisioning.manage` | body `{ accountId, tenantId, recipientPem }` (RSA ≥ 3072, else `400`); tenant on visible account and in a reachable cell (else `404` / `409`); `409` if another offboarding or move is open (`pending`/`running`) for the tenant, marked by `details: [{ path: "tenantId", message: "open_job" }]` (D66, NEX-143); queues signed `tenant.freeze` → on done queues `tenant.export` → `201 OffboardingJob` (NEX-134) |
| POST | `/offboarding-jobs/:id/confirm-download` | `ctl.provisioning.manage` | marks `export_downloaded` done after `export_ready` is done (else `409`) → `200 OffboardingJob` (NEX-134) |
| POST | `/offboarding-jobs/:id/retry` | `ctl.provisioning.manage` | only a `failed` job (`409` otherwise, and `409` if another offboarding or move is open for the tenant, D66, NEX-143); re-queues the failed step's signed command — `tenant.freeze`, `tenant.export` for the stored PEM (kept until the export succeeds), or `tenant.destroy_keys` with the two approvals already given — and sets that step `running` → `200 OffboardingJob`; partners `404` (D63, NEX-139) |
| POST | `/offboarding-jobs/:id/approve-destroy` | `ctl.provisioning.manage` | four-eyes approval after `export_downloaded` is done (`409` before or if the same staff member approves twice); second distinct staff member queues signed `tenant.destroy_keys`; on done Control signs and stores a `ShredCertificate` (`shr-…`, Transit Ed25519 `nexus-shred`) and completes the job (NEX-134) |
| GET | `/shred-certificates`, `/shred-certificates/:id` | `ctl.provisioning.read` | filter `tenantId`; signed key-destruction certificates; not shown to partner users |
| GET | `/shred-certificate-keys` | public (no auth) | `{ keyId: base64Ed25519PublicKey }` for offline verification of `ShredCertificate` signatures (NEX-134) |
| GET | `/portability-jobs`, `/portability-jobs/:id` | `ctl.portability.read` | filters `accountId`, `status`, `direction`; encrypted exports always; partners see only their accounts' moves |
| POST | `/portability-jobs` | `ctl.portability.manage` | body `{ accountId, tenantId, direction, toRegion }`; region move with same region → `422`; `409` if another offboarding or move is open (`pending`/`running`) for the tenant, marked by `details: [{ path: "tenantId", message: "open_job" }]` (D66, NEX-143); queues `tenant.import_key` immediately when destination is a SaaS cell → `201 PortabilityJob` (all 7 steps `pending`, NEX-136) |
| POST | `/portability-jobs/:id/confirm` | `ctl.portability.manage` | body `{ step, pem?, fileName?, rows?, chainOk?, checkpointOk? }`; confirms the current pending staff step (`preflight`/`export_encrypted`/`import` for self-hosted, `transfer`, `cutover` updating account region/delivery model/tenants in one tx and starting a NEX-134 offboarding job for SaaS source, `shred_source` for self-hosted source); wrong step or cell-managed step → `409` (NEX-136) |
| POST | `/portability-jobs/:id/retry` | `ctl.portability.manage` | failed portability jobs only (`409` otherwise, and `409` if another offboarding or move is open for the tenant, D66, NEX-143); re-queues or resets from the failed step (a failed **Verify** on a self-hosted destination goes back to the staff **Import** step) → `200 PortabilityJob` (NEX-136, NEX-142 review) |

Partner scoping follows the mocks: rows with an account are visible when it is one the partner manages (and ticket
replies are joined through visible tickets); rows without one (catalogue, payments, credit notes, health signals,
releases, rollouts, SLA policies, KB articles, extension compatibility, unattached sandboxes, commissions, business
metrics, sub-processors, certifications, security incidents, provisioning jobs, shred certificates, broker sessions) are not shown to partner users.

## Forms and fields (M08) — real backend (NEX-200) and mock

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `GET /api/v1/custom-fields` | M08 enabled, `m08.config.read` | `?page=&pageSize=&entity=` → `Page<CustomFieldDefinition>`. The optional entity filter includes archived fields. | `400 invalid_request` for an unknown entity or invalid paging, `401`, `403` |
| `GET /api/v1/forms` | M08 enabled, `m08.config.read` | `?page=&pageSize=` → `Page<FormDefinition>` | `400`, `401`, `403` |
| `GET /api/v1/workflows` | M08 enabled, `m08.config.read` | `?page=&pageSize=` → `Page<WorkflowDefinition>` | `400`, `401`, `403` |
| `GET /api/v1/numbering-formats` | M08 enabled, `m08.config.read` | `?page=&pageSize=` → `Page<NumberingFormat>` | `400`, `401`, `403` |
| `POST /api/v1/custom-fields` | M08 enabled, `m08.config.manage` | `CustomFieldInput` → `201 CustomFieldDefinition`. The server assigns the ID, signed-in tenant, creation and update times, and sets `archived` to false. | `400 invalid_request` for invalid input or a missing default-locale label (path `label`), `401`, `403`, `409 conflict` for a key already used on the same entity in the same tenant, including archived fields. |

The real backend checks the module and permission before reading the creation request. For a tenant with multiple institutions, the first institution in ID order supplies the default locale. Validation details use only recognized top-level contract field names. Creating a field records `m08.customField.created` in the same transaction. Its change list contains the submitted field names and omits their values.

## Import & migration (M09) — mock API (Stage 3 prototype, NEX-157, NEX-162)

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `GET /api/v1/import-jobs` | M09 enabled, `m09.import.read` | `?page=&pageSize=` → `Page<ImportJob>` | `400`, `401`, `403` |
| `GET /api/v1/import-jobs/:id/mappings` · `/issues` | M09 enabled, `m09.import.read` | `?page=&pageSize=` → `Page<ColumnMapping>` · `Page<ImportRowIssue>` (catalogue message keys only, never cell values) | `400`, `401`, `403`, `404` |
| `POST /api/v1/import-jobs` | M09 enabled, `m09.import.manage` (active staff profile required) | `ImportJobInput` (`{ entity, fileName, sourceFormat }`) → `201 ImportJob` (`status: uploaded`, zero rows, `templateVersion: 1`, `rollbackUntil: null`, `createdByStaffProfileId` from viewer's active staff profile) | `400 invalid_request` (bad JSON, invalid plain file name, unknown entity/format, extra fields), `401`, `403 module_disabled`, `403 forbidden` (missing permission or no active staff profile) |

## Staff admissions (M12) — real backend (NEX-185) and mock

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `GET /api/v1/enquiries` | M12 enabled, `m12.admissions.read` | `?status=&page=&pageSize=` → `Page<Enquiry>`. An unknown status returns an empty page. | `400 invalid_request` (paging), `401`, `403 module_disabled` or `forbidden`. |
| `GET /api/v1/applications` | M12 enabled, `m12.admissions.read` | `?page=&pageSize=` → `Page<Application>` with ordinary and sensitive form values combined in `answers`. | `400`, `401`, `403`. |
| `GET /api/v1/admission-offers` | M12 enabled, `m12.admissions.read` | `?page=&pageSize=` → `Page<AdmissionOffer>`. | `400`, `401`, `403`. |
| `GET /api/v1/waitlist` | M12 enabled, `m12.admissions.read` | `?page=&pageSize=` → `Page<WaitlistEntry>`. | `400`, `401`, `403`. |
| `POST /api/v1/enquiries` | M12 enabled, `m12.admissions.manage` | `EnquiryInput` (source, campusId, contactName, contactPhone, contactEmail, learnerName, programId, followUpOn) → `201 Enquiry` | `400 invalid_request` for invalid JSON, invalid fields, missing contact method or a campus/program outside the tenant. Field details use input paths. `401` for a missing session, `403` for a disabled module or missing permission. |

On the real backend, a page that discloses sensitive application answers records one `m12.application.sensitiveRead` event in the request transaction. It targets `applicationList` and records only the field name `answers`.

Lists preserve insertion order within the tenant. The backend checks the module and permission before validating the enquiry body. It chooses the institution from the program, then the campus, then the viewer’s staff profile, then the first institution by ID. If none exists it returns `400 invalid_request`. The assignee is the viewer’s staff profile or null. The server sets the tenant, `enq-` ID, timestamps and `new` status. Campaign code and lost reason start as null. The same transaction records `m12.enquiry.created` with input field names only.

## Admissions enquiry forms (M12) — mock API (NEX-186, NEX-201)

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `GET /api/v1/public/enquiry-forms/:formId` | Public (no session) | — → `PublicEnquiryForm` (`id`, `institutionName`, `institutionType`, `defaultLocale`, `supportedLocales`, active `programs` and `campuses` as `{ id, name }` only, D79) | `404 not_found` for an unknown form ID, disabled M12 or suspended institution. |
| `POST /api/v1/public/enquiry-forms/:formId/enquiries` | Public (no session) | `PublicEnquiryInput` (`learnerName`, `contactName`, phone or email, optional `programId`/`campusId`, `consent: true`, empty honeypot `website`) → `202 PublicEnquiryReceipt` (`{ received: true }`, never echoes data). Stores a `new` / `public_form` enquiry with no assignee in the form's tenant; a filled `website` returns the same `202` and stores nothing. | `400 invalid_request` with field `details[].path` (incl. foreign program/campus), `404 not_found`. |
| `GET /api/v1/enquiry-forms` | M12 enabled, `m12.admissions.manage` | `?page=&pageSize=` → `Page<EnquiryFormSummary>` (the signed-in tenant's public form IDs) | `400`, `401`, `403 module_disabled` or `forbidden`. |

## Families and guardians (M14) — real backend (NEX-202) and mock

| Method and path | Result |
|---|---|
| `GET /api/v1/households` | `Page<Household>`. A viewer with `m14.family.read` sees every household in the tenant, including households without a matching learner record. Other viewers see households containing at least one learner in their family scope. |
| `GET /api/v1/guardian-relationships` | `Page<GuardianRelationshipView>`. Accepts an optional `learnerPersonId`. Every viewer can see the pickup right for a visible learner. Only viewers with `m14.family.read_restricted` receive the court-order note. Other viewers receive `courtOrderNote: null`. |
| `GET /api/v1/authorised-pickups` | `Page<AuthorisedPickup>`. Accepts an optional `learnerPersonId`. |

Both learner-filtered lists use M13 learner person IDs. Tenant-wide readers see all such learners in the tenant. Family scope includes the viewer and their linked learners when they have a learner record. A viewer without tenant-wide access or a family learner receives `403 forbidden`. A learner filter outside an otherwise valid scope returns `404 not_found`.
All three routes require a session (`401`) and an enabled M14 entitlement (`403 module_disabled`). Lists accept `page` and `pageSize` and return `400 invalid_request` for invalid paging.
A page that discloses one or more court-order notes records one `m14.guardianRelationship.sensitiveRead` event in the request transaction. Its target is the selected learner person ID or `guardianRelationshipList`. The change contains only the field name `courtOrderNote`.

## Learner records (M13) — real backend (NEX-184) and mock

All four routes require an enabled M13 entitlement. Viewers with `m13.learner.read` can read all learners in their tenant. Other viewers can read their own record and those of learners linked to them as a guardian. A viewer with no read permission and no family learner receives `403 forbidden`. An unknown, foreign or out-of-family learner ID within an otherwise permitted request returns `404 not_found`.

| Method & path | Output |
|---|---|
| `GET /api/v1/learners` | `Page<Learner>` |
| `GET /api/v1/learners/:id` | `Learner` |
| `GET /api/v1/learners/:id/enrolments` | `Page<Enrolment>` |
| `GET /api/v1/learners/:id/documents` | `Page<LearnerDocument>` (metadata only) |

Lists accept `page` and `pageSize`. Invalid paging returns `400 invalid_request`. A missing session returns `401` and a disabled module returns `403 module_disabled`.
Family and viewers with `m13.learner.read_restricted` receive health flags and sensitive custom field values. Other viewers receive `healthFlags: []` and only unrestricted custom fields. When a response discloses sensitive data about a non-family learner, the backend records one `m13.learner.sensitiveRead` event in the request transaction. Its target is the learner ID or `learnerList`, and its changes contain only the disclosed field names.

## Academic structure (M15) — real backend (NEX-183) and mock

All routes require an enabled M15 entitlement. The backend records `m15.classGroup.created` in the same transaction as a successful creation. Its change list contains input field names only. Codes are compared case-insensitively within an academic year.

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `GET /api/v1/programs` · `/year-levels` · `/class-groups` · `/subjects` | `m15.structure.read` | `?page=&pageSize=` → `Page<Program>` · `Page<YearLevel>` · `Page<ClassGroup>` · `Page<Subject>` | `400`, `401`, `403` |
| `GET /api/v1/subject-offerings` | `m15.structure.read` | `?academicYearId=&page=&pageSize=` → `Page<SubjectOffering>` | `400`, `401`, `403`, `404` (unknown or other tenant's `academicYearId`) |
| `POST /api/v1/class-groups` | `m15.structure.manage` | `ClassGroupInput` → `201 ClassGroup` (`id`, `tenantId`, `institutionId`, timestamps server-set) | `400 invalid_request` (bad body, or `programId` / `academicYearId` / `yearLevelId` / `campusId` / `homeroomStaffProfileId` outside tenant, or `yearLevelId` not in `programId`), `401`, `403`, `409 conflict` (duplicate `code` in the same academic year) |

## Timetable & scheduling (M16) — mock API (Stage 3 prototype, NEX-157, NEX-165)

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `GET /api/v1/rooms` · `/bell-schedules` | M16 enabled, `m16.timetable.read` | `?page=&pageSize=` → `Page<Room>` · `Page<BellSchedule>` | `400`, `401`, `403` |
| `GET /api/v1/timetable-slots` | M16 enabled, `m16.timetable.read` (guardians/learners scoped to active family enrolments) | `?classGroupId=&staffProfileId=&page=&pageSize=` → `Page<TimetableSlot>` | `400`, `401`, `403`, `404` (foreign `classGroupId` or `staffProfileId`) |
| `GET /api/v1/teacher-load` | M16 enabled, `m16.timetable.read` (staff only) | `?academicYearId=&page=&pageSize=` → `Page<TeacherLoad>` | `400`, `401`, `403` (non-staff), `404` (foreign `academicYearId`) |
| `POST /api/v1/timetable-slots` | M16 enabled, `m16.timetable.manage` | `TimetableSlotInput` → `201 TimetableSlot` (`id`, `tenantId`, timestamps server-set) | `400 invalid_request` (top-level paths only; invalid input, or `subjectOfferingId` / `roomId` / `staffProfileIds` / `academicYearId` / `periodId` outside tenant or mismatched), `401`, `403 module_disabled`, `403 forbidden`, `409 conflict` (`details: [{ path }]` with `roomId`, `staffProfileIds` or `subjectOfferingId` on same-weekday overlapping time and effective dates; null `effectiveTo` is open) |

## Attendance (M17) — mock API (Stage 3 prototype, NEX-166)

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `GET /api/v1/attendance-sessions/:id/roster` | M17 enabled, staff with `m17.attendance.read` | `?page=&pageSize=` → `Page<AttendanceRosterEntry>` containing learner ID and nullable roll number, ordered by roll number then learner ID | `400` invalid paging, `401`, `403`, `404` unknown or foreign session |
| `POST /api/v1/attendance-sessions/:id/marks` | M17 enabled, active staff with `m17.attendance.mark` | `AttendanceMarkInput` → `201 AttendanceMark`. Send `Idempotency-Key` for replay. | `400 invalid_request` for invalid input or off-roster `learnerId`, `401`, `403`, `404` unknown or foreign session, `409 conflict` on `status` when the session is closed |

Roster membership uses the class group and session date, including each end of the enrolment period. A session without a class group has an empty roster. Each mark appends a manual record with server-assigned ID, tenant, session, timestamp, staff profile and device field. A repeated key in the same tenant returns the first mark.

## Fees & payments (M18) — mock API (Stage 3 prototype, NEX-158, NEX-167)

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `GET /api/v1/fee-heads` · `/fee-plans` · `/concessions` · `/fee-refunds` | M18 enabled, `m18.fees.read` | `?page=&pageSize=` → `Page<FeeHead>` · `Page<FeePlan>` · `Page<Concession>` · `Page<FeeRefund>` | `400`, `401`, `403` |
| `GET /api/v1/fee-invoices` | M18 enabled (`m18.fees.read` for all, else family learners only; staff without read → `403`) | `?learnerId=&status=&page=&pageSize=` → `Page<FeeInvoice>` | `400`, `401`, `403`, `404` (foreign or out-of-family `learnerId`) |
| `GET /api/v1/fee-payments` | M18 enabled (`m18.fees.read` for all, else payments whose invoices are all in the family) | `?invoiceId=&page=&pageSize=` → `Page<FeePayment>` | `400`, `401`, `403`, `404` (foreign or out-of-family `invoiceId`) |
| `POST /api/v1/fee-payments` | M18 enabled, active staff profile with `m18.fees.manage` | `FeePaymentInput` (`cash`, `cheque` or `bank_transfer`; optional `Idempotency-Key` header for offline L2 replay) → `201 FeePayment` (`status: succeeded`, `gatewayReference: null`, `receiptNumber` `R-` + 6 digits, `payerPersonId` from first invoice's learner). Applies oldest due invoice first and updates `paid` and `status`. | `400 invalid_request` (top-level paths only: bad input, closed/foreign invoice, currency mismatch, or `amount` > sum of balances with path `amount`), `401`, `403 module_disabled`, `403 forbidden` |
| `POST /api/v1/journal-entries` | M19 enabled, `m19.accounts.manage` | `JournalEntryInput` (institutionId, postedOn, reference, currency and lines) → `201` with the `JournalEntry` with source `manual`, a new identifier and `createdAt` at submission. Each row must have a non-zero debit or credit, the totals must match, and each account must be active in the selected institution. | `400 invalid_request` (top-level field paths, no data values), `401`, `403 module_disabled`, `403 forbidden` |

A repeated `Idempotency-Key` in the same tenant returns the first payment with `201` without applying it a second time.

## Assessment & gradebook (M20) — mock API (Stage 3 prototype, NEX-158, NEX-169)

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `GET /api/v1/grading-schemes` · `/rubrics` | M20 enabled, `m20.marks.read` | `?page=&pageSize=` → `Page<GradingScheme>` · `Page<Rubric>` | `400`, `401`, `403` |
| `GET /api/v1/assessments` | M20 enabled, `m20.marks.read` | `?classGroupId=&page=&pageSize=` → `Page<Assessment>` | `400`, `401`, `403`, `404` (unknown or foreign `classGroupId`) |
| `GET /api/v1/assessments/:id/roster` | M20 enabled, `m20.marks.read` | `?page=&pageSize=` → `Page<AttendanceRosterEntry>` for learners enrolled effective today in the offering's class group, ordered by roll number then learner ID | `400`, `401`, `403`, `404` (unknown or foreign assessment) |
| `GET /api/v1/assessments/:id/marks` | M20 enabled (`m20.marks.read` for all; else family learners on published assessments only, `remark` masked) | `?page=&pageSize=` → `Page<MarkEntry>` | `400`, `401`, `403`, `404` |
| `PUT /api/v1/assessments/:id/marks/:learnerId` | M20 enabled, active staff profile with `m20.marks.enter` | `MarkEntryInput` (`marks`, `absent`, `rubricScores`, `remark`; send `Idempotency-Key` for offline L2 replay) → `200 MarkEntry` (upserts learner's entry keeping its `id`, sets `enteredByStaffProfileId`, `enteredAt` now, `deviceId: null`) | `400 invalid_request` (paths only, never values: `learnerId` off roster, `marks` > `maxMarks` or bad step, invalid `rubricScores`, bad `remark`), `401`, `403`, `404` (unknown or foreign assessment), `409 conflict` (path `status` when assessment is not `open` or `marking`) |

A repeated `Idempotency-Key` in the same tenant returns the stored `200 MarkEntry` without reapplying the write.

## Exams (M21) — mock API (Stage 3 prototype, NEX-170)

| Method & path | Permission | Input / Output | Errors |
|---|---|---|---|
| `POST /api/v1/exam-papers/:id/seat-plan` | M21 enabled, `m21.exams.manage`, active staff profile | Empty body or `{}`; send `Idempotency-Key`. Returns `200 Page<SeatAssignment>` for the generated plan. | `400 invalid_request` (`roomIds` for insufficient room capacity), `401`, `403 module_disabled` or `forbidden`, `404` for an unknown or foreign paper, `409 conflict` (`status` unless the exam is planned or scheduled) |

The plan uses the subject offering’s class group on the paper date. Learners are ordered by numeric roll number (missing numbers last), then learner ID. Rooms fill in paper order up to capacity, with unlimited places for a null capacity. Seat labels start at A1 in the first room, B1 in the second. A successful write replaces only that paper’s seats. An error preserves existing assignments. Reusing a successful key within the same tenant returns the original response.

## Report cards (M22) — mock API (Stage 3 prototype, NEX-171)

| Method & path | Access | Input / output | Errors |
|---|---|---|---|
| `GET /api/v1/report-cards` | M22 enabled. Staff with `m22.reports.read` see tenant cards. Families see only their own published cards. | Optional `learnerId`, staff-only `classGroupId`, and paging → `Page<ReportCard>`. Group selection matches enrolments in the card's academic year. | `401`, `403`, `404` for an inaccessible learner or unknown staff-selected group |
| `POST /api/v1/report-cards/:id/status` | M22 enabled and `m22.reports.publish` | `ReportCardStatusInput` → `200 ReportCard` | `400 invalid_request` for an invalid body, `401`, `403`, `404` for an unknown or foreign card, `409 conflict` for an invalid move |

Allowed moves are draft → approved, approved → published, and published → withdrawn. Each successful move sets `updatedAt` to the current UTC time. Publishing sets `publishedAt` to that same time. Withdrawal clears it. Invalid bodies and transitions report the field path `status`. Rejected writes preserve the card.

## Issued documents (M23) — mock API (Stage 3 prototype, NEX-158, NEX-172)

| Method & path | Access | Input / output | Errors |
|---|---|---|---|
| `GET /api/v1/issued-documents` | M23 enabled. Staff with `m23.documents.read` see tenant documents with revocation reasons. Families see only their own learners' documents with `revokedReason` redacted to `null` (V-7); staff letters (`learnerId: null`) are excluded. | Optional `learnerId` and paging → `Page<IssuedDocumentRead>` | `401`, `403`, `404` for an inaccessible or foreign `learnerId` |
| `POST /api/v1/issued-documents/:id/revoke` | M23 enabled and `m23.documents.issue` | `IssuedDocumentRevokeInput` (`{ reason }`, trimmed 1–300 chars) → `200 IssuedDocument` (`revoked: true`, `revokedReason` set) | `400 invalid_request` (path `reason`), `401`, `403 module_disabled` or `forbidden`, `404` for an unknown or foreign document, `409 conflict` (path `revoked`) when already revoked |

Error details carry field paths only, never learner names, document numbers, verification codes or revocation reasons (V-7). Rejected writes leave the document unchanged.

## Communication (M24) — mock API (Stage 3 prototype, NEX-159, NEX-173)

| Method & path | Access | Input / output | Errors |
|---|---|---|---|
| `GET /api/v1/message-threads` · `/message-threads/:id/messages` | M24 enabled, `m24.messages.read` (only threads the viewer participates in) | Paging → `Page<MessageThread>` · `Page<ThreadMessage>` | `400`, `401`, `403`, `404` for a non-participating or foreign thread |
| `POST /api/v1/message-threads/:id/messages` | M24 enabled, `m24.messages.send` (only threads the viewer participates in) | `ThreadMessageInput` (`{ body }`, trimmed 1–4000 chars; send `Idempotency-Key` for offline L2 replay) → `201 ThreadMessage` (`senderPersonId` = viewer, `readByPersonIds` = `[sender]`, `deviceId: null`, updates thread `lastMessageAt`) | `400 invalid_request` (path `body`), `401`, `403 module_disabled` or `forbidden`, `404` for a non-participating or foreign thread, `409 conflict` (path `archived`) when the thread is archived |
| `GET /api/v1/notices` | M24 enabled, `m24.notices.read` (all tenant notices with `m24.notices.publish`, else published unexpired audience notices) | Paging → `Page<Notice>` | `400`, `401`, `403` |
| `GET /api/v1/meeting-slots` · `/meeting-bookings` | M24 enabled, `m24.meetings.read` (all bookings with `m24.meetings.manage`, else guardian own bookings or staff slot bookings with `note` masked) | Optional `staffProfileId` on slots + paging → `Page<MeetingSlot>` · `Page<MeetingBooking>` | `400`, `401`, `403`, `404` for a foreign `staffProfileId` |

A repeated `Idempotency-Key` in the same tenant returns the stored `201 ThreadMessage` without appending a duplicate. Error details carry field paths only, never message bodies or participant names (V-7).
