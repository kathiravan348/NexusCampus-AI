import { AiSettingsSchema } from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { PERSON, TENANT, USER } from "../fixtures";
import { server } from "../node";
import { AskResponseSchema } from "./m11";

const BASE = "http://localhost/api/v1";
type As = { tenant: string; user: string };
const RV_ADMIN: As = { tenant: TENANT.riverside, user: USER.rvHelen };
const RV_LEARNER: As = { tenant: TENANT.riverside, user: USER.rvOliver };
const LS_ADMIN: As = { tenant: TENANT.littleSteps, user: USER.lsPriya };
const AX_ADMIN: As = { tenant: TENANT.apex, user: USER.axKhalid };

function call(method: string, path: string, body: unknown, as: As) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: as.tenant,
      [MOCK_HEADER.user]: as.user,
    },
    body: JSON.stringify(body),
  });
}
const ask = (question: string, as: As, locale = "en-GB") =>
  call("POST", "/assist/ask", { question, locale }, as);
const detail = async (res: Response) =>
  ((await res.json()) as { error: { details?: { path: string }[] } }).error.details?.[0]?.path;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("POST /assist/ask", () => {
  it("answers with sources and decrements credits", async () => {
    const before = mockDb.aiCredits.find((c) => c.tenantId === TENANT.riverside)!.used;
    const res = AskResponseSchema.parse(
      await (await ask("When does the term end?", RV_ADMIN)).json(),
    );
    expect(res.answer?.aiGenerated).toBe(true);
    expect(res.answer?.sources.length).toBeGreaterThan(0);
    expect(res.credits.used).toBe(before + res.answer!.creditsUsed);
  });

  it("returns no answer (and no charge) when nothing matches", async () => {
    const res = AskResponseSchema.parse(await (await ask("Favourite colour?", RV_ADMIN)).json());
    expect(res.answer).toBeNull();
  });

  it("refuses when AI is off, credits are gone, or a minor lacks guardian consent", async () => {
    // Little Steps has M11 switched off entirely → module_disabled.
    expect((await ask("term", LS_ADMIN)).status).toBe(403);

    const settings = mockDb.aiSettings.find((s) => s.tenantId === TENANT.riverside)!;
    Object.assign(settings, { enabled: false });
    const off = await ask("term", RV_ADMIN);
    expect(await detail(off)).toBe("ai_off");
    Object.assign(settings, { enabled: true });

    const credit = mockDb.aiCredits.find((c) => c.tenantId === TENANT.apex)!;
    Object.assign(credit, { used: credit.granted });
    const broke = await ask("الدفعة", AX_ADMIN, "ar-AE");
    expect(broke.status).toBe(429);
    expect(await detail(broke)).toBe("credits");

    const consent = mockDb.consents.find(
      (c) => c.personId === PERSON.rvOliver && c.purpose === "ai_features",
    )!;
    mockDb.consents.splice(mockDb.consents.indexOf(consent), 1);
    const minor = await ask("term", RV_LEARNER);
    expect(minor.status).toBe(403);
    expect(await detail(minor)).toBe("consent");
  });
});

describe("PUT /ai/settings", () => {
  const body = {
    enabled: true,
    modules: { M01: true, M02: false },
    safeguardingEnabled: false,
    defaultTier: "fast",
  };

  it("saves switches and tier", async () => {
    const res = await call("PUT", "/ai/settings", body, RV_ADMIN);
    const saved = AiSettingsSchema.parse(await res.json());
    expect(saved.defaultTier).toBe("fast");
    expect(saved.modules["M02"]).toBe(false);
  });

  it("never unblocks health or vault (400)", async () => {
    const res = await call("PUT", "/ai/settings", { ...body, modules: { M83: true } }, RV_ADMIN);
    expect(res.status).toBe(400);
    expect(await detail(res)).toBe("modules.M83");
  });
});
