import { ReportCardSchema, ReportCardStatusInputSchema, pageSchema } from "@nexus/contracts";
import { HttpResponse, http } from "msw";
import { ApiFailure, entitled, failureResponse, ofTenant, readViewer } from "../context";
import { mockDb } from "../db";
import { familyLearnerIds, readLearnerFilter } from "./m18";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, get, list, param } from "./route";

const M = { module: "M22" } as const;
const READ = "m22.reports.read";

const previousStatus = {
  approved: "draft",
  published: "approved",
  withdrawn: "published",
} as const;

export const m22Handlers = [
  get("/report-cards", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const learnerId = readLearnerFilter(ctx, family);
    const groupId = family === null ? param(ctx.url, "classGroupId") : null;
    const group =
      groupId === null
        ? null
        : ofTenant(mockDb.classGroups, viewer.tenantId).find((row) => row.id === groupId);
    if (groupId !== null && !group) throw new ApiFailure("not_found");
    const members = group
      ? new Set(
          ofTenant(mockDb.enrolments, viewer.tenantId)
            .filter((row) => row.classGroupId === group.id)
            .map((row) => row.learnerId),
        )
      : null;
    const cards = ofTenant(mockDb.reportCards, viewer.tenantId).filter(
      (row) =>
        (family === null || (family.has(row.learnerId) && row.status === "published")) &&
        (!group || (row.academicYearId === group.academicYearId && members?.has(row.learnerId))) &&
        (learnerId === null || row.learnerId === learnerId),
    );
    return list(ctx, cards, pageSchema(ReportCardSchema));
  }),
  http.post(`*${API_BASE}/report-cards/:id/status`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, "M22")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has("m22.reports.publish")) throw new ApiFailure("forbidden");

      const body: unknown = await request.json().catch(() => null);
      const card = ofTenant(mockDb.reportCards, viewer.tenantId).find(
        (row) => row.id === params["id"],
      );
      if (!card) throw new ApiFailure("not_found");
      const parsed = ReportCardStatusInputSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiFailure("invalid_request", [{ path: "status", message: "Invalid status" }]);
      }
      const { status } = parsed.data;
      if (card.status !== previousStatus[status]) {
        throw new ApiFailure("conflict", [{ path: "status", message: "Invalid transition" }]);
      }
      const now = new Date().toISOString();
      const next = ReportCardSchema.parse({
        ...card,
        status,
        publishedAt: status === "published" ? now : null,
        updatedAt: now,
      });
      Object.assign(card, next);
      return HttpResponse.json(next);
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
