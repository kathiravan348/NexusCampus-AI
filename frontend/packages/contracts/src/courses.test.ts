import { describe, expect, it } from "vitest";
import {
  CourseItemSchema,
  CourseModuleSchema,
  CourseProgressSchema,
  CourseSpaceSchema,
  DiscussionPostSchema,
  DiscussionThreadSchema,
  type CourseItem,
  type CourseItemKind,
  type CourseModule,
  type CourseProgress,
  type CourseSpace,
  type DiscussionPost,
  type DiscussionThread,
} from "./index";

const timestamps = { createdAt: "2026-06-01T08:00:00Z", updatedAt: "2026-06-02T08:00:00Z" };

const classSpace: CourseSpace = {
  ...timestamps,
  id: "space-5a-maths",
  tenantId: "tenant-school",
  institutionId: "institution-school",
  kind: "class",
  subjectOfferingId: "offering-5a-maths",
  code: "G5A-MATHS",
  title: "Grade 5 A — Mathematics",
  summary: null,
  academicYearId: "calendar-2026",
  staffProfileIds: ["staff-maths"],
  classGroupIds: ["class-5a"],
  status: "published",
  startsOn: "2026-06-15",
  endsOn: "2027-03-31",
  selfEnrol: false,
};
const heCourse: CourseSpace = {
  ...classSpace,
  id: "space-cs101",
  tenantId: "tenant-university",
  institutionId: "institution-university",
  kind: "course",
  subjectOfferingId: null,
  code: "CS-101",
  title: "Introduction to Computing",
  summary: "Programs, data and the machine.",
  staffProfileIds: ["staff-lecturer", "staff-ta"],
  classGroupIds: ["cohort-bsc-cs-1"],
};
const onlineCourse: CourseSpace = {
  ...heCourse,
  id: "space-python-basics",
  tenantId: "tenant-academy",
  institutionId: "institution-academy",
  code: "PY-BASICS",
  title: "Python basics (self-paced)",
  academicYearId: null,
  classGroupIds: [],
  startsOn: null,
  endsOn: null,
  selfEnrol: true,
};
const courseModule: CourseModule = {
  id: "module-fractions",
  tenantId: "tenant-school",
  courseSpaceId: classSpace.id,
  title: "Fractions",
  order: 3,
  unlockOn: "2026-07-01",
  prerequisiteModuleIds: ["module-place-value"],
  outcomeIds: ["outcome-number-a1"],
};
const item: CourseItem = {
  id: "item-strips-lesson",
  tenantId: "tenant-school",
  moduleId: courseModule.id,
  kind: "content",
  title: "Fraction strips lesson",
  order: 1,
  refId: "content-fraction-strips",
  url: null,
  required: true,
  completion: "view",
  passMarkBps: null,
  dueAt: null,
  published: true,
};
const progress: CourseProgress = {
  tenantId: "tenant-school",
  courseSpaceId: classSpace.id,
  learnerId: "learner-aarav",
  completedItemIds: [item.id],
  percentBps: 2500,
  lastActivityAt: "2026-07-02T09:30:00Z",
};
const thread: DiscussionThread = {
  id: "thread-homework-help",
  tenantId: "tenant-school",
  courseSpaceId: classSpace.id,
  title: "Homework help",
  authorProfileId: "staff-maths",
  pinned: true,
  locked: false,
  postCount: 2,
  lastPostAt: "2026-07-02T10:00:00Z",
  createdAt: timestamps.createdAt,
};
const post: DiscussionPost = {
  id: "post-1",
  tenantId: "tenant-school",
  threadId: thread.id,
  parentPostId: null,
  authorProfileId: "learner-aarav",
  body: "Is 2/4 the same as 1/2?",
  hidden: false,
  hiddenByProfileId: null,
  createdAt: "2026-07-02T09:55:00Z",
  editedAt: null,
};

describe("course spaces", () => {
  it("accepts a K12 class space, an HE course and an online self-enrol course", () => {
    for (const space of [classSpace, heCourse, onlineCourse]) {
      expect(CourseSpaceSchema.safeParse(space).success).toBe(true);
    }
    expect(CourseSpaceSchema.safeParse({ ...heCourse, kind: "community" }).success).toBe(true);
  });

  it("rejects bad spaces", () => {
    expect(CourseSpaceSchema.safeParse({ ...classSpace, extra: 1 }).success).toBe(false);
    expect(CourseSpaceSchema.safeParse({ ...classSpace, selfEnrol: true }).success).toBe(false);
    expect(CourseSpaceSchema.safeParse({ ...onlineCourse, kind: "community" }).success).toBe(false);
    expect(CourseSpaceSchema.safeParse({ ...classSpace, subjectOfferingId: null }).success).toBe(
      false,
    );
    expect(
      CourseSpaceSchema.safeParse({ ...heCourse, subjectOfferingId: "offering-x" }).success,
    ).toBe(false);
    expect(CourseSpaceSchema.safeParse({ ...classSpace, endsOn: "2026-06-01" }).success).toBe(
      false,
    );
    expect(CourseSpaceSchema.safeParse({ ...classSpace, staffProfileIds: [] }).success).toBe(false);
    expect(CourseSpaceSchema.safeParse({ ...classSpace, classGroupIds: ["a", "a"] }).success).toBe(
      false,
    );
    expect(CourseSpaceSchema.safeParse({ ...classSpace, code: "G5 A" }).success).toBe(false);
    expect(
      CourseSpaceSchema.safeParse({ ...classSpace, updatedAt: "2026-05-01T08:00:00Z" }).success,
    ).toBe(false);
  });
});

