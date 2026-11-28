import {
  ContentAssetSchema,
  ContentAttemptSchema,
  ContentAttemptStatusSchema,
  ContentItemSchema,
  CourseItemKindSchema,
  CourseItemSchema,
  CourseModuleSchema,
  CourseProgressSchema,
  CourseSpaceSchema,
  CoverageEntrySchema,
  DiscussionPostSchema,
  DiscussionThreadSchema,
  LessonPlanSchema,
  LessonPlanStatusSchema,
  OutcomeFrameworkSchema,
  OutcomeMappingSchema,
  OutcomeSchema,
  SyllabusUnitSchema,
} from "@nexus/contracts";
import { describe, expect, it } from "vitest";
import * as F from "./index";

interface TenantRow {
  tenantId: string;
  id?: string;
}
interface Parser {
  safeParse(value: unknown): { error?: unknown };
}

const SETS: [string, Parser, readonly TenantRow[]][] = [
  ["OUTCOME_FRAMEWORKS", OutcomeFrameworkSchema, F.OUTCOME_FRAMEWORKS],
  ["OUTCOMES", OutcomeSchema, F.OUTCOMES],
  ["OUTCOME_MAPPINGS", OutcomeMappingSchema, F.OUTCOME_MAPPINGS],
  ["SYLLABUS_UNITS", SyllabusUnitSchema, F.SYLLABUS_UNITS],
  ["LESSON_PLANS", LessonPlanSchema, F.LESSON_PLANS],
  ["COVERAGE_ENTRIES", CoverageEntrySchema, F.COVERAGE_ENTRIES],
  ["COURSE_SPACES", CourseSpaceSchema, F.COURSE_SPACES],
  ["COURSE_MODULES", CourseModuleSchema, F.COURSE_MODULES],
  ["COURSE_ITEMS", CourseItemSchema, F.COURSE_ITEMS],
  ["COURSE_PROGRESS", CourseProgressSchema, F.COURSE_PROGRESS],
  ["DISCUSSION_THREADS", DiscussionThreadSchema, F.DISCUSSION_THREADS],
  ["DISCUSSION_POSTS", DiscussionPostSchema, F.DISCUSSION_POSTS],
  ["CONTENT_ASSETS", ContentAssetSchema, F.CONTENT_ASSETS],
  ["CONTENT_ITEMS", ContentItemSchema, F.CONTENT_ITEMS],
  ["CONTENT_ATTEMPTS", ContentAttemptSchema, F.CONTENT_ATTEMPTS],
];

const tenantIds = new Set(F.DEMO_TENANTS.map(({ tenantId }) => tenantId));
const staff = F.ROLE_PROFILES.filter(({ kind }) => kind === "staff");
const topics = F.SYLLABUS_UNITS.flatMap((u) =>
  u.topics.map((t) => ({ ...t, tenantId: u.tenantId, subjectId: u.subjectId })),
);
const byId = <T extends { id: string }>(rows: readonly T[], id: string | null) =>
  id === null ? undefined : rows.find((row) => row.id === id);
const inTenant = <T extends TenantRow>(rows: readonly T[], t: string) =>
  rows.filter((row) => row.tenantId === t);

function expectRef(
  rows: readonly { id: string; tenantId: string }[],
  id: string | null,
  tenantId: string,
) {
  if (id !== null) expect(byId(rows, id)?.tenantId, id).toBe(tenantId);
}

function expectDate(tenantId: string, date: string | null) {
  if (date === null) return;
  const cal = F.ACADEMIC_CALENDARS.find((row) => row.tenantId === tenantId);
  expect(cal, tenantId).toBeDefined();
  expect(date >= (cal?.startsOn ?? "") && date <= (cal?.endsOn ?? ""), date).toBe(true);
}

