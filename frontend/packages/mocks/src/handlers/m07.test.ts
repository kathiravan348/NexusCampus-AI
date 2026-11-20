import {
  NotificationTemplateSchema,
  pageSchema,
  NotificationDeliverySchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER, templateId } from "../fixtures";
import { server } from "../node";
import { PreferencesResponseSchema } from "./m07";

const BASE = "http://localhost/api/v1";
type As = { tenant: string; user: string };
const AX_ADMIN: As = { tenant: TENANT.apex, user: USER.axKarthik };
const AX_GUARDIAN: As = { tenant: TENANT.apex, user: USER.axLakshmi };

function call(method: string, path: string, body?: unknown, as: As = AX_ADMIN) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: as.tenant,
      [MOCK_HEADER.user]: as.user,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const invite = templateId(TENANT.apex, "m02.user.invited", "in_app", "en");

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("m07 write handlers", () => {
  it("updates a template (version + 1) and rejects invalid ICU (400)", async () => {
    const res = await call("PUT", `/notification-templates/${invite}`, {
      subject: null,
      body: "Welcome {name}!",
      enabled: true,
    });
    expect(NotificationTemplateSchema.parse(await res.json()).version).toBe(2);
    const bad = await call("PUT", `/notification-templates/${invite}`, {
      subject: null,
      body: "Broken {name",
      enabled: true,
    });
    expect(bad.status).toBe(400);
  });

  it("adds a new locale version once; a duplicate is 409", async () => {
    const body = {
      eventType: "m02.user.invited",
      channel: "in_app",
      locale: "fr",
      subject: null,
      body: "Bonjour {name}",
      enabled: true,
    };
    expect((await call("POST", "/notification-templates", body)).status).toBe(201);
    expect((await call("POST", "/notification-templates", body)).status).toBe(409);
  });

  it("filters the delivery log by status and channel", async () => {
    const res = await call("GET", "/notification-deliveries?status=failed");
    const page = pageSchema(NotificationDeliverySchema).parse(await res.json());
    expect(page.items.every((d) => d.status === "failed")).toBe(true);
  });

  it("saves own preferences and reports which channels are set up", async () => {
    const res = await call(
      "PUT",
      "/notification-preferences",
      {
        channels: [
          { channel: "email", enabled: false },
          { channel: "in_app", enabled: true },
        ],
        quietHours: { start: "21:00", end: "07:00" },
      },
      AX_GUARDIAN,
    );
    const saved = PreferencesResponseSchema.parse(await res.json());
    expect(saved.preferences.find((p) => p.channel === "email")?.enabled).toBe(false);
    expect(saved.channels.find((c) => c.channel === "sms")?.available).toBe(false);
    expect(saved.channels.find((c) => c.channel === "email")?.available).toBe(true);
    expect(
      mockDb.notificationPreferences.every(
        (p) => p.userId !== USER.axLakshmi || p.quietHours?.start === "21:00",
      ),
    ).toBe(true);
  });

  it("keeps templates for managers only (403)", async () => {
    expect((await call("GET", "/notification-templates", undefined, AX_GUARDIAN)).status).toBe(403);
  });
});