describe("course modules", () => {
  it("accepts a module with a prerequisite", () => {
    expect(CourseModuleSchema.safeParse(courseModule).success).toBe(true);
  });

  it("rejects a self-prerequisite and bad orders", () => {
    const selfPrerequisite = { ...courseModule, prerequisiteModuleIds: [courseModule.id] };
    expect(CourseModuleSchema.safeParse(selfPrerequisite).success).toBe(false);
    expect(CourseModuleSchema.safeParse({ ...courseModule, order: 0 }).success).toBe(false);
    expect(
      CourseModuleSchema.safeParse({ ...courseModule, prerequisiteModuleIds: ["m", "m"] }).success,
    ).toBe(false);
  });
});

describe("course items", () => {
  const byKind: Record<CourseItemKind, CourseItem> = {
    page: { ...item, kind: "page", refId: null },
    file: { ...item, kind: "file", refId: null },
    link: { ...item, kind: "link", refId: null, url: "https://www.example.org/fractions" },
    content: item,
    assignment: {
      ...item,
      kind: "assignment",
      refId: "assignment-1",
      completion: "submit",
      dueAt: "2026-07-10T18:00:00Z",
    },
    test: { ...item, kind: "test", refId: "test-1", completion: "pass", passMarkBps: 6000 },
    live_session: {
      ...item,
      kind: "live_session",
      refId: "live-1",
      required: false,
      completion: "none",
    },
    discussion: { ...item, kind: "discussion", refId: thread.id, published: false },
  };

  it("accepts every item kind", () => {
    for (const value of Object.values(byKind)) {
      expect(CourseItemSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects missing or extra references, http links and pass without mark", () => {
    expect(CourseItemSchema.safeParse({ ...byKind.link, url: null }).success).toBe(false);
    expect(
      CourseItemSchema.safeParse({ ...byKind.link, url: "http://www.example.org/" }).success,
    ).toBe(false);
    expect(
      CourseItemSchema.safeParse({ ...byKind.page, url: "https://www.example.org/" }).success,
    ).toBe(false);
    expect(CourseItemSchema.safeParse({ ...byKind.page, refId: "content-1" }).success).toBe(false);
    expect(CourseItemSchema.safeParse({ ...byKind.test, refId: null }).success).toBe(false);
    expect(CourseItemSchema.safeParse({ ...byKind.test, passMarkBps: null }).success).toBe(false);
    expect(CourseItemSchema.safeParse({ ...item, passMarkBps: 5000 }).success).toBe(false);
    expect(CourseItemSchema.safeParse({ ...byKind.test, passMarkBps: 10001 }).success).toBe(false);
  });
});

describe("progress and discussions", () => {
  it("accepts progress, a thread, a reply and a hidden post", () => {
    expect(CourseProgressSchema.safeParse(progress).success).toBe(true);
    expect(DiscussionThreadSchema.safeParse(thread).success).toBe(true);
    expect(DiscussionPostSchema.safeParse(post).success).toBe(true);
    const reply = {
      ...post,
      id: "post-2",
      parentPostId: post.id,
      authorProfileId: "staff-maths",
      editedAt: "2026-07-02T10:05:00Z",
    };
    expect(DiscussionPostSchema.safeParse(reply).success).toBe(true);
    expect(
      DiscussionPostSchema.safeParse({ ...post, hidden: true, hiddenByProfileId: "staff-maths" })
        .success,
    ).toBe(true);
  });

  it("rejects bad progress and posts", () => {
    expect(CourseProgressSchema.safeParse({ ...progress, percentBps: 10001 }).success).toBe(false);
    expect(
      CourseProgressSchema.safeParse({ ...progress, completedItemIds: [item.id, item.id] }).success,
    ).toBe(false);
    expect(DiscussionThreadSchema.safeParse({ ...thread, postCount: -1 }).success).toBe(false);
    expect(DiscussionPostSchema.safeParse({ ...post, hidden: true }).success).toBe(false);
    expect(
      DiscussionPostSchema.safeParse({ ...post, hiddenByProfileId: "staff-maths" }).success,
    ).toBe(false);
    expect(DiscussionPostSchema.safeParse({ ...post, parentPostId: post.id }).success).toBe(false);
    expect(
      DiscussionPostSchema.safeParse({ ...post, editedAt: "2026-07-02T09:00:00Z" }).success,
    ).toBe(false);
    expect(DiscussionPostSchema.safeParse({ ...post, body: "   " }).success).toBe(false);
  });
});
