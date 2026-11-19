import { ApiErrorSchema } from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, ofTenant } from "../context";
import { mockDb, resetMockDb } from "../db";
import { FONT, TENANT, USER } from "../fixtures";
import { server } from "../node";
import { ThemeResponseSchema } from "./m03";

const BASE = "http://localhost/api/v1";
const RV_ADMIN = { tenant: TENANT.riverside, user: USER.rvHelen };
const RV_TEACHER = { tenant: TENANT.riverside, user: USER.rvTom };
const NB_ADMIN = { tenant: TENANT.northbridge, user: USER.nbRobert };

function putTheme(body: unknown, as: { tenant: string; user: string } = NB_ADMIN) {
  return fetch(`${BASE}/theme`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: as.tenant,
      [MOCK_HEADER.user]: as.user,
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  light: { "brand-primary": "#0F5132", "brand-primary-text": "#0F5132", "on-brand": "#FFFFFF" },
  dark: { "brand-primary": "#5EEAD4", "brand-primary-text": "#5EEAD4", "on-brand": "#0B1122" },
  fonts: { sans: FONT.inter, mono: FONT.jetbrainsMono },
  radius: { "radius-md": "6px" },
  density: "comfortable" as const,
  assets: { logoUrl: "/demo/northbridge/logo.svg", faviconUrl: null, loginImageUrl: null },
};

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("m03 write handlers", () => {
  it("PUT /theme updates the institution layer, bumps version, and records an audit event", async () => {
    const before = ofTenant(mockDb.auditEvents, TENANT.northbridge).length;
    const res = await putTheme(VALID_BODY, NB_ADMIN);
    expect(res.status).toBe(200);
    const saved = ThemeResponseSchema.parse(await res.json());
    expect(saved.effective.light["brand-primary"]).toBe("#0F5132");
    expect(saved.effective.radius["radius-md"]).toBe("6px");
    const instLayer = saved.layers.find((l) => l.scope.kind === "institution");
    expect(instLayer?.version).toBe(2);

    const after = ofTenant(mockDb.auditEvents, TENANT.northbridge);
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1]?.action).toBe("m03.theme.updated");
    expect(after[after.length - 1]?.moduleId).toBe("M03");
  });

  it("rejects locked group tokens with 409 conflict for Riverside", async () => {
    const res = await putTheme(
      {
        ...VALID_BODY,
        light: { "brand-primary": "#0F5132" },
        dark: {},
      },
      RV_ADMIN,
    );
    expect(res.status).toBe(409);
    const err = ApiErrorSchema.parse(await res.json()).error;
    expect(err.code).toBe("conflict");
    expect(err.details?.some((d) => d.path === "light.brand-primary")).toBe(true);
  });

  it("allows Riverside to save unlocked tokens while preserving locked group tokens", async () => {
    const res = await putTheme(
      {
        light: { "brand-accent": "#0F766E" },
        dark: {},
        fonts: { sans: FONT.inter, mono: null },
        radius: { "radius-md": "6px" },
        density: "comfortable",
        assets: { logoUrl: null, faviconUrl: null, loginImageUrl: null },
      },
      RV_ADMIN,
    );
    expect(res.status).toBe(200);
    const saved = ThemeResponseSchema.parse(await res.json());
    expect(saved.effective.light["brand-primary"]).toBe("#1D4ED8");
    expect(saved.effective.light["brand-accent"]).toBe("#0F766E");
    expect(saved.lockedTokens).toContain("brand-primary");
  });

  it("rejects contrast failures with 400 invalid_request and details", async () => {
    const res = await putTheme(
      {
        ...VALID_BODY,
        light: { "brand-primary": "#FDE047", "on-brand": "#FFFFFF" },
      },
      NB_ADMIN,
    );
    expect(res.status).toBe(400);
    const err = ApiErrorSchema.parse(await res.json()).error;
    expect(err.code).toBe("invalid_request");
    expect(err.details?.some((d) => d.path === "light.on-brand")).toBe(true);
  });

  it("rejects unknown colour/radius tokens and invalid asset URLs with 400", async () => {
    const unknownTokenRes = await putTheme(
      { ...VALID_BODY, light: { "not-a-token": "#112233" } },
      NB_ADMIN,
    );
    expect(unknownTokenRes.status).toBe(400);

    const unknownRadiusRes = await putTheme(
      { ...VALID_BODY, radius: { "radius-huge": "9px" } },
      NB_ADMIN,
    );
    expect(unknownRadiusRes.status).toBe(400);

    const badUrlRes = await putTheme(
      {
        ...VALID_BODY,
        assets: { logoUrl: "http://insecure.test/logo.png", faviconUrl: null, loginImageUrl: null },
      },
      NB_ADMIN,
    );
    expect(badUrlRes.status).toBe(400);
  });

  it("forbids users without m03.theme.manage", async () => {
    const res = await putTheme({ ...VALID_BODY, light: {}, dark: {} }, RV_TEACHER);
    expect(res.status).toBe(403);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("forbidden");
  });
});
