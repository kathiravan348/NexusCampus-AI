import { ApiErrorSchema, LicenceFileSchema, LicenceSchema } from "@nexus/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONTROL_HEADER } from "../context";
import { resetControlDb } from "../db";
import { STAFF } from "../fixtures";
import { CONTROL_API_BASE } from "../route";
import { controlHandlers } from "./index";

const server = setupServer(...controlHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetControlDb();
});
afterAll(() => server.close());

const call = (staff: string, path: string, method = "GET") =>
  fetch(`http://localhost${CONTROL_API_BASE}${path}`, {
    method,
    headers: { [CONTROL_HEADER.staff]: staff },
  });
const code = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;

describe("P05 mock writes", () => {
  it("renews a term licence by a year with a new fingerprint", async () => {
    const res = await call(STAFF.implementation, "/licences/lic-ct-2026/renew", "POST");
    const renewed = LicenceSchema.parse(await res.json());
    expect(renewed.expiresAt).toBe("2028-03-31");
    expect(renewed.supportEndsAt).toBe("2028-03-31");
    expect(renewed.fingerprint).not.toBe("c0a5".repeat(16));
  });

  it("renews only support on a perpetual licence", async () => {
    const res = await call(STAFF.implementation, "/licences/lic-al-perp/renew", "POST");
    const renewed = LicenceSchema.parse(await res.json());
    expect(renewed.expiresAt).toBeNull();
    expect(renewed.supportEndsAt).toBe("2027-12-31");
  });

  it("serves the signed file without our internal fields, to issuers only", async () => {
    const file = LicenceFileSchema.parse(
      await (await call(STAFF.implementation, "/licence-files/lic-al-perp")).json(),
    );
    expect(Object.keys(file.payload)).not.toContain("fingerprint");
    expect(await code(await call(STAFF.morgan, "/licence-files/lic-al-perp"))).toBe("forbidden");
  });
});
