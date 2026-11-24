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

function postReply(
  threadId: string,
  body: unknown,
  options: { user?: string; tenant?: string; key?: string } = {},
) {
  const { user = USER.lsArjun, tenant = TENANT.littleSteps, key = crypto.randomUUID() } = options;
  return fetch(`http://localhost/api/v1/message-threads/${threadId}/messages`, {
    method: "POST",
    headers: {
      [MOCK_HEADER.tenant]: tenant,
      [MOCK_HEADER.user]: user,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
}

describe("M24 message reply handler", () => {
  it("appends a reply, updates lastMessageAt, and replays repeated keys", async () => {
    const threadId = MESSAGE_THREAD.ls[0];
    const thread = mockDb.messageThreads.find((row) => row.id === threadId)!;
    const count = mockDb.threadMessages.length;
    const key = crypto.randomUUID();
    const [first, second] = await Promise.all([
      postReply(threadId, { body: "  Confirmed for tomorrow  " }, { key }),
      postReply(threadId, { body: "  Confirmed for tomorrow  " }, { key }),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    const created = ThreadMessageSchema.parse(await first.json());
    expect(await second.json()).toEqual(created);
    expect(created).toMatchObject({
      tenantId: TENANT.littleSteps,
      threadId,
      senderPersonId: PERSON.lsArjun,
      body: "Confirmed for tomorrow",
      attachmentIds: [],
      editedAt: null,
      readByPersonIds: [PERSON.lsArjun],
      deviceId: null,
    });
    expect(thread.lastMessageAt).toBe(created.sentAt);
    expect(mockDb.threadMessages).toHaveLength(count + 1);

    thread.archived = true;
    const replay = await postReply(threadId, { body: "Confirmed for tomorrow" }, { key });
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(created);
  });

  it("returns 409 for archived threads and 400 for invalid bodies without leaks", async () => {
    const threadId = MESSAGE_THREAD.ls[0];
    const thread = mockDb.messageThreads.find((row) => row.id === threadId)!;
    const count = mockDb.threadMessages.length;

    const tooLong = "x".repeat(4001);
    for (const payload of [
      { body: "" },
      { body: "   " },
      { body: tooLong },
      { body: "ok", extra: true },
    ]) {
      const response = await postReply(threadId, payload);
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain('"code":"invalid_request"');
      expect(text).toContain('"path":"body"');
      expect(text).not.toContain(tooLong.slice(0, 40));
    }

    thread.archived = true;
    const conflict = await postReply(threadId, { body: "Private reply content" });
    expect(conflict.status).toBe(409);
    const conflictText = await conflict.text();
    expect(conflictText).toContain('"code":"conflict"');
    expect(conflictText).toContain('"path":"archived"');
    expect(conflictText).not.toContain("Private reply content");
    expect(mockDb.threadMessages).toHaveLength(count);
  });

  it("enforces participation, send permission, and M24 entitlement", async () => {
    const [groupThread, directThread] = MESSAGE_THREAD.ls;
    expect((await postReply(directThread, { body: "Hello" }, { user: USER.lsArjun })).status).toBe(
      404,
    );
    expect(
      (await postReply(MESSAGE_THREAD.rv[0], { body: "Hello" }, { user: USER.lsSunita })).status,
    ).toBe(404);

    for (const role of mockDb.roles) {
      role.permissions = role.permissions.filter((code) => code !== "m24.messages.send");
    }
    expect((await postReply(groupThread, { body: "Hello" })).status).toBe(403);

    resetMockDb();
    const entitlement = mockDb.entitlements.find(
      (row) => row.tenantId === TENANT.littleSteps && row.moduleId === "M24",
    )!;
    entitlement.enabled = false;
    const disabled = await postReply(groupThread, { body: "Hello" });
    expect(disabled.status).toBe(403);
    expect(await disabled.text()).toContain('"code":"module_disabled"');
  });
});
