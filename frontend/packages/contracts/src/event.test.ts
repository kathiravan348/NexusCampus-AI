import { describe, expect, it } from "vitest";
import { DomainEventSchema } from "./event";

const event = {
  eventId: "evt_01",
  tenantId: "ten_riverside",
  moduleId: "M02",
  eventType: "m02.user.invited",
  occurredAt: "2026-11-19T04:30:00Z",
  actorId: "usr_admin",
  correlationId: "req_8f2a",
  schemaVersion: 1,
  payload: { userId: "usr_42", roleId: "role_teacher" },
};

describe("DomainEvent", () => {
  it("accepts a valid event and a system event without actor", () => {
    expect(DomainEventSchema.safeParse(event).success).toBe(true);
    expect(DomainEventSchema.safeParse({ ...event, actorId: null }).success).toBe(true);
  });

  it("requires <module>.<entity>.<action>", () => {
    for (const eventType of [
      "m02.invited",
      "M02.user.invited",
      "m02.User.invited",
      "user.invited.now",
    ]) {
      expect(DomainEventSchema.safeParse({ ...event, eventType }).success, eventType).toBe(false);
    }
    expect(
      DomainEventSchema.safeParse({ ...event, eventType: "m02.user.roleChanged" }).success,
    ).toBe(true);
  });

  it("requires eventType to start with the emitting module", () => {
    expect(DomainEventSchema.safeParse({ ...event, eventType: "m17.user.invited" }).success).toBe(
      false,
    );
  });

  it("rejects local times, schema version 0 and extra keys", () => {
    expect(
      DomainEventSchema.safeParse({ ...event, occurredAt: "2026-11-19T10:00:00+05:30" }).success,
    ).toBe(false);
    expect(DomainEventSchema.safeParse({ ...event, schemaVersion: 0 }).success).toBe(false);
    expect(DomainEventSchema.safeParse({ ...event, ip: "10.0.0.1" }).success).toBe(false);
  });
});
