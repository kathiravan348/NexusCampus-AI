import { KpiSchema, RoleHomeSchema } from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { LEARNER, PERSON, TENANT, USER } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: TENANT.littleSteps, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  vi.useRealTimers();
});
afterAll(() => server.close());

describe("M28 read handlers", () => {
  it("builds a family home for linked learners and counts only visible communication", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T08:00:00Z"));

    const response = await get("/me/home", USER.lsSunita);
    expect(response.status).toBe(200);
    const home = RoleHomeSchema.parse(await response.json());
    expect(home).toMatchObject({
      role: "family",
      personId: PERSON.lsSunita,
      generatedAt: "2026-11-24T08:00:00.000Z",
    });
    expect([...home.learnerIds].sort()).toEqual([LEARNER.lsIshaan, LEARNER.lsRohan].sort());
    expect(home.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "attendance", titleKey: "m28.card.attendance" }),
        expect.objectContaining({ kind: "fees", titleKey: "m28.card.fees" }),
        expect.objectContaining({ kind: "messages", count: 1 }),
        expect.objectContaining({ kind: "notices", count: 1 }),
      ]),
    );
  });

  it("builds a staff home for a teacher and a leader home for an administrator", async () => {
    const teacher = await get("/me/home", USER.lsArjun);
    expect(teacher.status).toBe(200);
    const staffHome = RoleHomeSchema.parse(await teacher.json());
    expect(staffHome).toMatchObject({ role: "staff", personId: PERSON.lsArjun, learnerIds: [] });
    expect(staffHome.cards.map((row) => row.kind)).toEqual([
      "attendance",
      "leave",
      "messages",
      "notices",
    ]);

    const admin = await get("/me/home");
    expect(admin.status).toBe(200);
    const leaderHome = RoleHomeSchema.parse(await admin.json());
    expect(leaderHome).toMatchObject({ role: "leader", personId: PERSON.lsPriya, learnerIds: [] });
    expect(leaderHome.cards.map((row) => row.kind)).toEqual(["kpi", "alerts"]);
  });

  it("computes tenant-local KPIs using the institution currency and request time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T08:00:00Z"));
    const response = await get("/dashboards/kpis");
    expect(response.status).toBe(200);
    const metrics = KpiSchema.array().parse(await response.json());
    expect(metrics.map((row) => row.labelKey)).toEqual(metrics.map((row) => `m28.kpi.${row.code}`));
    expect(metrics.every((row) => row.asOf === "2026-11-24T08:00:00.000Z")).toBe(true);
    const byCode = Object.fromEntries(metrics.map((row) => [row.code, row]));
    const invoices = mockDb.feeInvoices.filter((row) => row.tenantId === TENANT.littleSteps);
    const marks = mockDb.attendanceMarks.filter((row) => row.tenantId === TENANT.littleSteps);
    const absences = marks.filter((row) => row.status === "absent").length;

    expect(byCode["attendance"]).toMatchObject({ unit: "percent", currency: null });
    expect(byCode["attendance"]?.value).toBeCloseTo(
      ((marks.length - absences) / marks.length) * 100,
    );
    expect(byCode["collected"]).toMatchObject({
      unit: "minor_units",
      currency: "INR",
      value: invoices.reduce((sum, row) => sum + row.paid, 0),
    });
    expect(byCode["outstanding"]).toMatchObject({
      unit: "minor_units",
      currency: "INR",
      value: invoices.reduce((sum, row) => sum + row.total - row.paid, 0),
    });
    expect(byCode["admissions"]).toMatchObject({ unit: "count", currency: null, value: 2 });
    const active = mockDb.learners.filter(
      (row) =>
        row.tenantId === TENANT.littleSteps &&
        (row.status === "enrolled" || row.status === "on_leave"),
    );
    expect(byCode["learners"]).toMatchObject({
      unit: "count",
      currency: null,
      value: active.length,
    });
  });

  it("denies KPIs without the dashboard permission and homes without a role profile", async () => {
    expect((await get("/dashboards/kpis", USER.lsSunita)).status).toBe(403);
    mockDb.roleProfiles = mockDb.roleProfiles.filter((row) => row.personId !== PERSON.lsPriya);
    expect((await get("/me/home")).status).toBe(403);
  });
});
