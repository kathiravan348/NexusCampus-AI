import {
  CoverageEntrySchema,
  LessonPlanSchema,
  OutcomeFrameworkSchema,
  OutcomeMappingSchema,
  OutcomeSchema,
  SyllabusCoverageSchema,
  SyllabusUnitSchema,
  pageSchema,
} from "@nexus/contracts";
import { z } from "zod";
import { ApiFailure, ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, param } from "./route";

const M = { module: "M29", permission: "m29.curriculum.read" } as const;

const CoverageResponse = z.strictObject({
  coverage: SyllabusCoverageSchema,
  entries: z.array(CoverageEntrySchema),
});

function checkFilter<T extends { id: string; tenantId: string }>(
  rows: readonly T[],
  tenantId: string,
  id: string | null,
): void {
  if (id !== null) found(ofTenant(rows, tenantId).find((row) => row.id === id));
}

export const m29Handlers = [
  get("/outcome-frameworks", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.outcomeFrameworks, ctx.viewer.tenantId),
      pageSchema(OutcomeFrameworkSchema),
    ),
  ),
  get("/outcomes", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const frameworkId = param(ctx.url, "frameworkId");
    checkFilter(mockDb.outcomeFrameworks, tenantId, frameworkId);
    const rows = ofTenant(mockDb.outcomes, tenantId);
    return list(
      ctx,
      rows.filter((row) => frameworkId === null || row.frameworkId === frameworkId),
      pageSchema(OutcomeSchema),
    );
  }),
  get("/outcome-mappings", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const frameworkId = param(ctx.url, "frameworkId");
    checkFilter(mockDb.outcomeFrameworks, tenantId, frameworkId);
    const rows = ofTenant(mockDb.outcomeMappings, tenantId);
    const outcomeIds = new Set(
      ofTenant(mockDb.outcomes, tenantId)
        .filter((row) => row.frameworkId === frameworkId)
        .map((row) => row.id),
    );
    return list(
      ctx,
      rows.filter(
        (row) =>
          frameworkId === null ||
          outcomeIds.has(row.fromOutcomeId) ||
          outcomeIds.has(row.toOutcomeId),
      ),
      pageSchema(OutcomeMappingSchema),
    );
  }),
  get("/syllabus-units", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const subjectId = param(ctx.url, "subjectId");
    checkFilter(mockDb.subjects, tenantId, subjectId);
    const rows = ofTenant(mockDb.syllabusUnits, tenantId);
    return list(
      ctx,
      rows.filter((row) => subjectId === null || row.subjectId === subjectId),
      pageSchema(SyllabusUnitSchema),
    );
  }),
  get("/lesson-plans", M, (ctx) => {
    const { tenantId, permissions } = ctx.viewer;
    if (!permissions.has("m29.lessonplan.write") && !permissions.has("m29.lessonplan.review")) {
      throw new ApiFailure("forbidden");
    }
    const subjectOfferingId = param(ctx.url, "subjectOfferingId");
    checkFilter(mockDb.subjectOfferings, tenantId, subjectOfferingId);
    const rows = ofTenant(mockDb.lessonPlans, tenantId);
    return list(
      ctx,
      rows.filter(
        (row) => subjectOfferingId === null || row.subjectOfferingId === subjectOfferingId,
      ),
      pageSchema(LessonPlanSchema),
    );
  }),
  get("/syllabus-coverage", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const subjectOfferingId = param(ctx.url, "subjectOfferingId");
    if (subjectOfferingId === null) throw new ApiFailure("invalid_request");
    const offering = found(
      ofTenant(mockDb.subjectOfferings, tenantId).find((row) => row.id === subjectOfferingId),
    );
    const group = found(
      ofTenant(mockDb.classGroups, tenantId).find((row) => row.id === offering.classGroupId),
    );
    const topics = new Set(
      ofTenant(mockDb.syllabusUnits, tenantId)
        .filter(
          (row) => row.subjectId === offering.subjectId && row.yearLevelId === group.yearLevelId,
        )
        .flatMap((row) => row.topics.map((topic) => topic.id)),
    );
    const entries = ofTenant(mockDb.coverageEntries, tenantId).filter(
      (row) => row.subjectOfferingId === subjectOfferingId,
    );
    const covered = new Set(
      entries
        .filter((row) => row.status === "covered" && topics.has(row.topicId))
        .map((row) => row.topicId),
    );
    return ok(CoverageResponse, {
      coverage: {
        subjectOfferingId,
        topicsTotal: topics.size,
        topicsCovered: covered.size,
        percentBps: topics.size === 0 ? 0 : Math.round((covered.size * 10000) / topics.size),
      },
      entries,
    });
  }),
];
