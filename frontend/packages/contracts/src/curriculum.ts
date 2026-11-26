import { z } from "zod";
import { AcademicCodeSchema } from "./academics";
import { IdSchema, IsoDateSchema, NameSchema, UtcDateTimeSchema } from "./common";

/**
 * M29 curriculum and lesson planning (NEX-210, D87).
 *
 * Server checks (not expressible per record): outcome codes are unique per framework; a parent outcome belongs to the
 * same framework and parents form no cycle; mappings run from a `course_outcomes` outcome to a `program_outcomes`
 * outcome; a lesson plan's topics belong to the syllabus of its offering's subject; a lesson plan drafted by AI
 * (`source: "ai_draft"`) is only ever saved by a person (A-4).
 */

/** Outcome codes, including CASE codes such as `CCSS.MATH.5.NBT.A.1`, `CO3` or `PO-12`. */
export const OutcomeCodeSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
export type OutcomeCode = z.infer<typeof OutcomeCodeSchema>;

const timestamps = {
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
};
const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};
const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const uniqueIds = (max: number) =>
  z.array(IdSchema).max(max).refine(isUnique, { message: "ids must be unique" });
const text = (max: number) => z.string().trim().max(max);

export const OutcomeFrameworkKindSchema = z.enum([
  "standards",
  "course_outcomes",
  "program_outcomes",
  "milestones",
  "skills",
]);
export type OutcomeFrameworkKind = z.infer<typeof OutcomeFrameworkKindSchema>;

export const OutcomeFrameworkSourceSchema = z.enum(["local", "case_import"]);
export type OutcomeFrameworkSource = z.infer<typeof OutcomeFrameworkSourceSchema>;

export const OutcomeFrameworkSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    /** Null = shared by every institution of the group. */
    institutionId: IdSchema.nullable(),
    code: AcademicCodeSchema,
    name: NameSchema,
    kind: OutcomeFrameworkKindSchema,
    source: OutcomeFrameworkSourceSchema,
    /** The CASE document the framework was imported from; set exactly when `source` is `case_import`. */
    caseDocumentUri: z.url({ protocol: /^https$/ }).nullable(),
    version: z.string().trim().min(1).max(32),
    active: z.boolean(),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine(
    (framework) => (framework.source === "case_import") === (framework.caseDocumentUri !== null),
    {
      message: "caseDocumentUri is set exactly when source is case_import",
      path: ["caseDocumentUri"],
    },
  );
export type OutcomeFramework = z.infer<typeof OutcomeFrameworkSchema>;

export const OutcomeSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    frameworkId: IdSchema,
    parentId: IdSchema.nullable(),
    code: OutcomeCodeSchema,
    statement: z.string().trim().min(1).max(2000),
    order: z.int().min(1),
    /** CASE item identifier when imported. */
    caseItemId: z.guid().nullable(),
    subjectIds: uniqueIds(20),
    yearLevelIds: uniqueIds(20),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine((outcome) => outcome.parentId !== outcome.id, {
    message: "an outcome cannot be its own parent",
    path: ["parentId"],
  });
export type Outcome = z.infer<typeof OutcomeSchema>;

/** Course outcome → program outcome correlation (OBE): 1 low, 2 medium, 3 high. */
export const OutcomeMappingSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    fromOutcomeId: IdSchema,
    toOutcomeId: IdSchema,
    strength: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    createdAt: UtcDateTimeSchema,
  })
  .refine((mapping) => mapping.fromOutcomeId !== mapping.toOutcomeId, {
    message: "an outcome cannot map to itself",
    path: ["toOutcomeId"],
  });
export type OutcomeMapping = z.infer<typeof OutcomeMappingSchema>;

export const SyllabusTopicSchema = z.strictObject({
  id: IdSchema,
  title: z.string().trim().min(1).max(200),
  order: z.int().min(1),
  outcomeIds: uniqueIds(20),
});
export type SyllabusTopic = z.infer<typeof SyllabusTopicSchema>;

export const SyllabusUnitSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    subjectId: IdSchema,
    yearLevelId: IdSchema.nullable(),
    code: AcademicCodeSchema,
    title: z.string().trim().min(1).max(200),
    order: z.int().min(1),
    plannedHours: z.number().min(0).max(500).multipleOf(0.5).nullable(),
    outcomeIds: uniqueIds(50),
    topics: z.array(SyllabusTopicSchema).min(1).max(100),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine((unit) => isUnique(unit.topics.map((topic) => topic.id)), {
    message: "topic ids must be unique",
    path: ["topics"],
  })
  .refine((unit) => isUnique(unit.topics.map((topic) => topic.order)), {
    message: "topic orders must be unique",
    path: ["topics"],
  });
export type SyllabusUnit = z.infer<typeof SyllabusUnitSchema>;

