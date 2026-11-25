import {
  EnquiryFormSummarySchema,
  EnquirySchema,
  PublicEnquiryFormSchema,
  PublicEnquiryInputSchema,
  PublicEnquiryReceiptSchema,
  pageSchema,
  type Institution,
} from "@nexus/contracts";
import { HttpResponse, http } from "msw";
import { ApiFailure, entitled, failureResponse, ofTenant } from "../context";
import { mockDb } from "../db";
import { PUBLIC_ENQUIRY_FORMS, type PublicEnquiryFormRecord } from "../fixtures";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, get, list, ok } from "./route";

function resolvePublicForm(rawId: unknown): {
  readonly form: PublicEnquiryFormRecord;
  readonly institution: Institution;
} {
  const formId = typeof rawId === "string" ? rawId : "";
  const form = PUBLIC_ENQUIRY_FORMS.find((row) => row.id === formId);
  if (!form || !entitled(form.tenantId, "M12")) throw new ApiFailure("not_found");
  const institutions: readonly Institution[] = ofTenant(mockDb.institutions, form.tenantId);
  const institution = institutions.find(
    (row) => row.id === form.institutionId && row.status !== "suspended",
  );
  if (!institution) throw new ApiFailure("not_found");
  return { form, institution };
}

function isHoneypotFilled(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  const website = (raw as Record<string, unknown>)["website"];
  return typeof website === "string" && website.length > 0;
}

function receipt202(): Response {
  return HttpResponse.json(PublicEnquiryReceiptSchema.parse({ received: true }), { status: 202 });
}

export const m12PublicHandlers = [
  http.get(`*${API_BASE}/public/enquiry-forms/:formId`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const { form, institution } = resolvePublicForm(params["formId"]);
      const programs = ofTenant(mockDb.programs, form.tenantId)
        .filter((row) => row.institutionId === institution.id && row.active)
        .map((row) => ({ id: row.id, name: row.name }));
      const campuses = ofTenant(mockDb.campuses, form.tenantId)
        .filter((row) => row.institutionId === institution.id)
        .map((row) => ({ id: row.id, name: row.name }));
      return ok(PublicEnquiryFormSchema, {
        id: form.id,
        institutionName: institution.name,
        institutionType: institution.type,
        defaultLocale: institution.locale.defaultLocale,
        supportedLocales: [...institution.locale.supportedLocales],
        programs,
        campuses,
      });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),

  http.post(`*${API_BASE}/public/enquiry-forms/:formId/enquiries`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const { form, institution } = resolvePublicForm(params["formId"]);
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        throw new ApiFailure("invalid_request", [{ path: "", message: "Invalid JSON body" }]);
      }
      if (isHoneypotFilled(raw)) return receipt202();

      const parsed = PublicEnquiryInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: "Invalid enquiry field",
          })),
        );
      }
      const input = parsed.data;
      if (input.programId !== null) {
        const program = ofTenant(mockDb.programs, form.tenantId).find(
          (row) => row.id === input.programId && row.institutionId === institution.id && row.active,
        );
        if (!program) {
          throw new ApiFailure("invalid_request", [
            { path: "programId", message: "Invalid program" },
          ]);
        }
      }
      if (input.campusId !== null) {
        const campus = ofTenant(mockDb.campuses, form.tenantId).find(
          (row) => row.id === input.campusId && row.institutionId === institution.id,
        );
        if (!campus) {
          throw new ApiFailure("invalid_request", [
            { path: "campusId", message: "Invalid campus" },
          ]);
        }
      }

      const now = new Date().toISOString();
      const enquiry = EnquirySchema.parse({
        id: `enq-${globalThis.crypto.randomUUID()}`,
        tenantId: form.tenantId,
        institutionId: institution.id,
        campusId: input.campusId,
        source: "public_form",
        campaignCode: null,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        learnerName: input.learnerName,
        programId: input.programId,
        status: "new",
        lostReason: null,
        assignedStaffProfileId: null,
        followUpOn: null,
        createdAt: now,
        updatedAt: now,
      });
      mockDb.enquiries.push(enquiry);
      return receipt202();
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),

  get("/enquiry-forms", { module: "M12", permission: "m12.admissions.manage" }, (ctx) => {
    const institutions = ofTenant(mockDb.institutions, ctx.viewer.tenantId);
    const own = PUBLIC_ENQUIRY_FORMS.filter((row) => row.tenantId === ctx.viewer.tenantId);
    const items = own.flatMap((row) => {
      const inst = institutions.find((item) => item.id === row.institutionId);
      return inst
        ? [
            {
              id: row.id,
              tenantId: row.tenantId,
              institutionId: inst.id,
              institutionName: inst.name,
            },
          ]
        : [];
    });
    return list(ctx, items, pageSchema(EnquiryFormSummarySchema));
  }),
];
