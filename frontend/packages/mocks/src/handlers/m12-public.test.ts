import {
  EnquiryFormSummarySchema,
  EnquirySchema,
  PublicEnquiryFormSchema,
  PublicEnquiryReceiptSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import {
  CAMPUS,
  INSTITUTION,
  INSTITUTIONS,
  PROGRAM,
  PUBLIC_ENQUIRY_FORM,
  PUBLIC_ENQUIRY_FORMS,
  TENANT,
  USER,
} from "../fixtures";
import { server } from "../node";

const BASE = "http://localhost/api/v1";
const RIVERSIDE_FORM = PUBLIC_ENQUIRY_FORM.riversideSchool;

const validInput = {
  learnerName: "Anya Public",
  contactName: "Claire Public",
  contactPhone: "+447700900456",
  contactEmail: null,
  programId: PROGRAM.riverside,
  campusId: CAMPUS.riversideNorth,
  consent: true,
  website: "",
} as const;

function postEnquiry(formId: string, body: unknown, extraHeaders?: Record<string, string>) {
  return fetch(`${BASE}/public/enquiry-forms/${formId}/enquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => resetMockDb());
afterAll(() => server.close());

describe("M12 public enquiry form fixtures and handlers", () => {
  it("provides one opaque pef- form per demo institution without tenant names in ids", () => {
    expect(PUBLIC_ENQUIRY_FORMS).toHaveLength(INSTITUTIONS.length);
    for (const inst of INSTITUTIONS) {
      const form = PUBLIC_ENQUIRY_FORMS.find((row) => row.institutionId === inst.id);
      expect(form?.tenantId).toBe(inst.tenantId);
      expect(form?.id).toMatch(/^pef-[a-z0-9]+$/);
      expect(form?.id.toLowerCase()).not.toContain("riverside");
      expect(form?.id.toLowerCase()).not.toContain("little");
      expect(form?.id.toLowerCase()).not.toContain("northbridge");
      expect(form?.id.toLowerCase()).not.toContain("apex");
      expect(form?.id.toLowerCase()).not.toContain("harmony");
    }
  });

  it("serves public form metadata without a session and 404 for unknown forms", async () => {
    const okRes = await fetch(`${BASE}/public/enquiry-forms/${RIVERSIDE_FORM}`);
    expect(okRes.status).toBe(200);
    const raw = (await okRes.json()) as Record<string, unknown>;
    const form = PublicEnquiryFormSchema.parse(raw);
    expect(Object.keys(raw).sort()).toEqual(["campuses", "id", "institutionName", "programs"]);
    expect(form.institutionName).toBe("Riverside School");
    expect(form.programs).toEqual([{ id: PROGRAM.riverside, name: "Years 5 to 10" }]);
    expect(form.campuses.map((c) => c.id)).toEqual([CAMPUS.riversideNorth, CAMPUS.riversideSouth]);

    const missingRes = await fetch(`${BASE}/public/enquiry-forms/pef-does-not-exist`);
    expect(missingRes.status).toBe(404);
  });

  it("stores a public_form enquiry with no assignee and returns 202 receipt only", async () => {
    const before = mockDb.enquiries.length;
    const res = await postEnquiry(RIVERSIDE_FORM, validInput);
    expect(res.status).toBe(202);
    const body = (await res.json()) as Record<string, unknown>;
    expect(PublicEnquiryReceiptSchema.parse(body)).toEqual({ received: true });
    expect(Object.keys(body)).toEqual(["received"]);
    expect(mockDb.enquiries).toHaveLength(before + 1);

    const listRes = await fetch(`${BASE}/enquiries?status=new`, {
      headers: {
        [MOCK_HEADER.tenant]: TENANT.riverside,
        [MOCK_HEADER.user]: USER.rvHelen,
      },
    });
    expect(listRes.status).toBe(200);
    const page = pageSchema(EnquirySchema).parse(await listRes.json());
    expect(page.items).toContainEqual(
      expect.objectContaining({
        tenantId: TENANT.riverside,
        learnerName: "Anya Public",
        contactName: "Claire Public",
        contactPhone: "+447700900456",
        source: "public_form",
        status: "new",
        assignedStaffProfileId: null,
        followUpOn: null,
      }),
    );
  });

  it("returns the same 202 receipt and stores nothing when the honeypot is filled", async () => {
    const before = mockDb.enquiries.length;
    const res = await postEnquiry(RIVERSIDE_FORM, {
      ...validInput,
      website: "https://bot.example",
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ received: true });
    expect(mockDb.enquiries).toHaveLength(before);
  });

  it("returns 404 on POST to an unknown form id", async () => {
    const res = await postEnquiry("pef-unknown", validInput);
    expect(res.status).toBe(404);
  });

  it("rejects invalid payloads with 400 invalid_request and field paths", async () => {
    const noConsent = await postEnquiry(RIVERSIDE_FORM, { ...validInput, consent: false });
    expect(noConsent.status).toBe(400);
    expect(await noConsent.json()).toMatchObject({
      error: { code: "invalid_request", details: [{ path: "consent" }] },
    });

    const noContact = await postEnquiry(RIVERSIDE_FORM, {
      ...validInput,
      contactPhone: null,
      contactEmail: null,
    });
    expect(noContact.status).toBe(400);
    expect(await noContact.json()).toMatchObject({
      error: { code: "invalid_request", details: [{ path: "contactPhone" }] },
    });
  });

  it("prevents cross-tenant writes via headers or foreign program/campus ids", async () => {
    const beforeLs = mockDb.enquiries.filter((row) => row.tenantId === TENANT.littleSteps).length;
    const beforeRv = mockDb.enquiries.filter((row) => row.tenantId === TENANT.riverside).length;

    // Signed-in headers of Little Steps never redirect writes away from Riverside's form.
    const res = await postEnquiry(RIVERSIDE_FORM, validInput, {
      [MOCK_HEADER.tenant]: TENANT.littleSteps,
      [MOCK_HEADER.user]: USER.lsPriya,
    });
    expect(res.status).toBe(202);
    expect(mockDb.enquiries.filter((row) => row.tenantId === TENANT.littleSteps)).toHaveLength(
      beforeLs,
    );
    expect(mockDb.enquiries.filter((row) => row.tenantId === TENANT.riverside)).toHaveLength(
      beforeRv + 1,
    );

    const badProgram = await postEnquiry(RIVERSIDE_FORM, {
      ...validInput,
      programId: PROGRAM.littleSteps,
    });
    expect(badProgram.status).toBe(400);
    expect(await badProgram.json()).toMatchObject({
      error: { code: "invalid_request", details: [{ path: "programId" }] },
    });

    const badCampus = await postEnquiry(RIVERSIDE_FORM, {
      ...validInput,
      campusId: CAMPUS.littleSteps,
    });
    expect(badCampus.status).toBe(400);
    expect(await badCampus.json()).toMatchObject({
      error: { code: "invalid_request", details: [{ path: "campusId" }] },
    });
  });

  it("lists only the signed-in tenant's forms for managers and denies others", async () => {
    const unauth = await fetch(`${BASE}/enquiry-forms`);
    expect(unauth.status).toBe(401);

    const denied = await fetch(`${BASE}/enquiry-forms`, {
      headers: {
        [MOCK_HEADER.tenant]: TENANT.littleSteps,
        [MOCK_HEADER.user]: USER.lsArjun,
      },
    });
    expect(denied.status).toBe(403);

    const res = await fetch(`${BASE}/enquiry-forms`, {
      headers: {
        [MOCK_HEADER.tenant]: TENANT.riverside,
        [MOCK_HEADER.user]: USER.rvHelen,
      },
    });
    expect(res.status).toBe(200);
    const page = pageSchema(EnquiryFormSummarySchema).parse(await res.json());
    expect(page.items).toEqual([
      {
        id: RIVERSIDE_FORM,
        tenantId: TENANT.riverside,
        institutionId: INSTITUTION.riversideSchool,
        institutionName: "Riverside School",
      },
    ]);
  });
});
