# Contracts map

> One line per contract: name → file → mock → endpoint(s). Update in the same task that adds or changes a contract.
> All contracts live in `frontend/packages/contracts/src/`; every object is strict (unknown keys rejected).

| Contract | File | Rules worth knowing | Mock | Endpoint |
|---|---|---|---|---|
| Id, UtcDateTime, IsoDate, Locale, TimeZone, CurrencyCode, CountryCode, MinorUnits, Region, InstitutionType, ModuleId, DisplayCalendar, Name, Email, PhoneE164, RetentionState | `common.ts` | Times in UTC with `Z`; locale canonical BCP 47 (`en-IN`, not `en_IN`); IANA zones incl. `UTC`; ISO 4217 / 3166 codes; money = integer minor units; phones E.164 (`+919876543210`); retention `active` / `archived` / `crypto_shredded` | — | — |
| ApiError | `error.ts` | `{ error: { code, message, details?, requestId? } }`; codes `invalid_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `module_disabled`, `rate_limited`, `internal` | NEX-010 | every non-2xx response |
| Page / PageQuery | `page.ts` | `{ items, total, page, pageSize }` (D15); page ≥ 1, pageSize 1–200 (default 50) | NEX-010 | every list endpoint |
| DomainEvent | `event.ts` | Envelope for audit, notifications, webhooks, analytics, sync; `eventType` = `<module>.<entity>.<action>` starting with its `moduleId` | NEX-010 | Stage 1 build step |
| LocaleSettings | `tenancy.ts` | default locale ∈ supported; weekend days 0–6 (Sunday = 0), unique | NEX-010 | Stage 1 build step |
| Group | `tenancy.ts` | A group is the tenant; its institutions share its `tenantId` | NEX-010 | Stage 1 build step |
| Institution | `tenancy.ts` | `groupId` null = standalone tenant; status active / trial / suspended | NEX-010 | Stage 1 build step |
| Campus | `tenancy.ts` | `code` A–Z 0–9 -; `timeZone` null = institution's zone; organisation address | NEX-010 | Stage 1 build step |
| InstitutionTypeProfile | `tenancy.ts` | Defaults per type; `terminologyPack` = its own type; unique module ids | NEX-010 | Stage 1 build step |
| AcademicCalendar | `calendar.ts` | Periods inside the year, not overlapping; holidays inside the year; `displayCalendar` for G-3 | NEX-010 | Stage 1 build step |
| Person | `person.ts` | Identity + contact only (D25); `isMinor` drives masking (G-6); phone E.164; `retentionState` | NEX-010 | Stage 1 build step |
| RoleProfile | `person.ts` | Membership of an institution: kind staff / guardian / learner / alumni / external; optional campus and academic year; `effectiveTo` ≥ `effectiveFrom` | NEX-010 | Stage 1 build step |
| User | `user.ts` | Sign-in account of a `Person`; status invited / active / suspended / locked; MFA, passkey count, `ssoOnly`; no password fields | NEX-010 | Stage 1 build step |
| Session | `user.ts` | Device session; auth method password / sso / passkey; `expiresAt` > `createdAt`, `lastSeenAt` and `revokedAt` ≥ `createdAt`; never the token | NEX-010 | Stage 1 build step |
| SsoProvider | `user.ts` | OIDC / SAML 2; `issuerUrl` https only; `domains` non-empty, lower case, unique; `institutionId` null = tenant-wide; never client secrets | NEX-010 | Stage 1 build step |
| PermissionCode / Permission | `rbac.ts` | Code `<module>.<resource>.<action>` (`m02.user.invite`) starting with its `moduleId`; `sensitive` = restricted data; `descriptionKey` = i18n key | NEX-010 | Stage 1 build step |
| ScopeKind / RoleScope | `rbac.ts` | group / institution / campus / department / class / own; `targetId` null iff `own` | NEX-010 | Stage 1 build step |
| Role | `rbac.ts` | Non-empty unique `permissions` and `allowedScopeKinds`; `system` roles are not tenant-editable | NEX-010 | Stage 1 build step |
| RoleAssignment | `rbac.ts` | Role for a user in one scope, optional academic year; `effectiveTo` ≥ `effectiveFrom`; scope kind ∈ role's allowed kinds checked by the server | NEX-010 | Stage 1 build step |
| SettingScope | `studio.ts` | Layer platform / group / institution / campus; `targetId` null iff `platform` | NEX-010 | — |
| HexColor, TokenName, AssetUrl, Density, MessageKey | `studio.ts` | `#RRGGBB`; kebab-case token names; assets `https://` or `/path` only; message keys `common.` / `term.` / `<module>.` | — | — |
| Theme | `studio.ts` | One theme layer: partial light/dark colour maps, font ids, `radius-*` px values, density, logo/favicon/login assets, `lockedTokens` (unique); contrast checked by theme engine + server | NEX-010 | Stage 1 build step |
| Font | `studio.ts` | Library or upload; `fileUrl` set iff `upload`; non-empty unique roles (sans / mono) and scripts | NEX-010 | Stage 1 build step |
| TextOverride / TextOverrideRevision | `studio.ts` | Per scope + locale + message key; ICU validity checked by editor + server; revision `message: null` = removed | NEX-010 | Stage 1 build step |
| TerminologyPack | `studio.ts` | Locale-scoped words per institution type (D28) | NEX-010 | Stage 1 build step |
| Plan | `plan.ts` | `code` slug, `nameKey` message key, unique modules, AI credits/month, `learnerLimit` null = unlimited | NEX-010 | Stage 1 build step |
| Entitlement | `plan.ts` | Source core / plan / addon / trial; `core` always enabled; `trial` needs `expiresAt` | NEX-010 | Stage 1 build step |
| UsageMeter | `plan.ts` | Metric learners / staff / storage_bytes / ai_credits / sms / email; integer `used` may exceed `limit`; `limit` null = unlimited; `periodEnd` > `periodStart` | NEX-010 | Stage 1 build step |
| AuditEvent | `compliance.ts` | Hash-chained (`prevHash` → `hash`, SHA-256 hex); changed **field names only**, never values; `grantId` iff `provider_grant`; `actorId` null iff `system`; `action` starts with its module | NEX-031 | Stage 1 build step |
| Consent | `compliance.ts` | Purpose ai_features / media_sharing / marketing / data_processing; guardian in `givenByPersonId` for minors; `withdrawnAt` set iff withdrawn | NEX-031 | Stage 1 build step |
| DataSubjectRequest | `compliance.ts` | Kind access / correct / delete / export; `dueAt` > `receivedAt`; `completedAt` set iff completed or rejected | NEX-031 | Stage 1 build step |
| CompliancePack | `compliance.ts` | gdpr, uk_gdpr, ferpa, coppa, dpdp, lgpd, popia, pdpa, eu_ai_act; DSR due 1–90 days; minor age 13–21; guardian consent for AI / media | NEX-031 | Stage 1 build step |
| Channel, TimeOfDay | `notification.ts` | Channels email / sms / whatsapp / push / in_app; times `HH:mm` 24-hour | — | — |
| NotificationTemplate | `notification.ts` | Per event type + channel + locale; ICU `body`; `subject` required iff `email` | NEX-031 | Stage 1 build step |
| NotificationDelivery | `notification.ts` | Status queued / sent / delivered / failed / suppressed; `reason` iff failed or suppressed; sent and delivered need `sentAt` ≥ `queuedAt` | NEX-031 | Stage 1 build step |
| NotificationPreference | `notification.ts` | Per user + channel, one event type or all (`null`); quiet hours may cross midnight, start ≠ end, read in `timeZone` | NEX-031 | Stage 1 build step |
| DeviceSync | `sync.ts` | Device registry row: platform web / android / ios / edge; pending, conflict and lost-write counts; `revokedAt` iff `revoked` | NEX-031 | Stage 1 build step |
| MergeRule / SyncConflict | `sync.ts` | Same merge rules as `@nexus/offline`; no payload (privacy) — `summaryKey` message key; `resolution` and `resolvedAt` iff resolved | NEX-031 | Stage 1 build step |
| CapabilityTier | `ai.ts` | fast / balanced / reasoning / embedding / multimodal (D24); features never name a vendor model | — | — |
| AiSettings | `ai.ts` | `piiRedaction` and `minorGuardianConsentRequired` always `true`; `blockedModules` always includes M61 + M83, which can never be switched on; M62 needs `safeguardingEnabled`; no API keys | NEX-031 | Stage 1 build step |
| AiCredit | `ai.ts` | Credits per period; under `hardCap`, `used` ≤ `granted` | NEX-031 | Stage 1 build step |
| AssistAnswer | `ai.ts` | `aiGenerated: true`; ≥ 1 source `{ moduleId, recordType, recordId, label }`; never cites M61 / M83 | NEX-031 | Stage 1 build step |
| KeyStatus | `vault.ts` | Key purpose, custody platform / BYOK / HYOK, state; metadata only, never key material | NEX-031 | Stage 1 build step |
| AccessRequest | `vault.ts` | Provider request: opaque `staffRef`, reason, unique modules, read / edit, 1–72 h; `decidedAt` + `decidedBy` iff not pending | NEX-031 | Stage 1 build step |
| AccessGrant | `vault.ts` | Window `endsAt` > `startsAt`, ≤ 72 h; optional early `revokedAt` | NEX-031 | Stage 1 build step |
| BreakGlassNotice | `vault.ts` | Legal order / security incident; exactly 2 distinct approvers; `notifiedAt` ≥ `occurredAt`; report link https or `/path` | NEX-031 | Stage 1 build step |
