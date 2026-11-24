import {
  AdmissionOfferSchema,
  ApplicationSchema,
  EnquirySchema,
  WaitlistEntrySchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: TENANT.littleSteps, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

describe("M12 read handlers", () => {
  it.each([
    ["/enquiries", pageSchema(EnquirySchema), 3],
    ["/applications", pageSchema(ApplicationSchema), 2],
    ["/admission-offers", pageSchema(AdmissionOfferSchema), 1],
    ["/waitlist", pageSchema(WaitlistEntrySchema), 1],
  ] as const)("scopes %s to the tenant and denies teachers", async (path, schema, count) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    const { items, total } = schema.parse(await response.json());
    expect(items).toHaveLength(count);
    expect(total).toBe(count);
    expect(items.every((row) => row.tenantId === TENANT.littleSteps)).toBe(true);
    expect((await get(path, USER.lsArjun)).status).toBe(403);
  });

  it("filters enquiries by status before pagination", async () => {
    const response = await get("/enquiries?status=visit_booked&pageSize=1");
    expect(response.status).toBe(200);
    const page = pageSchema(EnquirySchema).parse(await response.json());
    expect(page.total).toBe(1);
    expect(page.items).toMatchObject([{ status: "visit_booked" }]);
  });
});

describe("M12 enquiry creation", () => {
  const input = {
    source: "walk_in",
    campusId: null,
    contactName: "Demo contact",
    contactPhone: null,
    contactEmail: "admissions@example.test",
    learnerName: "Demo learner",
    programId: null,
    followUpOn: null,
  } as const;

  function post(body: unknown, user: string = USER.lsPriya) {
    return fetch("http://localhost/api/v1/enquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [MOCK_HEADER.tenant]: TENANT.littleSteps,
        [MOCK_HEADER.user]: user,
      },
      body: JSON.stringify(body),
    });
  }

  it("creates a new enquiry assigned to the viewer's staff profile", async () => {
    const response = await post(input);
    expect(response.status).toBe(201);
    const row = EnquirySchema.parse(await response.json());
    try {
      const user = mockDb.users.find((item) => item.id === USER.lsPriya);
      const staff = mockDb.roleProfiles.find(
        (item) => item.personId === user?.personId && item.kind === "staff",
      );
      expect(staff).toBeDefined();
      expect(row).toMatchObject({
        tenantId: TENANT.littleSteps,
        assignedStaffProfileId: staff?.id,
        status: "new",
        campaignCode: null,
        lostReason: null,
      });
      const page = pageSchema(EnquirySchema).parse(
        await (await get("/enquiries?status=new")).json(),
      );
      expect(page.items.some((item) => item.id === row.id)).toBe(true);
    } finally {
      mockDb.enquiries = mockDb.enquiries.filter((item) => item.id !== row.id);
    }
  });

  it.each(["campusId", "programId"] as const)("rejects a foreign %s", async (field) => {
    const foreign = (field === "campusId" ? mockDb.campuses : mockDb.programs).find(
      (row) => row.tenantId !== TENANT.littleSteps,
    )!;
    const response = await post({ ...input, [field]: foreign.id });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { details: [{ path: field }] } });
  });

  it("requires a contact method and manage permission", async () => {
    expect((await post({ ...input, contactEmail: null })).status).toBe(400);
    expect((await post(input, USER.lsArjun)).status).toBe(403);
  });
});
