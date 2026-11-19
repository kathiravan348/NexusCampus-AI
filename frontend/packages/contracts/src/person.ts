import { z } from "zod";
import {
  EmailSchema,
  IdSchema,
  IsoDateSchema,
  LocaleSchema,
  NameSchema,
  PhoneE164Schema,
  RetentionStateSchema,
  UtcDateTimeSchema,
} from "./common";

const notBefore = (from: string, to: string) => Date.parse(to) >= Date.parse(from);

/**
 * One human being in a tenant (D25): identity and contact only. What the person *is* to an institution
 * (staff, guardian, learner …) lives in `RoleProfile`, so a teacher who is also a parent is one `Person`.
 * Personal data of minors is masked by the service unless the viewer's role may see it (G-6).
 */
export const PersonSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    legalName: NameSchema,
    preferredName: NameSchema.nullable(),
    dateOfBirth: IsoDateSchema.nullable(),
    isMinor: z.boolean(),
    email: EmailSchema.nullable(),
    phone: PhoneE164Schema.nullable(),
    preferredLocale: LocaleSchema.nullable(),
    retentionState: RetentionStateSchema,
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((p) => notBefore(p.createdAt, p.updatedAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type Person = z.infer<typeof PersonSchema>;

export const RoleProfileKindSchema = z.enum(["staff", "guardian", "learner", "alumni", "external"]);
export type RoleProfileKind = z.infer<typeof RoleProfileKindSchema>;

export const RoleProfileStatusSchema = z.enum(["active", "inactive", "suspended"]);
export type RoleProfileStatus = z.infer<typeof RoleProfileStatusSchema>;

/**
 * A person's membership of an institution (D25), optionally scoped to a campus and academic year.
 * `effectiveTo` null = open-ended.
 */
export const RoleProfileSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    personId: IdSchema,
    institutionId: IdSchema,
    campusId: IdSchema.nullable(),
    kind: RoleProfileKindSchema,
    academicYearId: IdSchema.nullable(),
    effectiveFrom: IsoDateSchema,
    effectiveTo: IsoDateSchema.nullable(),
    status: RoleProfileStatusSchema,
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((r) => r.effectiveTo === null || notBefore(r.effectiveFrom, r.effectiveTo), {
    message: "effectiveTo is before effectiveFrom",
    path: ["effectiveTo"],
  })
  .refine((r) => notBefore(r.createdAt, r.updatedAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type RoleProfile = z.infer<typeof RoleProfileSchema>;
