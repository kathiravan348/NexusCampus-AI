import {
  MeetingBookingSchema,
  MeetingSlotSchema,
  MessageThreadSchema,
  NoticeSchema,
  ThreadMessageSchema,
  pageSchema,
  type Notice,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { CLASS_GROUP, MESSAGE_THREAD, PERSON, TENANT, USER } from "../fixtures";
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

describe("M24 read handlers", () => {
  it("lists tenant notices, meeting slots and booking notes for administrators", async () => {
    const endpoints = [
      ["/notices", pageSchema(NoticeSchema), 2],
      ["/meeting-slots", pageSchema(MeetingSlotSchema), 2],
      ["/meeting-bookings", pageSchema(MeetingBookingSchema), 1],
    ] as const;
    for (const [path, schema, total] of endpoints) {
      const response = await get(path);
      expect(response.status).toBe(200);
      const page = schema.parse(await response.json());
      expect(page.total).toBe(total);
      expect(page.items.every((row) => row.tenantId === TENANT.littleSteps)).toBe(true);
    }
    const response = await get("/meeting-bookings");
    const { items } = pageSchema(MeetingBookingSchema).parse(await response.json());
    expect(items[0]?.note).toBe(mockDb.meetingBookings[0]?.note);
  });

  it("checks participant membership for every role and conceals foreign IDs", async () => {
    const [groupThread, directThread] = MESSAGE_THREAD.ls;
    const adminThreads = await get("/message-threads");
    const adminPage = pageSchema(MessageThreadSchema).parse(await adminThreads.json());
    expect(adminPage.items.map((row) => row.id)).toEqual([directThread]);
    const guardianThreads = await get("/message-threads", USER.lsSunita);
    const { items: participating } = pageSchema(MessageThreadSchema).parse(
      await guardianThreads.json(),
    );
    expect(participating.map((row) => row.id)).toEqual([groupThread, directThread]);
    const messages = await get(`/message-threads/${groupThread}/messages`, USER.lsSunita);
    expect(messages.status).toBe(200);
    expect(pageSchema(ThreadMessageSchema).parse(await messages.json()).items).toMatchObject([
      { threadId: groupThread, tenantId: TENANT.littleSteps },
      { threadId: groupThread, tenantId: TENANT.littleSteps },
    ]);
    expect((await get(`/message-threads/${groupThread}/messages`)).status).toBe(404);
    expect((await get(`/message-threads/${MESSAGE_THREAD.rv[0]}/messages`)).status).toBe(404);

    const foreignSlot = mockDb.meetingSlots.find((row) => row.tenantId === TENANT.riverside)!;
    const foreignProfileId = foreignSlot.staffProfileId;
    const foreignSlots = await get(`/meeting-slots?staffProfileId=${foreignProfileId}`);
    expect(foreignSlots.status).toBe(404);
    const ownSlot = mockDb.meetingSlots.find((row) => row.tenantId === TENANT.littleSteps)!;
    const filtered = await get(`/meeting-slots?staffProfileId=${ownSlot.staffProfileId}`);
    expect(pageSchema(MeetingSlotSchema).parse(await filtered.json()).total).toBe(2);
  });

  it("shows only published, unexpired notices matching the guardian's audience", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T08:00:00Z"));
    const published = mockDb.notices.find(
      (row) => row.tenantId === TENANT.littleSteps && row.status === "published",
    )!;
    const audienceTests: [string, Notice["audience"], boolean][] = [
      ["class-notice", { kind: "class_groups", ids: [CLASS_GROUP.lsSeedlings] }, true],
      ["other-class", { kind: "class_groups", ids: [CLASS_GROUP.rvNorthYearTen] }, false],
      ["guardian-role", { kind: "roles", ids: ["guardian"] }, true],
      ["teacher-role", { kind: "roles", ids: ["teacher"] }, false],
      ["guardian-direct", { kind: "people", ids: [PERSON.lsSunita] }, true],
      ["other-person", { kind: "people", ids: [PERSON.lsPriya] }, false],
    ];
    for (const [id, audience] of audienceTests) {
      mockDb.notices.push({ ...published, id, audience });
    }
    mockDb.notices.push({
      ...published,
      id: "expired-notice",
      expiresAt: "2026-11-24T08:00:00Z",
    });

    const response = await get("/notices", USER.lsSunita);
    expect(response.status).toBe(200);
    const { items } = pageSchema(NoticeSchema).parse(await response.json());
    expect(items.map((row) => row.id)).toEqual([
      published.id,
      ...audienceTests.filter(([, , visible]) => visible).map(([id]) => id),
    ]);
  });

  it("limits bookings by guardian or teacher and masks notes for teachers", async () => {
    const owned = mockDb.meetingBookings.find((row) => row.tenantId === TENANT.littleSteps)!;
    const teacherSlot = mockDb.meetingSlots.find((row) => row.id === owned.slotId)!;
    const admin = mockDb.roleProfiles.find(
      (row) =>
        row.tenantId === TENANT.littleSteps &&
        row.personId === PERSON.lsPriya &&
        row.kind === "staff",
    )!;
    mockDb.meetingSlots.push({ ...teacherSlot, id: "admin-slot", staffProfileId: admin.id });
    mockDb.meetingBookings.push({
      ...owned,
      id: "unrelated-booking",
      slotId: "admin-slot",
      guardianPersonId: PERSON.lsPriya,
    });

    const guardian = await get("/meeting-bookings", USER.lsSunita);
    expect(guardian.status).toBe(200);
    const guardianPage = pageSchema(MeetingBookingSchema).parse(await guardian.json());
    expect(guardianPage.items).toEqual([owned]);

    const teacher = await get("/meeting-bookings", USER.lsArjun);
    expect(teacher.status).toBe(200);
    expect(pageSchema(MeetingBookingSchema).parse(await teacher.json()).items).toEqual([
      { ...owned, note: null },
    ]);
  });

  it("requires read permission on all communication endpoints", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    for (const path of [
      "/message-threads",
      `/message-threads/${MESSAGE_THREAD.ls[1]}/messages`,
      "/notices",
      "/meeting-slots",
      "/meeting-bookings",
    ]) {
      expect((await get(path)).status).toBe(403);
    }
  });
});
