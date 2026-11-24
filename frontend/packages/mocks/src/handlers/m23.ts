import {
  IssuedDocumentReadSchema,
  IssuedDocumentRevokeInputSchema,
  IssuedDocumentSchema,
  pageSchema,
} from "@nexus/contracts";
import { HttpResponse, http } from "msw";
import { ApiFailure, entitled, failureResponse, ofTenant, readViewer } from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { familyLearnerIds, readLearnerFilter } from "./m18";
import { API_BASE, found, get, list } from "./route";

const M = { module: "M23" } as const;
const READ = "m23.documents.read";

export const m23Handlers = [
  get("/issued-documents", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const learnerId = readLearnerFilter(ctx, family);
    const documents = ofTenant(mockDb.issuedDocuments, viewer.tenantId).filter(
      (row) =>
        (family === null || (row.learnerId !== null && family.has(row.learnerId))) &&
        (learnerId === null || row.learnerId === learnerId),
    );
    const visible =
      family === null ? documents : documents.map((row) => ({ ...row, revokedReason: null }));
    return list(ctx, visible, pageSchema(IssuedDocumentReadSchema));
  }),
  http.post(`*${API_BASE}/issued-documents/:id/revoke`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, "M23")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has("m23.documents.issue")) throw new ApiFailure("forbidden");

      const body: unknown = await request.json().catch(() => undefined);
      const document = found(
        ofTenant(mockDb.issuedDocuments, viewer.tenantId).find((row) => row.id === params["id"]),
      );
      if (document.revoked) {
        throw new ApiFailure("conflict", [{ path: "revoked", message: "conflict" }]);
      }
      const parsed = IssuedDocumentRevokeInputSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiFailure("invalid_request", [{ path: "reason", message: "invalid_request" }]);
      }
      const updated = IssuedDocumentSchema.parse({
        ...document,
        revoked: true,
        revokedReason: parsed.data.reason,
      });
      Object.assign(document, updated);
      return HttpResponse.json(updated);
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
