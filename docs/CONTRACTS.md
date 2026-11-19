# Contracts map

> One line per contract: name → file → mock → endpoint(s). Update in the same task that adds or changes a contract.
> All contracts live in `frontend/packages/contracts/src/`; every object is strict (unknown keys rejected).

| Contract | File | Rules worth knowing | Mock | Endpoint |
|---|---|---|---|---|
| Id, UtcDateTime, IsoDate, Locale, TimeZone, CurrencyCode, CountryCode, MinorUnits, Region, InstitutionType, ModuleId, DisplayCalendar, Name | `common.ts` | Times in UTC with `Z`; locale canonical BCP 47 (`en-IN`, not `en_IN`); IANA zones incl. `UTC`; ISO 4217 / 3166 codes; money = integer minor units | — | — |
| ApiError | `error.ts` | `{ error: { code, message, details?, requestId? } }`; codes `invalid_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `module_disabled`, `rate_limited`, `internal` | NEX-010 | every non-2xx response |
| Page / PageQuery | `page.ts` | `{ items, total, page, pageSize }` (D15); page ≥ 1, pageSize 1–200 (default 50) | NEX-010 | every list endpoint |
| DomainEvent | `event.ts` | Envelope for audit, notifications, webhooks, analytics, sync; `eventType` = `<module>.<entity>.<action>` starting with its `moduleId` | NEX-010 | Stage 1 build step |
| LocaleSettings | `tenancy.ts` | default locale ∈ supported; weekend days 0–6 (Sunday = 0), unique | NEX-010 | Stage 1 build step |
| Group | `tenancy.ts` | A group is the tenant; its institutions share its `tenantId` | NEX-010 | Stage 1 build step |
| Institution | `tenancy.ts` | `groupId` null = standalone tenant; status active / trial / suspended | NEX-010 | Stage 1 build step |
| Campus | `tenancy.ts` | `code` A–Z 0–9 -; `timeZone` null = institution's zone; organisation address | NEX-010 | Stage 1 build step |
| InstitutionTypeProfile | `tenancy.ts` | Defaults per type; `terminologyPack` = its own type; unique module ids | NEX-010 | Stage 1 build step |
| AcademicCalendar | `calendar.ts` | Periods inside the year, not overlapping; holidays inside the year; `displayCalendar` for G-3 | NEX-010 | Stage 1 build step |