describe("Stage 4 M29–M31 fixtures (NEX-220)", () => {
  it.each(SETS)("%s parse with their contract and have unique ids", (name, schema, rows) => {
    expect(rows.length, name).toBeGreaterThan(0);
    for (const row of rows) {
      expect(tenantIds.has(row.tenantId), `${name}:${row.tenantId}`).toBe(true);
      expect(schema.safeParse(row).error, row.id ?? name).toBeUndefined();
    }
    const ids = rows.map(({ id }) => id).filter((id): id is string => id !== undefined);
    if (ids.length > 0) expect(new Set(ids).size, name).toBe(rows.length);
  });

  it("cover every demo tenant with frameworks, course spaces, and content items", () => {
    expect(new Set(F.OUTCOME_FRAMEWORKS.map((r) => r.tenantId))).toEqual(tenantIds);
    expect(new Set(F.COURSE_SPACES.map((r) => r.tenantId))).toEqual(tenantIds);
    expect(new Set(F.CONTENT_ITEMS.map((r) => r.tenantId))).toEqual(tenantIds);
    const progKeys = F.COURSE_PROGRESS.map((r) => `${r.courseSpaceId}:${r.learnerId}`);
    expect(new Set(progKeys).size).toBe(F.COURSE_PROGRESS.length);
    expect(new Set(topics.map((r) => r.id)).size).toBe(topics.length);
  });

  it("resolve M29 curriculum references and tenant-type examples", () => {
    for (const fw of F.OUTCOME_FRAMEWORKS) {
      expectRef(F.INSTITUTIONS, fw.institutionId, fw.tenantId);
    }
    for (const out of F.OUTCOMES) {
      expectRef(F.OUTCOME_FRAMEWORKS, out.frameworkId, out.tenantId);
      if (out.parentId !== null) {
        const expected = { tenantId: out.tenantId, frameworkId: out.frameworkId };
        expect(byId(F.OUTCOMES, out.parentId), out.id).toMatchObject(expected);
      }
      for (const id of out.subjectIds) expectRef(F.SUBJECTS, id, out.tenantId);
      for (const id of out.yearLevelIds) expectRef(F.YEAR_LEVELS, id, out.tenantId);
    }
    for (const m of F.OUTCOME_MAPPINGS) {
      const from = byId(F.OUTCOMES, m.fromOutcomeId);
      const to = byId(F.OUTCOMES, m.toOutcomeId);
      expect(from?.tenantId, m.id).toBe(m.tenantId);
      expect(to?.tenantId, m.id).toBe(m.tenantId);
      expect(byId(F.OUTCOME_FRAMEWORKS, from?.frameworkId ?? null)?.kind).toBe("course_outcomes");
      expect(byId(F.OUTCOME_FRAMEWORKS, to?.frameworkId ?? null)?.kind).toBe("program_outcomes");
    }
    for (const u of F.SYLLABUS_UNITS) {
      expectRef(F.SUBJECTS, u.subjectId, u.tenantId);
      expectRef(F.YEAR_LEVELS, u.yearLevelId, u.tenantId);
      for (const id of u.outcomeIds) expectRef(F.OUTCOMES, id, u.tenantId);
      for (const t of u.topics) {
        for (const id of t.outcomeIds) expectRef(F.OUTCOMES, id, u.tenantId);
      }
    }
    for (const p of F.LESSON_PLANS) {
      const off = byId(F.SUBJECT_OFFERINGS, p.subjectOfferingId);
      expect(off?.tenantId, p.id).toBe(p.tenantId);
      expectRef(staff, p.staffProfileId, p.tenantId);
      expectRef(staff, p.reviewedByStaffProfileId, p.tenantId);
      expectDate(p.tenantId, p.date);
      for (const id of p.outcomeIds) expectRef(F.OUTCOMES, id, p.tenantId);
      const expected = { tenantId: p.tenantId, subjectId: off?.subjectId };
      for (const id of p.topicIds) expect(byId(topics, id)).toMatchObject(expected);
    }
    for (const cov of F.COVERAGE_ENTRIES) {
      const off = byId(F.SUBJECT_OFFERINGS, cov.subjectOfferingId);
      expect(off?.tenantId, cov.id).toBe(cov.tenantId);
      const expected = { tenantId: cov.tenantId, subjectId: off?.subjectId };
      expect(byId(topics, cov.topicId)).toMatchObject(expected);
      expectRef(F.LESSON_PLANS, cov.lessonPlanId, cov.tenantId);
      expectDate(cov.tenantId, cov.coveredOn);
    }
    const lsFw = inTenant(F.OUTCOME_FRAMEWORKS, F.TENANT.littleSteps)[0];
    expect(lsFw?.kind).toBe("milestones");
    expect(F.OUTCOMES.filter((r) => r.frameworkId === lsFw?.id).length).toBeGreaterThanOrEqual(6);
    const rvFw = inTenant(F.OUTCOME_FRAMEWORKS, F.TENANT.riverside)[0];
    expect(rvFw).toMatchObject({ kind: "standards", institutionId: null });
    expect(F.OUTCOMES.some((r) => r.frameworkId === rvFw?.id && r.parentId !== null)).toBe(true);
    const rvUnits = inTenant(F.SYLLABUS_UNITS, F.TENANT.riverside);
    expect(new Set(rvUnits.map((r) => r.subjectId)).size).toBeGreaterThanOrEqual(2);
    const rvPlans = inTenant(F.LESSON_PLANS, F.TENANT.riverside);
    expect(new Set(rvPlans.map((r) => r.status))).toEqual(new Set(LessonPlanStatusSchema.options));
    expect(rvPlans.some((r) => r.source === "ai_draft")).toBe(true);
    const rvCov = inTenant(F.COVERAGE_ENTRIES, F.TENANT.riverside);
    expect(new Set(rvCov.map((r) => r.subjectOfferingId)).size).toBeGreaterThanOrEqual(2);
    expect(inTenant(F.OUTCOME_MAPPINGS, F.TENANT.northbridge).length).toBeGreaterThanOrEqual(4);
    expect(inTenant(F.OUTCOME_FRAMEWORKS, F.TENANT.apex)[0]?.kind).toBe("standards");
    expect(inTenant(F.OUTCOME_FRAMEWORKS, F.TENANT.harmony)[0]?.kind).toBe("skills");
  });

  it("resolve M30 course spaces, modules, items, progress, and discussions", () => {
    for (const sp of F.COURSE_SPACES) {
      expectRef(F.INSTITUTIONS, sp.institutionId, sp.tenantId);
      expectRef(F.ACADEMIC_CALENDARS, sp.academicYearId, sp.tenantId);
      expectRef(F.SUBJECT_OFFERINGS, sp.subjectOfferingId, sp.tenantId);
      for (const id of sp.staffProfileIds) expectRef(staff, id, sp.tenantId);
      for (const id of sp.classGroupIds) expectRef(F.CLASS_GROUPS, id, sp.tenantId);
      expectDate(sp.tenantId, sp.startsOn);
      expectDate(sp.tenantId, sp.endsOn);
      const mods = F.COURSE_MODULES.filter((r) => r.courseSpaceId === sp.id);
      expect(mods.length, sp.id).toBeGreaterThanOrEqual(2);
      expect(mods.length, sp.id).toBeLessThanOrEqual(4);
      expect(new Set(mods.map((r) => r.order)).size, sp.id).toBe(mods.length);
    }
    const rvOff = inTenant(F.SUBJECT_OFFERINGS, F.TENANT.riverside);
    const rvSpOff = inTenant(F.COURSE_SPACES, F.TENANT.riverside)
      .filter((r) => r.kind === "class")
      .map((r) => r.subjectOfferingId);
    expect(new Set(rvSpOff)).toEqual(new Set(rvOff.map((r) => r.id)));
    const hmOpen = inTenant(F.COURSE_SPACES, F.TENANT.harmony).some(
      (r) => r.kind === "course" && r.selfEnrol,
    );
    expect(hmOpen).toBe(true);
    for (const mod of F.COURSE_MODULES) {
      expectRef(F.COURSE_SPACES, mod.courseSpaceId, mod.tenantId);
      expectDate(mod.tenantId, mod.unlockOn);
      const expected = { tenantId: mod.tenantId, courseSpaceId: mod.courseSpaceId };
      for (const pre of mod.prerequisiteModuleIds) {
        expect(byId(F.COURSE_MODULES, pre)).toMatchObject(expected);
      }
      for (const id of mod.outcomeIds) expectRef(F.OUTCOMES, id, mod.tenantId);
    }
    expect(F.COURSE_MODULES.some((r) => r.prerequisiteModuleIds.length > 0)).toBe(true);
    for (const item of F.COURSE_ITEMS) {
      expectRef(F.COURSE_MODULES, item.moduleId, item.tenantId);
      if (item.kind === "content") expectRef(F.CONTENT_ITEMS, item.refId, item.tenantId);
      if (item.kind === "discussion") expectRef(F.DISCUSSION_THREADS, item.refId, item.tenantId);
      if (item.kind === "assignment") expectRef(F.ASSIGNMENTS, item.refId, item.tenantId);
      if (item.kind === "test") expectRef(F.ONLINE_TESTS, item.refId, item.tenantId);
      if (item.kind === "live_session") {
        const mod = byId(F.COURSE_MODULES, item.moduleId);
        const expected = { tenantId: item.tenantId, courseSpaceId: mod?.courseSpaceId };
        expect(byId(F.LIVE_SESSIONS, item.refId), item.id).toMatchObject(expected);
      }
      if (item.dueAt !== null) expectDate(item.tenantId, item.dueAt.slice(0, 10));
    }
    const kinds = new Set(F.COURSE_ITEMS.map((r) => r.kind));
    expect(kinds).toEqual(new Set(CourseItemKindSchema.options));
    for (const p of F.COURSE_PROGRESS) {
      const sp = byId(F.COURSE_SPACES, p.courseSpaceId);
      expect(sp?.tenantId, p.learnerId).toBe(p.tenantId);
      expectRef(F.LEARNERS, p.learnerId, p.tenantId);
      const enr = F.ENROLMENTS.find((r) => r.learnerId === p.learnerId);
      expect(sp?.classGroupIds, p.learnerId).toContain(enr?.classGroupId);
      const spMods = new Set(
        F.COURSE_MODULES.filter((r) => r.courseSpaceId === p.courseSpaceId).map((r) => r.id),
      );
      for (const id of p.completedItemIds) {
        const itm = byId(F.COURSE_ITEMS, id);
        expect(itm?.tenantId, id).toBe(p.tenantId);
        expect(spMods.has(itm?.moduleId ?? ""), id).toBe(true);
      }
      if (p.lastActivityAt !== null) expectDate(p.tenantId, p.lastActivityAt.slice(0, 10));
    }
    for (const th of F.DISCUSSION_THREADS) {
      expectRef(F.COURSE_SPACES, th.courseSpaceId, th.tenantId);
      expectRef(F.ROLE_PROFILES, th.authorProfileId, th.tenantId);
      expectDate(th.tenantId, th.createdAt.slice(0, 10));
      const posts = F.DISCUSSION_POSTS.filter((r) => r.threadId === th.id);
      expect(th.postCount, th.id).toBe(posts.length);
      const dates = posts.map((r) => r.createdAt).sort();
      expect(th.lastPostAt, th.id).toBe(dates.at(-1) ?? null);
    }
    for (const post of F.DISCUSSION_POSTS) {
      expectRef(F.DISCUSSION_THREADS, post.threadId, post.tenantId);
      expectRef(F.ROLE_PROFILES, post.authorProfileId, post.tenantId);
      expectRef(staff, post.hiddenByProfileId, post.tenantId);
      expectDate(post.tenantId, post.createdAt.slice(0, 10));
      if (post.parentPostId !== null) {
        const expected = { tenantId: post.tenantId, threadId: post.threadId };
        expect(byId(F.DISCUSSION_POSTS, post.parentPostId)).toMatchObject(expected);
      }
    }
    expect(F.DISCUSSION_POSTS.some((r) => r.parentPostId !== null)).toBe(true);
    expect(F.DISCUSSION_POSTS.some((r) => r.hidden && r.hiddenByProfileId !== null)).toBe(true);
  });

  it("resolve M31 content assets, items, accessibility checks, and attempts", () => {
    const blocks = new Set<string>();
    for (const item of F.CONTENT_ITEMS) {
      expectRef(F.INSTITUTIONS, item.institutionId, item.tenantId);
      expectRef(staff, item.createdByProfileId, item.tenantId);
      expectRef(F.CONTENT_ASSETS, item.assetId, item.tenantId);
      for (const id of item.outcomeIds) expectRef(F.OUTCOMES, id, item.tenantId);
      for (const id of item.textTrackAssetIds) expectRef(F.CONTENT_ASSETS, id, item.tenantId);
      if (item.package !== null) {
        const expected = { tenantId: item.tenantId, kind: "package" };
        expect(byId(F.CONTENT_ASSETS, item.package.assetId)).toMatchObject(expected);
      }
      for (const b of item.blocks ?? []) {
        blocks.add(b.type);
        if (b.type === "question") expectRef(F.QUESTION_ITEMS, b.questionId, item.tenantId);
        if (b.type === "image" || b.type === "video") {
          const expected = { tenantId: item.tenantId, kind: b.type };
          expect(byId(F.CONTENT_ASSETS, b.assetId)).toMatchObject(expected);
        }
        if (b.type === "video") {
          const expected = { tenantId: item.tenantId, kind: "captions" };
          for (const c of b.captionAssetIds) {
            expect(byId(F.CONTENT_ASSETS, c)).toMatchObject(expected);
          }
        }
      }
    }
    expect(blocks).toEqual(new Set(["text", "image", "video", "embed", "question"]));
    const hasTrack = (kind: "video" | "audio") =>
      F.CONTENT_ITEMS.some((r) => r.kind === kind && r.textTrackAssetIds.length > 0);
    expect(hasTrack("video")).toBe(true);
    expect(hasTrack("audio")).toBe(true);
    expect(F.CONTENT_ITEMS.some((r) => r.kind === "scorm2004")).toBe(true);
    expect(F.CONTENT_ITEMS.some((r) => r.kind === "cmi5")).toBe(true);
    const isAltErr = (i: { code: string; severity: string }) =>
      i.code === "missing_alt_text" && i.severity === "error";
    const draftBlocked = F.CONTENT_ITEMS.some(
      (r) => r.status === "draft" && Boolean(r.accessibility?.issues.some(isAltErr)),
    );
    expect(draftBlocked).toBe(true);
    for (const att of F.CONTENT_ATTEMPTS) {
      expectRef(F.CONTENT_ITEMS, att.contentItemId, att.tenantId);
      expectRef(F.LEARNERS, att.learnerId, att.tenantId);
      expectDate(att.tenantId, att.startedAt.slice(0, 10));
      if (att.finishedAt !== null) expectDate(att.tenantId, att.finishedAt.slice(0, 10));
    }
    const statuses = new Set(F.CONTENT_ATTEMPTS.map((r) => r.status));
    expect(statuses).toEqual(new Set(ContentAttemptStatusSchema.options));
  });
});
