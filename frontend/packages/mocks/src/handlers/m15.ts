import {
  ClassGroupInputSchema,
  ClassGroupSchema,
  ProgramSchema,
  SubjectOfferingSchema,
  SubjectSchema,
  YearLevelSchema,
  pageSchema,
  type ClassGroupInput,
} from "@nexus/contracts";
import { HttpResponse, http, type JsonBodyType } from "msw";
import { ApiFailure, entitled, failureResponse, ofTenant, readViewer } from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, param } from "./route";

const M = { module: "M15", permission: "m15.structure.read" } as const;

function findInTenant<T extends { id: string; tenantId: string }>(
  rows: readonly T[],
  tenantId: string,
  id: string,
): T | undefined {
  return ofTenant(rows, tenantId).find((row) => row.id === id);
}

async function readClassGroupInput(request: Request): Promise<ClassGroupInput> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiFailure("invalid_request", [{ path: "", message: "Invalid JSON body" }]);
  }
  const parsed = ClassGroupInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(
      "invalid_request",
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

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
  http.post(`*${API_BASE}/class-groups`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, "M15")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has("m15.structure.manage")) throw new ApiFailure("forbidden");
      const input = await readClassGroupInput(request);
      const { tenantId } = viewer;

      const program = findInTenant(mockDb.programs, tenantId, input.programId);
      if (!program) {
        throw new ApiFailure("invalid_request", [
          { path: "programId", message: "Program does not belong to this tenant" },
        ]);
      }
      const calendar = findInTenant(mockDb.calendars, tenantId, input.academicYearId);
      if (!calendar) {
        throw new ApiFailure("invalid_request", [
          { path: "academicYearId", message: "Academic year does not belong to this tenant" },
        ]);
      }
      if (input.yearLevelId !== null) {
        const yearLevel = findInTenant(mockDb.yearLevels, tenantId, input.yearLevelId);
        if (!yearLevel || yearLevel.programId !== program.id) {
          throw new ApiFailure("invalid_request", [
            { path: "yearLevelId", message: "Year level does not belong to this program" },
          ]);
        }
      }
      if (input.campusId !== null && !findInTenant(mockDb.campuses, tenantId, input.campusId)) {
        throw new ApiFailure("invalid_request", [
          { path: "campusId", message: "Campus does not belong to this tenant" },
        ]);
      }
      if (input.homeroomStaffProfileId !== null) {
        const staff = findInTenant(mockDb.roleProfiles, tenantId, input.homeroomStaffProfileId);
        if (!staff || staff.kind !== "staff") {
          throw new ApiFailure("invalid_request", [
            {
              path: "homeroomStaffProfileId",
              message: "Staff profile does not belong to this tenant",
            },
          ]);
        }
      }
      const duplicate = ofTenant(mockDb.classGroups, tenantId).some(
        (row) =>
          row.academicYearId === input.academicYearId &&
          row.code.toLowerCase() === input.code.toLowerCase(),
      );
      if (duplicate) {
        throw new ApiFailure("conflict", [
          {
            path: "code",
            message: "A class group with this code already exists for this academic year",
          },
        ]);
      }

      const now = new Date().toISOString();
      const created = ClassGroupSchema.parse({
        ...input,
        id: `clg-${globalThis.crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        institutionId: program.institutionId,
        createdAt: now,
        updatedAt: now,
      });
      mockDb.classGroups.push(created);
      return HttpResponse.json(created as JsonBodyType, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
