# Contracts map

> One line per contract: name → file → mock → endpoint(s). Update in the same task that adds or changes a contract.
> All contracts live in `frontend/packages/contracts/src/`; every object is strict (unknown keys rejected).

Parity (NEX-059): `backend/tests/parity/test_contract_parity.py` parses every demo row and generated variants
(field dropped / null / wrong type / extra) with the backend model in strict JSON mode and must agree with Zod on
the shape; samples are exported with the fixtures. Cross-field rules are enforced by the services.

| Contract | File | Rules worth knowing | Mock | Endpoint | Backend model |
|---|---|---|---|---|---|
| Id, UtcDateTime, IsoDate, Locale, TimeZone, CurrencyCode, CountryCode, MinorUnits, Region, InstitutionType, ModuleId, DisplayCalendar, Name, Email, PhoneE164, RetentionState | `common.ts` | Times in UTC with `Z`; locale canonical BCP 47 (`en-IN`, not `en_IN`); IANA zones incl. `UTC`; ISO 4217 / 3166 codes; money = integer minor units; phones E.164 (`+919876543210`); retention `active` / `archived` / `crypto_shredded` | — | — | — (scalars / nested parts, checked through their parents) |
| ApiError | `error.ts` | `{ error: { code, message, details?, requestId? } }`; codes `invalid_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `module_disabled`, `rate_limited`, `internal` | NEX-010 | every non-2xx response | `core.errors.ApiErrorEnvelope` |
| Page / PageQuery | `page.ts` | `{ items, total, page, pageSize }` (D15); page ≥ 1, pageSize 1–200 (default 50) | NEX-010 | every list endpoint | `core.pagination.Page` / `PageQuery` (frontend only in parity: generic) |
| DomainEvent | `event.ts` | Envelope for audit, notifications, webhooks, analytics, sync; `eventType` = `<module>.<entity>.<action>` starting with its `moduleId` | NEX-010 | Stage 1 build step | `core.events.DomainEvent` |
| LocaleSettings | `tenancy.ts` | default locale ∈ supported; weekend days 0–6 (Sunday = 0), unique | NEX-010 | `GET`/`PUT /api/v1/locale-settings` (real: NEX-047) | `m01.schemas.LocaleSettings` |
| Group | `tenancy.ts` | A group is the tenant; its institutions share its `tenantId` | NEX-010 | `GET /api/v1/tenant` (real: NEX-047) | `m01.schemas.GroupOut` |
| Institution | `tenancy.ts` | `groupId` null = standalone tenant; status active / trial / suspended | NEX-010 | mock: `GET /api/v1/tenant` | `m01.schemas.InstitutionOut` |
| Campus | `tenancy.ts` | `code` A–Z 0–9 -; `timeZone` null = institution's zone; organisation address | NEX-010 | mock: `GET /api/v1/tenant` | `m01.schemas.CampusOut` |
| InstitutionTypeProfile | `tenancy.ts` | Defaults per type; `terminologyPack` = its own type; unique module ids | NEX-010 | `GET /api/v1/institutions/:id/profile` (real: NEX-047) | `m01.schemas.TypeProfileOut` |
| AcademicCalendar | `calendar.ts` | Periods inside the year, not overlapping; holidays inside the year; `displayCalendar` for G-3 | NEX-010 | `GET`, `PUT /api/v1/institutions/:id/calendars[/:calendarId]` (real: NEX-047) | `m01.schemas.CalendarOut` |
| Person | `person.ts` | Identity + contact only (D25); `isMinor` drives masking (G-6); phone E.164; `retentionState` | NEX-010 | mock: `GET /api/v1/people`, mock: `GET /api/v1/me` | `m02.schemas.PersonOut` |
| RoleProfile | `person.ts` | Membership of an institution: kind staff / guardian / learner / alumni / external; optional campus and academic year; `effectiveTo` ≥ `effectiveFrom` | NEX-010 | mock: `GET /api/v1/me` | `m02.schemas.RoleProfileOut` |
| User | `user.ts` | Sign-in account of a `Person`; status invited / active / suspended / locked; MFA, passkey count, `ssoOnly`; no password fields | NEX-010 | mock: `GET /api/v1/users`, mock: `GET /api/v1/me` | `m02.schemas.UserOut` |
| Session | `user.ts` | Device session; auth method password / sso / passkey; `expiresAt` > `createdAt`, `lastSeenAt` and `revokedAt` ≥ `createdAt`; never the token | NEX-010 | mock: `GET /api/v1/sessions` | `m02.schemas.SessionOut` |
| SsoProvider | `user.ts` | OIDC / SAML 2; `issuerUrl` https only; `domains` non-empty, lower case, unique; `institutionId` null = tenant-wide; never client secrets | NEX-010 | mock: `GET /api/v1/sso-providers` | `m02.sso.SsoProviderOut` |
| PermissionCode / Permission | `rbac.ts` | Code `<module>.<resource>.<action>` (`m02.user.invite`) starting with its `moduleId`; `sensitive` = restricted data; `descriptionKey` = i18n key | NEX-010 | mock: `GET /api/v1/permissions` | `m02.schemas.PermissionOut` |
| ScopeKind / RoleScope | `rbac.ts` | group / institution / campus / department / class / own; `targetId` null iff `own` | NEX-010 | Stage 1 build step | — (scalars / nested parts, checked through their parents) |
| Role | `rbac.ts` | Non-empty unique `permissions` and `allowedScopeKinds`; `system` roles are not tenant-editable | NEX-010 | mock: `GET /api/v1/roles` | `m02.schemas.RoleOut` |
| RoleAssignment | `rbac.ts` | Role for a user in one scope, optional academic year; `effectiveTo` ≥ `effectiveFrom`; scope kind ∈ role's allowed kinds checked by the server | NEX-010 | mock: `GET /api/v1/role-assignments`, mock: `GET /api/v1/me` | `m02.schemas.RoleAssignmentOut` |
| SettingScope | `studio.ts` | Layer platform / group / institution / campus; `targetId` null iff `platform` | NEX-010 | — | — (scalars / nested parts, checked through their parents) |
| HexColor, TokenName, AssetUrl, Density, MessageKey | `studio.ts` | `#RRGGBB`; kebab-case token names; assets `https://` or `/path` only; message keys `common.` / `term.` / `<module>.` | — | — | — (scalars / nested parts, checked through their parents) |
| Theme | `studio.ts` | One theme layer: partial light/dark colour maps, font ids, `radius-*` px values, density, logo/favicon/login assets, `lockedTokens` (unique); contrast checked by theme engine + server | NEX-010 | mock: `GET /api/v1/theme` | `m03.schemas.ThemeOut` |
| Font | `studio.ts` | Library or upload; `fileUrl` set iff `upload`; non-empty unique roles (sans / mono) and scripts | NEX-010 | mock: `GET /api/v1/fonts` | `m03.schemas.FontOut` |
| TextOverride / TextOverrideRevision | `studio.ts` | Per scope + locale + message key; ICU validity checked by editor + server; revision `message: null` = removed | NEX-010 | mock: `GET /api/v1/texts/overrides`, mock: `GET /api/v1/texts/revisions` | `m04.schemas.TextOverrideOut` / `RevisionOut` |
| TerminologyPack | `studio.ts` | Locale-scoped words per institution type (D28) | NEX-010 | Stage 1 build step | frontend only |
| Plan | `plan.ts` | `code` slug, `nameKey` message key, unique modules, AI credits/month, `learnerLimit` null = unlimited | NEX-010 | mock: `GET /api/v1/plan` | `m05.router.PlanOut` |
| Entitlement | `plan.ts` | Source core / plan / addon / trial; `core` always enabled; `trial` needs `expiresAt` | NEX-010 | mock: `GET /api/v1/entitlements` | `m05.router.EntitlementOut` |
| UsageMeter | `plan.ts` | Metric learners / staff / storage_bytes / ai_credits / sms / email; integer `used` may exceed `limit`; `limit` null = unlimited; `periodEnd` > `periodStart` | NEX-010 | mock: `GET /api/v1/usage` | `m05.usage.UsageMeterOut` |
| AuditEvent | `compliance.ts` | Hash-chained (`prevHash` → `hash`, SHA-256 hex); changed **field names only**, never values; `grantId` iff `provider_grant`; `actorId` null iff `system`; `action` starts with its module | NEX-031 | mock: `GET /api/v1/audit-events` | `m06.schemas.AuditEventOut` |
| Consent | `compliance.ts` | Purpose ai_features / media_sharing / marketing / data_processing; guardian in `givenByPersonId` for minors; `withdrawnAt` set iff withdrawn | NEX-031 | mock: `GET /api/v1/consents` | `m06.schemas.ConsentOut` |
| DataSubjectRequest | `compliance.ts` | Kind access / correct / delete / export; `dueAt` > `receivedAt`; `completedAt` set iff completed or rejected | NEX-031 | mock: `GET /api/v1/data-requests` | `m06.schemas.DataSubjectRequestOut` |
| CompliancePack | `compliance.ts` | gdpr, uk_gdpr, ferpa, coppa, dpdp, lgpd, popia, pdpa, eu_ai_act; DSR due 1–90 days; minor age 13–21; guardian consent for AI / media | NEX-031 | mock: `GET /api/v1/compliance-packs` | `m06.packs.CompliancePackOut` |
| Channel, TimeOfDay | `notification.ts` | Channels email / sms / whatsapp / push / in_app; times `HH:mm` 24-hour | — | — | — (scalars / nested parts, checked through their parents) |
| NotificationTemplate | `notification.ts` | Per event type + channel + locale; ICU `body`; `subject` required iff `email` | NEX-031 | mock: `GET /api/v1/notification-templates` | `m07.schemas.TemplateOut` |
| NotificationDelivery | `notification.ts` | Status queued / sent / delivered / failed / suppressed; `reason` iff failed or suppressed; sent and delivered need `sentAt` ≥ `queuedAt` | NEX-031 | mock: `GET /api/v1/notification-deliveries` | `m07.schemas.DeliveryOut` |
| NotificationPreference | `notification.ts` | Per user + channel, one event type or all (`null`); quiet hours may cross midnight, start ≠ end, read in `timeZone` | NEX-031 | mock: `GET /api/v1/notification-preferences` | `m07.schemas.PreferenceOut` |
| DeviceSync | `sync.ts` | Device registry row: platform web / android / ios / edge; pending, conflict and lost-write counts; `revokedAt` iff `revoked` | NEX-031 | mock: `GET /api/v1/devices` | `m10.service.DeviceOut` |
| MergeRule / SyncConflict | `sync.ts` | Same merge rules as `@nexus/offline`; no payload (privacy) — `summaryKey` message key; `resolution` and `resolvedAt` iff resolved | NEX-031 | mock: `GET /api/v1/sync-conflicts` | `m10.service.ConflictOut` |
| CapabilityTier | `ai.ts` | fast / balanced / reasoning / embedding / multimodal (D24); features never name a vendor model | — | — | — (scalars / nested parts, checked through their parents) |
| AiSettings | `ai.ts` | `piiRedaction` and `minorGuardianConsentRequired` always `true`; `blockedModules` always includes M61 + M83, which can never be switched on; M62 needs `safeguardingEnabled`; no API keys | NEX-031 | mock: `GET /api/v1/ai/settings` | `m11.schemas.AiSettingsOut` |
| AiCredit | `ai.ts` | Credits per period; under `hardCap`, `used` ≤ `granted` | NEX-031 | mock: `GET /api/v1/ai/credits` | `m11.schemas.AiCreditOut` |
| AssistAnswer | `ai.ts` | `aiGenerated: true`; ≥ 1 source `{ moduleId, recordType, recordId, label }`; never cites M61 / M83 | NEX-031 | Stage 1 build step | `m11.schemas.AssistAnswerOut` |
| KeyStatus | `vault.ts` | Key purpose, custody platform / BYOK / HYOK, state; metadata only, never key material | NEX-031 | mock: `GET /api/v1/vault/keys` | `m83.keys.KeyStatusOut` |
| AccessRequest | `vault.ts` | Provider request: opaque `staffRef`, reason, unique modules, read / edit, 1–72 h; `decidedAt` + `decidedBy` iff not pending | NEX-031 | mock: `GET /api/v1/access-requests` | `m83.access.AccessRequestOut` |
| AccessGrant | `vault.ts` | Window `endsAt` > `startsAt`, ≤ 72 h; optional early `revokedAt` | NEX-031 | mock: `GET /api/v1/access-grants` | `m83.access.AccessGrantOut` |
| BreakGlassNotice | `vault.ts` | Legal order / security incident; exactly 2 distinct approvers; `notifiedAt` ≥ `occurredAt`; report link https or `/path` | NEX-031 | mock: `GET /api/v1/break-glass-notices` | `m83.access.BreakGlassNoticeOut` |
