import { HttpResponse, http } from "msw";
import { z } from "zod";
import { ApiClient, ApiRequestError } from "./client";
import { TenantResponseSchema } from "./modules/m01";
import { ADMIN, server, startMockServer } from "./test-utils";

startMockServer();

const identity = () => ({ tenantId: ADMIN.tenantId, userId: ADMIN.userId });

function captureHeaders(): { headers: Headers | null } {
  const seen: { headers: Headers | null } = { headers: null };
  server.use(
    http.get("*/api/v1/probe", ({ request }) => {
      seen.headers = request.headers;
      return HttpResponse.json({ ok: true });
    }),
  );
  return seen;
}

const Probe = z.strictObject({ ok: z.literal(true) });

describe("ApiClient", () => {
  it("sends tenant, user and scenario headers in mock mode", async () => {
    const seen = captureHeaders();
    const client = new ApiClient({ mode: "mock", identity, scenario: () => "slow" });
    await client.get("/probe", Probe, { a: 1, skip: null });
    expect(seen.headers?.get("X-Nexus-Tenant")).toBe(ADMIN.tenantId);
    expect(seen.headers?.get("X-Nexus-User")).toBe(ADMIN.userId);
    expect(seen.headers?.get("X-Nexus-Scenario")).toBe("slow");
  });

  it("sends only the tenant header in real mode", async () => {
    const seen = captureHeaders();
    const client = new ApiClient({ mode: "real", identity, scenario: () => "error" });
    await client.get("/probe", Probe);
    expect(seen.headers?.get("X-Nexus-Tenant")).toBe(ADMIN.tenantId);
    expect(seen.headers?.has("X-Nexus-User")).toBe(false);
    expect(seen.headers?.has("X-Nexus-Scenario")).toBe(false);
  });

  it("parses a valid response with its schema", async () => {
    const client = new ApiClient({ mode: "mock", identity });
    const tenant = await client.get("/tenant", TenantResponseSchema);
    expect(tenant.institutions.every((i) => i.tenantId === ADMIN.tenantId)).toBe(true);
  });

  it("throws when a response breaks its contract", async () => {
    server.use(http.get("*/api/v1/tenant", () => HttpResponse.json({ group: null })));
    const client = new ApiClient({ mode: "mock", identity });
    await expect(client.get("/tenant", TenantResponseSchema)).rejects.toMatchObject({
      status: 200,
      error: { code: "internal" },
    });
  });

  it("turns the error scenario into an ApiRequestError", async () => {
    const client = new ApiClient({ mode: "mock", identity, scenario: () => "error" });
    const error = await client.get("/tenant", TenantResponseSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 500, error: { code: "internal" }, offline: false });
  });

  it("keeps the server's error code (401 without a session)", async () => {
    const client = new ApiClient({ mode: "mock", identity: () => null });
    await expect(client.get("/tenant", TenantResponseSchema)).rejects.toMatchObject({
      status: 401,
      error: { code: "unauthorized" },
    });
  });

  it("reports a network failure as offline with status 0", async () => {
    const client = new ApiClient({ mode: "mock", identity, scenario: () => "offline" });
    await expect(client.get("/tenant", TenantResponseSchema)).rejects.toMatchObject({
      status: 0,
      offline: true,
      error: { code: "internal" },
    });
  });

  it("sends a JSON body and extra headers on writes", async () => {
    let body: unknown = null;
    let key: string | null = null;
    server.use(
      http.post("*/api/v1/probe", async ({ request }) => {
        body = await request.json();
        key = request.headers.get("Idempotency-Key");
        return HttpResponse.json({ ok: true });
      }),
    );
    const client = new ApiClient({ mode: "mock", identity });
    await client.send("POST", "/probe", { n: 1 }, Probe, { headers: { "Idempotency-Key": "k-1" } });
    expect(body).toEqual({ n: 1 });
    expect(key).toBe("k-1");
  });

  it("falls back to an internal error when the error body is not an ApiError", async () => {
    server.use(http.get("*/api/v1/probe", () => new HttpResponse("nope", { status: 502 })));
    const client = new ApiClient({ mode: "mock", identity });
    await expect(client.get("/probe", Probe)).rejects.toMatchObject({
      status: 502,
      error: { code: "internal", message: "HTTP 502" },
    });
  });
});
