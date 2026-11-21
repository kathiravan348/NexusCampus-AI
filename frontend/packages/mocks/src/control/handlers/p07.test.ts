import { ApiErrorSchema, ReleaseSchema } from "@nexus/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONTROL_HEADER } from "../context";
import { controlDb, resetControlDb } from "../db";
import { DEPLOYMENT, STAFF } from "../fixtures";
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

describe("P07 mock writes", () => {
  it("refuses AI-drafted notes nobody reviewed, then signs and publishes", async () => {
    expect(await code(await post(STAFF.release, "/releases/rel-250/publish"))).toBe(
      "invalid_request",
    );
    const res = await post(STAFF.release, "/releases/rel-250/publish", { notesReviewed: true });
    const release = ReleaseSchema.parse(await res.json());
    expect(release.signed).toBe(true);
    expect(release.status).toBe("published");
  });

  it("rolls ring 2 out and moves its deployments to the release version", async () => {
    expect((await post(STAFF.release, "/rollouts/rol-241-2/start")).status).toBe(200);
    expect(controlDb.deployments.find((d) => d.id === DEPLOYMENT.northbridge)?.version).toBe(
      "2.4.1",
    );
    expect(await code(await post(STAFF.release, "/rollouts/rol-241-2/start"))).toBe("conflict");
  });

  it("keeps rollout rights to release managers", async () => {
    expect(await code(await post(STAFF.morgan, "/rollouts/rol-241-2/start"))).toBe("forbidden");
  });
});
