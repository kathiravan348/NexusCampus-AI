import { z } from "zod";
import { AcademicCodeSchema } from "./academics";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "./common";

/**
 * M30 LMS classrooms and courses (NEX-211, D87): the course space every Stage 4 teaching module plugs into.
 *
 * Server checks (not expressible per record): module order is unique within a space; prerequisites are modules of the
 * same space and form no cycle; an item's `refId` points to a record of the item's kind (content item, assignment,
 * test, live session, discussion thread) in the same tenant; staff profiles and class groups belong to the space's
 * institution; a class space's offering belongs to its academic year.
 */

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
const title = z.string().trim().min(1).max(200);
const httpsUrl = z.url({ protocol: /^https$/ });

export const CourseSpaceKindSchema = z.enum(["class", "course", "community"]);
export type CourseSpaceKind = z.infer<typeof CourseSpaceKindSchema>;

export const CourseSpaceStatusSchema = z.enum(["draft", "published", "archived"]);
export type CourseSpaceStatus = z.infer<typeof CourseSpaceStatusSchema>;

/** A class space follows one subject offering; a course stands alone and may allow self-enrolment. */
export const CourseSpaceSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    kind: CourseSpaceKindSchema,
    /** Set exactly when `kind` is `class`. */
    subjectOfferingId: IdSchema.nullable(),
    code: AcademicCodeSchema,
    title,
    summary: z.string().trim().max(2000).nullable(),
    /** AcademicCalendar id; null for rolling courses and communities. */
    academicYearId: IdSchema.nullable(),
    staffProfileIds: uniqueIds(20).min(1),
    classGroupIds: uniqueIds(20),
    status: CourseSpaceStatusSchema,
    startsOn: IsoDateSchema.nullable(),
    endsOn: IsoDateSchema.nullable(),
    /** Only a `course` may let learners enrol themselves. */
    selfEnrol: z.boolean(),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine((space) => (space.kind === "class") === (space.subjectOfferingId !== null), {
    message: "subjectOfferingId is set exactly for a class space",
    path: ["subjectOfferingId"],
  })
  .refine((space) => space.kind !== "class" || space.academicYearId !== null, {
    message: "a class space belongs to an academic year",
    path: ["academicYearId"],
  })
  .refine((space) => !space.selfEnrol || space.kind === "course", {
    message: "only a course allows self-enrolment",
    path: ["selfEnrol"],
  })
  .refine(
    (space) => space.startsOn === null || space.endsOn === null || space.endsOn >= space.startsOn,
    { message: "endsOn is before startsOn", path: ["endsOn"] },
  );
export type CourseSpace = z.infer<typeof CourseSpaceSchema>;

export const CourseModuleSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    courseSpaceId: IdSchema,
    title,
    order: z.int().min(1),
    unlockOn: IsoDateSchema.nullable(),
    prerequisiteModuleIds: uniqueIds(10),
    outcomeIds: uniqueIds(20),
  })
  .refine((courseModule) => !courseModule.prerequisiteModuleIds.includes(courseModule.id), {
    message: "a module cannot be its own prerequisite",
    path: ["prerequisiteModuleIds"],
  });
export type CourseModule = z.infer<typeof CourseModuleSchema>;

export const CourseItemKindSchema = z.enum([
  "page",
  "file",
  "link",
  "content",
  "assignment",
  "test",
  "live_session",
  "discussion",
]);
export type CourseItemKind = z.infer<typeof CourseItemKindSchema>;

export const CourseCompletionSchema = z.enum(["none", "view", "submit", "pass"]);
export type CourseCompletion = z.infer<typeof CourseCompletionSchema>;

const referencedKinds: ReadonlySet<CourseItemKind> = new Set([
  "content",
  "assignment",
  "test",
  "live_session",
  "discussion",
]);

const passableKinds: ReadonlySet<CourseItemKind> = new Set(["test", "content", "assignment"]);

export const CourseItemSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    moduleId: IdSchema,
    kind: CourseItemKindSchema,
    title,
    order: z.int().min(1),
    /** The record this item shows; required for content, assignment, test, live session and discussion items. */
    refId: IdSchema.nullable(),
    /** Set exactly for `link` items; https only. */
    url: httpsUrl.nullable(),
    required: z.boolean(),
    completion: CourseCompletionSchema,
    /** Set exactly when `completion` is `pass`. */
    passMarkBps: z.int().min(1).max(10000).nullable(),
    dueAt: UtcDateTimeSchema.nullable(),
    published: z.boolean(),
  })
  .refine((item) => referencedKinds.has(item.kind) === (item.refId !== null), {
    message:
      "refId is set exactly for content, assignment, test, live session and discussion items",
    path: ["refId"],
  })
  .refine((item) => (item.kind === "link") === (item.url !== null), {
    message: "url is set exactly for link items",
    path: ["url"],
  })
  .refine(
    (item) =>
      (item.completion !== "submit" || item.kind === "assignment") &&
      (item.completion !== "pass" || passableKinds.has(item.kind)),
    {
      message:
        "submit completion needs an assignment; pass needs a test, content or assignment item",
      path: ["completion"],
    },
  )
  .refine((item) => (item.completion === "pass") === (item.passMarkBps !== null), {
    message: "passMarkBps is set exactly when completion is pass",
    path: ["passMarkBps"],
  });
export type CourseItem = z.infer<typeof CourseItemSchema>;

export const CourseProgressSchema = z.strictObject({
  tenantId: IdSchema,
  courseSpaceId: IdSchema,
  learnerId: IdSchema,
  completedItemIds: z.array(IdSchema).refine(isUnique, { message: "ids must be unique" }),
  percentBps: z.int().min(0).max(10000),
  lastActivityAt: UtcDateTimeSchema.nullable(),
});
export type CourseProgress = z.infer<typeof CourseProgressSchema>;

export const DiscussionThreadSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  courseSpaceId: IdSchema,
  title,
  authorProfileId: IdSchema,
  pinned: z.boolean(),
  locked: z.boolean(),
  postCount: z.int().min(0),
  lastPostAt: UtcDateTimeSchema.nullable(),
  createdAt: UtcDateTimeSchema,
});
export type DiscussionThread = z.infer<typeof DiscussionThreadSchema>;

const postBody = z.string().trim().min(1).max(5000);

/** Client input for posting a top-level or nested reply to a discussion thread (M30, L2). */
export const DiscussionPostInputSchema = z.strictObject({
  parentPostId: IdSchema.nullable(),
  body: postBody,
});
export type DiscussionPostInput = z.infer<typeof DiscussionPostInputSchema>;

/** A post body is personal data of its author; a moderator may hide it. */
export const DiscussionPostSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    threadId: IdSchema,
    parentPostId: IdSchema.nullable(),
    authorProfileId: IdSchema,
    body: postBody,
    hidden: z.boolean(),
    hiddenByProfileId: IdSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    editedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((post) => post.parentPostId !== post.id, {
    message: "a post cannot reply to itself",
    path: ["parentPostId"],
  })
  .refine((post) => post.hidden === (post.hiddenByProfileId !== null), {
    message: "hiddenByProfileId is set exactly when the post is hidden",
    path: ["hiddenByProfileId"],
  })
  .refine(
    (post) => post.editedAt === null || Date.parse(post.editedAt) >= Date.parse(post.createdAt),
    {
      message: "editedAt is before createdAt",
      path: ["editedAt"],
    },
  );
export type DiscussionPost = z.infer<typeof DiscussionPostSchema>;