export const LessonActivityKindSchema = z.enum([
  "intro",
  "instruction",
  "practice",
  "discussion",
  "assessment",
  "other",
]);
export type LessonActivityKind = z.infer<typeof LessonActivityKindSchema>;

export const LessonActivitySchema = z.strictObject({
  order: z.int().min(1),
  title: z.string().trim().min(1).max(200),
  minutes: z.int().min(1).max(600),
  kind: LessonActivityKindSchema,
});
export type LessonActivity = z.infer<typeof LessonActivitySchema>;

export const LessonPlanStatusSchema = z.enum([
  "draft",
  "submitted",
  "approved",
  "returned",
  "delivered",
]);
export type LessonPlanStatus = z.infer<typeof LessonPlanStatusSchema>;

/** `ai_draft` marks a plan drafted by the AI helper; a person always reviews and saves it. */
export const LessonPlanSourceSchema = z.enum(["manual", "ai_draft"]);
export type LessonPlanSource = z.infer<typeof LessonPlanSourceSchema>;

const lessonPlanInputFields = {
  subjectOfferingId: IdSchema,
  staffProfileId: IdSchema,
  date: IsoDateSchema.nullable(),
  timetableSlotId: IdSchema.nullable(),
  title: z.string().trim().min(1).max(200),
  topicIds: uniqueIds(20).min(1),
  outcomeIds: uniqueIds(20),
  objectives: text(2000),
  activities: z
    .array(LessonActivitySchema)
    .max(30)
    .refine((activities) => isUnique(activities.map((activity) => activity.order)), {
      message: "activity orders must be unique",
    }),
  resources: text(2000),
  source: LessonPlanSourceSchema,
};

/** Input for creating or editing a lesson plan; id, tenant, status, review and timestamps are server-set. */
export const LessonPlanInputSchema = z.strictObject(lessonPlanInputFields);
export type LessonPlanInput = z.infer<typeof LessonPlanInputSchema>;

/** Review state per status: approved / returned plans carry it, drafts and submissions do not, delivered keeps it if any. */
const reviewRule: Record<LessonPlanStatus, "required" | "forbidden" | "optional"> = {
  draft: "forbidden",
  submitted: "forbidden",
  approved: "required",
  returned: "required",
  delivered: "optional",
};

export const LessonPlanSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    ...lessonPlanInputFields,
    status: LessonPlanStatusSchema,
    reviewedByStaffProfileId: IdSchema.nullable(),
    reviewedAt: UtcDateTimeSchema.nullable(),
    reviewNote: z.string().trim().min(1).max(1000).nullable(),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine(
    (plan) => {
      const reviewed = plan.reviewedByStaffProfileId !== null;
      if (reviewed !== (plan.reviewedAt !== null)) return false;
      const rule = reviewRule[plan.status];
      return rule === "optional" || reviewed === (rule === "required");
    },
    {
      message:
        "reviewer and review time are set together: required when approved or returned, absent on drafts and submissions",
      path: ["reviewedByStaffProfileId"],
    },
  )
  .refine((plan) => plan.status !== "returned" || plan.reviewNote !== null, {
    message: "a returned plan needs a review note",
    path: ["reviewNote"],
  });
export type LessonPlan = z.infer<typeof LessonPlanSchema>;

export const CoverageStatusSchema = z.enum(["not_started", "in_progress", "covered"]);
export type CoverageStatus = z.infer<typeof CoverageStatusSchema>;

export const CoverageEntrySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    subjectOfferingId: IdSchema,
    topicId: IdSchema,
    status: CoverageStatusSchema,
    coveredOn: IsoDateSchema.nullable(),
    lessonPlanId: IdSchema.nullable(),
    updatedAt: UtcDateTimeSchema,
  })
  .refine((entry) => (entry.status === "covered") === (entry.coveredOn !== null), {
    message: "coveredOn is set exactly when the topic is covered",
    path: ["coveredOn"],
  });
export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;

/** Coverage of one offering's syllabus; `percentBps` = round(covered × 10000 / total), 0 when there are no topics. */
export const SyllabusCoverageSchema = z
  .strictObject({
    subjectOfferingId: IdSchema,
    topicsTotal: z.int().min(0),
    topicsCovered: z.int().min(0),
    percentBps: z.int().min(0).max(10000),
  })
  .refine((coverage) => coverage.topicsCovered <= coverage.topicsTotal, {
    message: "topicsCovered is more than topicsTotal",
    path: ["topicsCovered"],
  })
  .refine(
    (coverage) =>
      coverage.percentBps ===
      (coverage.topicsTotal === 0
        ? 0
        : Math.round((coverage.topicsCovered * 10000) / coverage.topicsTotal)),
    { message: "percentBps does not match the topic counts", path: ["percentBps"] },
  );
export type SyllabusCoverage = z.infer<typeof SyllabusCoverageSchema>;
