import { z } from "zod";
import {
  CountryCodeSchema,
  CurrencyCodeSchema,
  IdSchema,
  InstitutionTypeSchema,
  LocaleSchema,
  ModuleIdSchema,
  NameSchema,
  RegionSchema,
  TimeZoneSchema,
  UtcDateTimeSchema,
} from "./common";

const hasNoDuplicates = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Day of week: 0 = Sunday … 6 = Saturday (as `Date.getDay()`). */
const WeekdaySchema = z.int().min(0).max(6);

/** How an institution reads and writes dates, money and languages (G-1, G-2). */
export const LocaleSettingsSchema = z
  .strictObject({
    defaultLocale: LocaleSchema,
    supportedLocales: z.array(LocaleSchema).min(1),
    timeZone: TimeZoneSchema,
    currency: CurrencyCodeSchema,
    country: CountryCodeSchema,
    weekendDays: z.array(WeekdaySchema).max(7),
  })
  .refine((s) => s.supportedLocales.includes(s.defaultLocale), {
    message: "supportedLocales must include defaultLocale",
    path: ["supportedLocales"],
  })
  .refine((s) => hasNoDuplicates(s.supportedLocales), {
    message: "supportedLocales has duplicates",
    path: ["supportedLocales"],
  })
  .refine((s) => hasNoDuplicates(s.weekendDays), {
    message: "weekendDays has duplicates",
    path: ["weekendDays"],
  });
export type LocaleSettings = z.infer<typeof LocaleSettingsSchema>;

const notBefore = (created: string, updated: string) => updated >= created;

/**
 * A multi-campus group or chain (E-6). The group is the tenant: its institutions share its `tenantId`.
 */
export const GroupSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    name: NameSchema,
    region: RegionSchema,
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((g) => notBefore(g.createdAt, g.updatedAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type Group = z.infer<typeof GroupSchema>;

export const InstitutionStatusSchema = z.enum(["active", "trial", "suspended"]);
export type InstitutionStatus = z.infer<typeof InstitutionStatusSchema>;

/**
 * One institution (M01). Standalone: its own tenant, `groupId` null. In a group: `groupId` set and
 * `tenantId` equal to the group's (checked by the server, not by this schema).
 */
export const InstitutionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    groupId: IdSchema.nullable(),
    name: NameSchema,
    type: InstitutionTypeSchema,
    region: RegionSchema,
    locale: LocaleSettingsSchema,
    status: InstitutionStatusSchema,
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((i) => notBefore(i.createdAt, i.updatedAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type Institution = z.infer<typeof InstitutionSchema>;

/** Postal address of a campus (an organisation's address, not personal data). */
export const AddressSchema = z.strictObject({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  /** State, province or emirate. */
  region: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  countryCode: CountryCodeSchema,
});
export type Address = z.infer<typeof AddressSchema>;

/** A campus of an institution. `timeZone` null = the institution's time zone. */
export const CampusSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  institutionId: IdSchema,
  code: z.string().regex(/^[A-Z0-9-]{1,16}$/, { message: "Use A–Z, 0–9 and -, at most 16" }),
  name: NameSchema,
  timeZone: TimeZoneSchema.nullable(),
  address: AddressSchema,
});
export type Campus = z.infer<typeof CampusSchema>;

export const AcademicStructureSchema = z.enum(["terms", "semesters", "trimesters", "rolling"]);
export type AcademicStructure = z.infer<typeof AcademicStructureSchema>;

/** Defaults a new institution of a type starts from (REQUIREMENTS §3); the institution can change all of it. */
export const InstitutionTypeProfileSchema = z
  .strictObject({
    type: InstitutionTypeSchema,
    defaultModules: z.array(ModuleIdSchema).min(1),
    structure: AcademicStructureSchema,
    gradingScheme: IdSchema,
    terminologyPack: InstitutionTypeSchema,
  })
  .refine((p) => hasNoDuplicates(p.defaultModules), {
    message: "defaultModules has duplicates",
    path: ["defaultModules"],
  })
  .refine((p) => p.terminologyPack === p.type, {
    message: "terminologyPack must be the profile's own type",
    path: ["terminologyPack"],
  });
export type InstitutionTypeProfile = z.infer<typeof InstitutionTypeProfileSchema>;
