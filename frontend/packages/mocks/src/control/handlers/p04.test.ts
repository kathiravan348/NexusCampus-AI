import { ApiErrorSchema, ProvisioningJobSchema } from "@nexus/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONTROL_HEADER } from "../context";
import { controlDb, resetControlDb } from "../db";
import { ACCOUNT, STAFF } from "../fixtures";
import { CONTROL_API_BASE } from "../route";
import { controlHandlers } from "./index";

const server = setupServer(...controlHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetControlDb();
});
afterAll(() => server.close());

const post = (staff: string, path: string, body: unknown = {}) =>
  fetch(`http://localhost${CONTROL_API_BASE}${path}`, {
    method: "POST",
    headers: { [CONTROL_HEADER.staff]: staff, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const code = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;
const request = {
  accountId: ACCOUNT.lotus,
  region: "in",
  institutionType: "tp",
  planCode: "standard",
  trialDays: 30,
  deliveryModel: "saas_shared",
};

describe("P04 mock writes", () => {
  it("creates a pending job and walks it to done, adding the tenant to the account", async () => {
    const created = ProvisioningJobSchema.parse(
      await (await post(STAFF.implementation, "/provisioning-jobs", request)).json(),
    );
    expect(created.status).toBe("pending");
    let job = created;
    for (let i = 0; i < 5; i += 1) {
      job = ProvisioningJobSchema.parse(
        await (await post(STAFF.implementation, `/provisioning-jobs/${created.id}/advance`)).json(),
      );
    }
    expect(job.status).toBe("done");
    expect(controlDb.accounts.find((a) => a.id === ACCOUNT.lotus)?.tenantIds).toContain(
      job.tenantId,
    );
    expect(
      await code(await post(STAFF.implementation, `/provisioning-jobs/${created.id}/advance`)),
    ).toBe("conflict");
  });

  it("refuses self-hosted accounts, bad requests and staff without manage", async () => {
    expect(
      await code(
        await post(STAFF.implementation, "/provisioning-jobs", {
          ...request,
          accountId: ACCOUNT.coastal,
        }),
      ),
    ).toBe("conflict");
    expect(
      await code(
        await post(STAFF.implementation, "/provisioning-jobs", { ...request, trialDays: 90 }),
      ),
    ).toBe("invalid_request");
    expect(await code(await post(STAFF.lindqvist, "/provisioning-jobs", request))).toBe(
      "forbidden",
    );
  });
});
