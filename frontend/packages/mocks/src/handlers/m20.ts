import {
  AssessmentSchema,
  GradingSchemeSchema,
  MarkEntrySchema,
  RubricSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { familyLearnerIds } from "./m18";
import { found, get, list, param } from "./route";

const M = { module: "M20" } as const;
const READ = "m20.marks.read";
const staff = { ...M, permission: READ };

export const m20Handlers = [
  get("/grading-schemes", staff, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.gradingSchemes, ctx.viewer.tenantId),
      pageSchema(GradingSchemeSchema),
    ),
  ),
  get("/assessments", staff, (ctx) => {
    const { tenantId } = ctx.viewer;
    const classGroupId = param(ctx.url, "classGroupId");
    const assessments = ofTenant(mockDb.assessments, tenantId);
    if (classGroupId === null) return list(ctx, assessments, pageSchema(AssessmentSchema));

    found(ofTenant(mockDb.classGroups, tenantId).find((row) => row.id === classGroupId));
    const offeringIds = new Set(
      ofTenant(mockDb.subjectOfferings, tenantId)
        .filter((row) => row.classGroupId === classGroupId)
        .map((row) => row.id),
    );
    return list(
      ctx,
      assessments.filter((row) => offeringIds.has(row.subjectOfferingId)),
      pageSchema(AssessmentSchema),
    );
  }),
  get("/rubrics", staff, (ctx) =>
    list(ctx, ofTenant(mockDb.rubrics, ctx.viewer.tenantId), pageSchema(RubricSchema)),
  ),
  get("/assessments/:id/marks", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const assessment = found(
      ofTenant(mockDb.assessments, viewer.tenantId).find(
        (row) => row.id === ctx.params["id"] && (family === null || row.status === "published"),
      ),
    );
    const entries = ofTenant(mockDb.markEntries, viewer.tenantId)
      .filter(
        (row) =>
          row.assessmentId === assessment.id && (family === null || family.has(row.learnerId)),
      )
      .map((row) => (family === null ? row : { ...row, remark: null }));
    return list(ctx, entries, pageSchema(MarkEntrySchema));
  }),
];
