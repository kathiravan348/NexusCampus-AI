import { z } from "zod";
import {
  IdSchema,
  IsoDateSchema,
  LocaleSchema,
  NameSchema,
  PhoneE164Schema,
  UtcDateTimeSchema,
} from "./common";
import { AddressSchema } from "./tenancy";

const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};
const hasUniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length;

export const GuardianRelationshipKindSchema = z.enum([
  "mother",
  "father",
  "parent",
  "step_parent",
  "grandparent",
  "legal_guardian",
  "foster_carer",
  "adult_sibling",
  "other",
]);
export type GuardianRelationshipKind = z.infer<typeof GuardianRelationshipKindSchema>;

export const PickupRightSchema = z.enum(["allowed", "not_allowed", "court_restricted"]);
export type PickupRight = z.infer<typeof PickupRightSchema>;

/**
 * Extends the Stage 1 guardian link used for sign-in scoping (M02).
 * The Stage 3 build keeps the records in step.
 */
export const GuardianRelationshipSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    guardianPersonId: IdSchema,
    learnerPersonId: IdSchema,
    kind: GuardianRelationshipKindSchema,
    parentalResponsibility: z.boolean(),
    livesWithLearner: z.boolean(),
    contactPriority: z.int().min(1).max(10),
    pickupRight: PickupRightSchema,
    /** Personal data (V-7). */
    courtOrderNote: z.string().trim().min(1).max(500).nullable(),
    effectiveFrom: IsoDateSchema,
    effectiveTo: IsoDateSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((relationship) => relationship.guardianPersonId !== relationship.learnerPersonId, {
    message: "guardianPersonId and learnerPersonId must differ",
    path: ["guardianPersonId"],
  })
  .refine(
    (relationship) =>
      (relationship.courtOrderNote !== null) === (relationship.pickupRight === "court_restricted"),
    {
      message: "courtOrderNote is set exactly when pickupRight is court_restricted",
      path: ["courtOrderNote"],
    },
  )
  .refine(
    (relationship) =>
      relationship.effectiveTo === null || relationship.effectiveTo >= relationship.effectiveFrom,
    {
      message: "effectiveTo is before effectiveFrom",
      path: ["effectiveTo"],
    },
  )
  .refine(validTimestampOrder, timestampOrderIssue);
export type GuardianRelationship = z.infer<typeof GuardianRelationshipSchema>;

export const HouseholdSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    name: NameSchema,
    /** A household's home address is personal data (V-7). */
    address: AddressSchema.nullable(),
    learnerPersonIds: z.array(IdSchema).min(1).max(20).refine(hasUniqueIds, {
      message: "learnerPersonIds must be unique",
    }),
    guardianPersonIds: z.array(IdSchema).max(10).refine(hasUniqueIds, {
      message: "guardianPersonIds must be unique",
    }),
    primaryLanguage: LocaleSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Household = z.infer<typeof HouseholdSchema>;

/** A non-guardian authorised to collect a learner during the specified validity window. */
export const AuthorisedPickupSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerPersonId: IdSchema,
    name: NameSchema,
    phone: PhoneE164Schema,
    relationshipLabel: z.string().trim().min(1).max(60),
    validFrom: IsoDateSchema,
    validTo: IsoDateSchema.nullable(),
    addedByPersonId: IdSchema,
    createdAt: UtcDateTimeSchema,
  })
  .refine((pickup) => pickup.validTo === null || pickup.validTo >= pickup.validFrom, {
    message: "validTo is before validFrom",
    path: ["validTo"],
  });
export type AuthorisedPickup = z.infer<typeof AuthorisedPickupSchema>;
