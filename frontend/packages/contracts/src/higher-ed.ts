import { z } from "zod";
import { CapabilityTierSchema } from "./ai";
import { IdSchema, IsoDateSchema, NameSchema, UtcDateTimeSchema } from "./common";

/**
 * M42 higher-ed academics (NEX-219, D87) across credit systems (CBCS, ECTS, semester hours). A degree audit's verdict
 * follows from its numbers, and a person still confirms graduation (M22 / M86). AI degree-path advice is reviewed by an
 * advisor and never registers a learner (A-4); it cites its reasons (A-5).
 */

const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const CreditsSchema = z.number().min(0).max(300).multipleOf(0.5);

export const CreditSystemSchema = z.enum(["cbcs", "ects", "semester_hours", "custom"]);
export type CreditSystem = z.infer<typeof CreditSystemSchema>;

export const RequirementCategorySchema = z.enum([
  "core",
  "elective",
  "open_elective",
  "ability_enhancement",
  "skill",
  "project",
  "other",
]);
export type RequirementCategory = z.infer<typeof RequirementCategorySchema>;

export const ProgramRequirementSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    programId: IdSchema,
    name: NameSchema,
    category: RequirementCategorySchema,
    creditSystem: CreditSystemSchema,
    minCredits: CreditsSchema,
    maxCredits: CreditsSchema.nullable(),
    subjectIds: z.array(IdSchema).max(200).refine(isUnique, { message: "ids must be unique" }),
    /** AcademicCalendar id the rule applies from (D25). */
    effectiveFromYearId: IdSchema,
  })
  .refine((rule) => rule.maxCredits === null || rule.maxCredits >= rule.minCredits, {
    message: "maxCredits is below minCredits",
    path: ["maxCredits"],
  });
export type ProgramRequirement = z.infer<typeof ProgramRequirementSchema>;

export const RegistrationWindowSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    programId: IdSchema,
    yearLevelId: IdSchema.nullable(),
    academicYearId: IdSchema,
    periodId: IdSchema.nullable(),
    opensAt: UtcDateTimeSchema,
    closesAt: UtcDateTimeSchema,
    minCredits: CreditsSchema,
    maxCredits: CreditsSchema,
    status: z.enum(["draft", "open", "closed"]),
  })
  .refine((window) => Date.parse(window.closesAt) > Date.parse(window.opensAt), {
    message: "closesAt must be after opensAt",
    path: ["closesAt"],
  })
  .refine((window) => window.maxCredits >= window.minCredits, {
    message: "maxCredits is below minCredits",
    path: ["maxCredits"],
  });
export type RegistrationWindow = z.infer<typeof RegistrationWindowSchema>;

export const ElectiveRegistrationStatusSchema = z.enum([
  "submitted",
  "confirmed",
  "waitlisted",
  "rejected",
  "withdrawn",
]);
export type ElectiveRegistrationStatus = z.infer<typeof ElectiveRegistrationStatusSchema>;

const isDecided = (status: ElectiveRegistrationStatus) =>
  status === "confirmed" || status === "rejected";

export const ElectiveRegistrationSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    windowId: IdSchema,
    learnerId: IdSchema,
    choices: z
      .array(z.strictObject({ subjectOfferingId: IdSchema, priority: z.int().min(1).max(20) }))
      .min(1)
      .max(20),
    status: ElectiveRegistrationStatusSchema,
    decidedByStaffProfileId: IdSchema.nullable(),
    decidedAt: UtcDateTimeSchema.nullable(),
    /** Offline outbox client id. */
    clientId: z.uuid(),
    submittedAt: UtcDateTimeSchema,
  })
  .refine(
    (registration) => isUnique(registration.choices.map((choice) => choice.subjectOfferingId)),
    {
      message: "each offering is chosen once",
      path: ["choices"],
    },
  )
  .refine((registration) => isUnique(registration.choices.map((choice) => choice.priority)), {
    message: "priorities must be unique",
    path: ["choices"],
  })
  .refine(
    (registration) =>
      isDecided(registration.status) === (registration.decidedByStaffProfileId !== null) &&
      isDecided(registration.status) === (registration.decidedAt !== null),
    {
      message: "a person and a time are recorded exactly when the registration is decided",
      path: ["decidedByStaffProfileId"],
    },
  );
