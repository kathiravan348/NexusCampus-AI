import {
  AcademicCalendarSchema,
  ApiErrorSchema,
  CampusSchema,
  LocaleSettingsSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, ofTenant } from "../context";
import { mockDb, resetMockDb } from "../db";
import { CALENDAR, CAMPUS, INSTITUTION, TENANT, USER } from "../fixtures";
import { server } from "../node";

const BASE = "http://localhost/api/v1";
const RV_ADMIN = { tenant: TENANT.riverside, user: USER.rvHelen };
const RV_TEACHER = { tenant: TENANT.riverside, user: USER.rvTom };

function send(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  as: { tenant: string; user: string } = RV_ADMIN,
): Promise<Response> {
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

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("m01 write handlers", () => {
  it("PUT /locale-settings updates locale and appends an audit event", async () => {
    const before = ofTenant(mockDb.auditEvents, TENANT.riverside).length;
    const res = await send("PUT", "/locale-settings", {
      defaultLocale: "en-GB",
      supportedLocales: ["en-GB", "fr-FR"],
      timeZone: "Europe/Paris",
      currency: "EUR",
      country: "GB",
      weekendDays: [6, 0],
    });
    expect(res.status).toBe(200);
    const saved = LocaleSettingsSchema.parse(await res.json());
    expect(saved.timeZone).toBe("Europe/Paris");
    expect(saved.currency).toBe("EUR");

    const after = ofTenant(mockDb.auditEvents, TENANT.riverside);
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1]?.action).toBe("m01.institution.updated");
  });

  it("rejects invalid locale settings with 400 and field details", async () => {
    const res = await send("PUT", "/locale-settings", {
      defaultLocale: "en-GB",
      supportedLocales: ["fr-FR"],
      timeZone: "Not/ATimeZone",
      currency: "GBP",
      country: "GB",
      weekendDays: [6, 0],
    });
    expect(res.status).toBe(400);
    const err = ApiErrorSchema.parse(await res.json()).error;
    expect(err.code).toBe("invalid_request");
    expect(err.details?.some((d) => d.path === "supportedLocales")).toBe(true);
    expect(err.details?.some((d) => d.path === "timeZone")).toBe(true);
  });

  it("forbids teachers without m01.institution.manage from writing", async () => {
    const res = await send(
      "PUT",
      "/locale-settings",
      {
        defaultLocale: "en-GB",
        supportedLocales: ["en-GB"],
        timeZone: "Europe/London",
        currency: "GBP",
        country: "GB",
        weekendDays: [6, 0],
      },
      RV_TEACHER,
    );
    expect(res.status).toBe(403);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("forbidden");
  });

  it("POST /campuses creates and PUT /campuses/:id updates a campus with audit events", async () => {
    const before = ofTenant(mockDb.auditEvents, TENANT.riverside).length;
    const createRes = await send("POST", "/campuses", {
      institutionId: INSTITUTION.riversideSchool,
      code: "RV-WEST",
      name: "West Campus",
      timeZone: null,
      address: { line1: "12 Oak Road", city: "Bristol", countryCode: "GB" },
    });
    expect(createRes.status).toBe(201);
    const created = CampusSchema.parse(await createRes.json());
    expect(created.code).toBe("RV-WEST");

    const dupRes = await send("POST", "/campuses", {
      institutionId: INSTITUTION.riversideSchool,
      code: "RV-WEST",
      name: "Duplicate",
      timeZone: null,
      address: { line1: "14 Oak Road", city: "Bristol", countryCode: "GB" },
    });
    expect(dupRes.status).toBe(400);
    expect(ApiErrorSchema.parse(await dupRes.json()).error.details?.[0]?.path).toBe("code");

    const updateRes = await send("PUT", `/campuses/${created.id}`, {
      institutionId: INSTITUTION.riversideSchool,
      code: "RV-WEST",
      name: "West Annex",
      timeZone: "Europe/London",
      address: { line1: "12 Oak Road", city: "Bristol", countryCode: "GB" },
    });
    expect(updateRes.status).toBe(200);
    expect(CampusSchema.parse(await updateRes.json()).name).toBe("West Annex");
    expect(ofTenant(mockDb.auditEvents, TENANT.riverside).length).toBe(before + 2);
  });

  it("returns 404 when updating another tenant's campus", async () => {
    const res = await send("PUT", `/campuses/${CAMPUS.littleSteps}`, {
      institutionId: INSTITUTION.riversideSchool,
      code: "RV-X",
      name: "Cross Tenant",
      timeZone: null,
      address: { line1: "1 High St", city: "London", countryCode: "GB" },
    });
    expect(res.status).toBe(404);
  });

  it("PUT /institutions/:id/calendars/:calendarId validates overlaps and saves valid changes", async () => {
    const path = `/institutions/${INSTITUTION.riversideSchool}/calendars/${CALENDAR.riversideSchool}`;
    const badRes = await send("PUT", path, {
      academicYear: "2026-27",
      startsOn: "2026-09-01",
      endsOn: "2027-07-21",
      periods: [
        { id: "p1", kind: "term", name: "Term 1", startsOn: "2026-09-02", endsOn: "2026-12-20" },
        { id: "p2", kind: "term", name: "Term 2", startsOn: "2026-12-10", endsOn: "2027-03-20" },
      ],
      holidays: [],
      displayCalendar: "gregory",
    });
    expect(badRes.status).toBe(400);
    const badErr = ApiErrorSchema.parse(await badRes.json()).error;
    expect(badErr.code).toBe("invalid_request");
    expect(badErr.details?.some((d) => d.path === "periods.1")).toBe(true);

    const okRes = await send("PUT", path, {
      academicYear: "2026-27",
      startsOn: "2026-09-01",
      endsOn: "2027-07-21",
      periods: [
        { id: "p1", kind: "term", name: "Term 1", startsOn: "2026-09-02", endsOn: "2026-12-18" },
      ],
      holidays: [{ date: "2026-12-25", name: "Christmas Day" }],
      displayCalendar: "gregory",
    });
    expect(okRes.status).toBe(200);
    const saved = AcademicCalendarSchema.parse(await okRes.json());
    expect(saved.holidays).toHaveLength(1);
  });
});
