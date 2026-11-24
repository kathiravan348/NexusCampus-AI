import {
  AdmissionOfferSchema,
  ApplicationSchema,
  EnquirySchema,
  WaitlistEntrySchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
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