export type ElectiveRegistration = z.infer<typeof ElectiveRegistrationSchema>;

export const RequirementProgressSchema = z
  .strictObject({
    requirementId: IdSchema,
    creditsEarned: CreditsSchema,
    creditsRequired: CreditsSchema,
    satisfied: z.boolean(),
  })
  .refine((progress) => progress.satisfied === progress.creditsEarned >= progress.creditsRequired, {
    message: "satisfied does not match the credits",
    path: ["satisfied"],
  });
export type RequirementProgress = z.infer<typeof RequirementProgressSchema>;

export const DegreeAuditSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    programId: IdSchema,
    computedAt: UtcDateTimeSchema,
    creditsEarned: CreditsSchema,
    creditsRequired: CreditsSchema,
    gpa: z.number().min(0).nullable(),
    gpaScale: z.union([z.literal(4), z.literal(5), z.literal(10)]),
    requirements: z.array(RequirementProgressSchema).min(1).max(50),
    eligibleToGraduate: z.boolean(),
  })
  .refine((audit) => audit.gpa === null || audit.gpa <= audit.gpaScale, {
    message: "gpa is above its scale",
    path: ["gpa"],
  })
  .refine((audit) => isUnique(audit.requirements.map((item) => item.requirementId)), {
    message: "requirement ids must be unique",
    path: ["requirements"],
  })
  .refine(
    (audit) =>
      audit.eligibleToGraduate ===
      (audit.requirements.every((item) => item.satisfied) &&
        audit.creditsEarned >= audit.creditsRequired),
    {
      message: "eligibleToGraduate does not follow from the requirements and credits",
      path: ["eligibleToGraduate"],
    },
  );
export type DegreeAudit = z.infer<typeof DegreeAuditSchema>;

export const ThesisStageSchema = z.enum([
  "proposal",
  "in_progress",
  "submitted",
  "under_examination",
  "revisions",
  "accepted",
  "withdrawn",
]);
export type ThesisStage = z.infer<typeof ThesisStageSchema>;

export const ThesisSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    title: z.string().trim().min(1).max(300),
    supervisorStaffProfileIds: z
      .array(IdSchema)
      .min(1)
      .max(3)
      .refine(isUnique, { message: "ids must be unique" }),
    stage: ThesisStageSchema,
    milestones: z
      .array(
        z.strictObject({
          name: z.string().trim().min(1).max(200),
          dueOn: IsoDateSchema,
          completedOn: IsoDateSchema.nullable(),
        }),
      )
      .max(20),
    /** Personal data of a person outside the institution. */
    externalExaminerName: z.string().trim().min(1).max(200).nullable(),
    /** M32 originality signal. */
    originalitySignalId: IdSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((thesis) => Date.parse(thesis.updatedAt) >= Date.parse(thesis.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type Thesis = z.infer<typeof ThesisSchema>;

/** AI degree-path advice an advisor reviews; it never registers a learner. */
export const PathAdviceSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    aiGenerated: z.literal(true),
    tier: CapabilityTierSchema,
    suggestions: z
      .array(z.strictObject({ subjectId: IdSchema, reason: z.string().trim().min(1).max(300) }))
      .min(1)
      .max(10),
    warnings: z.array(z.string().trim().min(1).max(300)).max(5),
    status: z.enum(["draft", "reviewed"]),
    reviewedByStaffProfileId: IdSchema.nullable(),
    reviewedAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
  })
  .refine(
    (advice) =>
      (advice.status === "reviewed") === (advice.reviewedByStaffProfileId !== null) &&
      (advice.status === "reviewed") === (advice.reviewedAt !== null),
    {
      message: "a person and a time are recorded exactly when the advice is reviewed",
      path: ["reviewedByStaffProfileId"],
    },
  );
export type PathAdvice = z.infer<typeof PathAdviceSchema>;
