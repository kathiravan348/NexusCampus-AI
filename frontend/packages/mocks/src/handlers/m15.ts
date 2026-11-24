import {
  ClassGroupSchema,
  ProgramSchema,
  SubjectOfferingSchema,
  SubjectSchema,
  YearLevelSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, param } from "./route";

const M = { module: "M15", permission: "m15.structure.read" } as const;

export const m15Handlers = [
  get("/programs", M, (ctx) =>
    list(ctx, ofTenant(mockDb.programs, ctx.viewer.tenantId), pageSchema(ProgramSchema)),
  ),
  get("/year-levels", M, (ctx) =>
    list(ctx, ofTenant(mockDb.yearLevels, ctx.viewer.tenantId), pageSchema(YearLevelSchema)),
  ),
  get("/class-groups", M, (ctx) =>
    list(ctx, ofTenant(mockDb.classGroups, ctx.viewer.tenantId), pageSchema(ClassGroupSchema)),
  ),
  get("/subjects", M, (ctx) =>
    list(ctx, ofTenant(mockDb.subjects, ctx.viewer.tenantId), pageSchema(SubjectSchema)),
  ),
  get("/subject-offerings", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const academicYearId = param(ctx.url, "academicYearId");
    const offerings = ofTenant(mockDb.subjectOfferings, tenantId);
    if (academicYearId !== null) {
      found(ofTenant(mockDb.calendars, tenantId).find((row) => row.id === academicYearId));
    }
    return list(
      ctx,
      offerings.filter((row) => academicYearId === null || row.academicYearId === academicYearId),
      pageSchema(SubjectOfferingSchema),
    );
  }),
];
