import {
  AdmissionOfferSchema,
  ApplicationSchema,
  EnquiryInputSchema,
  EnquirySchema,
  WaitlistEntrySchema,
  pageSchema,
  type EnquiryInput,
} from "@nexus/contracts";
import { HttpResponse, http } from "msw";
import {
  ApiFailure,
  MOCK_HEADER,
  entitled,
  failureResponse,
  ofTenant,
  readViewer,
} from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, get, list, param } from "./route";

const M = { module: "M12", permission: "m12.admissions.read" } as const;

async function readEnquiryInput(request: Request): Promise<EnquiryInput> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiFailure("invalid_request", [{ path: "", message: "Invalid JSON body" }]);
  }
  const parsed = EnquiryInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(
      "invalid_request",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: "Invalid enquiry field",
      })),
    );
  }
  return parsed.data;
}

export const m12Handlers = [
  get("/enquiries", M, (ctx) => {
    const status = param(ctx.url, "status");
    const enquiries = ofTenant(mockDb.enquiries, ctx.viewer.tenantId).filter(
      (row) => status === null || row.status === status,
    );
    return list(ctx, enquiries, pageSchema(EnquirySchema));
  }),
  get("/applications", M, (ctx) => {
    const applications = ofTenant(mockDb.applications, ctx.viewer.tenantId);
    return list(ctx, applications, pageSchema(ApplicationSchema));
  }),
  get("/admission-offers", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.admissionOffers, ctx.viewer.tenantId),
      pageSchema(AdmissionOfferSchema),
    ),
  ),
  get("/waitlist", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.waitlistEntries, ctx.viewer.tenantId),
      pageSchema(WaitlistEntrySchema),
    ),
  ),
  http.post(`*${API_BASE}/enquiries`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const { tenantId, permissions } = readViewer(request);
      if (!entitled(tenantId, "M12")) throw new ApiFailure("module_disabled");
      if (!permissions.has("m12.admissions.manage")) throw new ApiFailure("forbidden");
      const input = await readEnquiryInput(request);
      const program = ofTenant(mockDb.programs, tenantId).find((row) => row.id === input.programId);
      const campus = ofTenant(mockDb.campuses, tenantId).find((row) => row.id === input.campusId);
      if (input.programId !== null && !program) {
        throw new ApiFailure("invalid_request", [
          { path: "programId", message: "Invalid program" },
        ]);
      }
      if (input.campusId !== null && !campus) {
        throw new ApiFailure("invalid_request", [{ path: "campusId", message: "Invalid campus" }]);
      }
      const user = ofTenant(mockDb.users, tenantId).find(
        (row) => row.id === request.headers.get(MOCK_HEADER.user),
      );
      const staff = ofTenant(mockDb.roleProfiles, tenantId).find(
        (row) => row.personId === user?.personId && row.kind === "staff",
      );
      const institutionId =
        program?.institutionId ??
        campus?.institutionId ??
        staff?.institutionId ??
        ofTenant(mockDb.institutions, tenantId)[0]?.id;
      if (!institutionId) throw new ApiFailure("invalid_request");
      const now = new Date().toISOString();
      const enquiry = EnquirySchema.parse({
        ...input,
        id: `enq-${globalThis.crypto.randomUUID()}`,
        tenantId,
        institutionId,
        status: "new",
        campaignCode: null,
        lostReason: null,
        assignedStaffProfileId: staff?.id ?? null,
        createdAt: now,
        updatedAt: now,
      });
      mockDb.enquiries.push(enquiry);
      return HttpResponse.json(enquiry, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
