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
