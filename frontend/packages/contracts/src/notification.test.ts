import { describe, expect, it } from "vitest";
import {
  NotificationDeliverySchema,
  NotificationPreferenceSchema,
  NotificationTemplateSchema,
  TimeOfDaySchema,
} from "./notification";

const template = {
  id: "ntp_fee_due_email_en",
  tenantId: "ten_riverside_group",
  eventType: "m22.fee.due",
  channel: "email",
  locale: "en-GB",
  subject: "Fee due for {learnerName}",
  body: "Dear {guardianName}, a fee of {amount} is due on {dueDate}.",
  version: 1,
  enabled: true,
  updatedAt: "2026-09-01T08:00:00Z",
};

const delivery = {
  id: "ndl_01",
  tenantId: "ten_riverside_group",
  templateId: "ntp_fee_due_email_en",
  recipientPersonId: "per_guardian_02",
  channel: "email",
  status: "delivered",
  reason: null,
  queuedAt: "2026-11-01T07:00:00Z",
  sentAt: "2026-11-01T07:00:05Z",
};

const preference = {
  userId: "usr_guardian_02",
  channel: "push",
  eventType: null,
  enabled: true,
  quietHours: { start: "22:00", end: "07:00" },
  timeZone: "Europe/London",
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: unknown[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

describe("NotificationTemplate", () => {
  it("accepts email with subject and in-app without", () => {
    expect(NotificationTemplateSchema.safeParse(template).success).toBe(true);
    expect(
      NotificationTemplateSchema.safeParse({ ...template, channel: "in_app", subject: null })
        .success,
    ).toBe(true);
  });

  it("requires subject exactly for email and rejects bad fields", () => {
    rejects(NotificationTemplateSchema, [
      { ...template, subject: null },
      { ...template, channel: "sms" },
      { ...template, channel: "fax", subject: null },
      { ...template, body: " " },
      { ...template, eventType: "feeDue" },
      { ...template, locale: "en_GB" },
      { ...template, version: 0 },
      { ...template, from: "school@example.edu" },
    ]);
  });
});

describe("NotificationDelivery", () => {
  it("accepts queued, delivered and suppressed deliveries", () => {
    expect(NotificationDeliverySchema.safeParse(delivery).success).toBe(true);
    expect(
      NotificationDeliverySchema.safeParse({ ...delivery, status: "queued", sentAt: null }).success,
    ).toBe(true);
    expect(
      NotificationDeliverySchema.safeParse({
        ...delivery,
        status: "suppressed",
        reason: "quiet_hours",
        sentAt: null,
      }).success,
    ).toBe(true);
  });

  it("enforces reason and sentAt rules", () => {
    rejects(NotificationDeliverySchema, [
      { ...delivery, status: "failed" },
      { ...delivery, reason: "bounced" },
      { ...delivery, sentAt: "2026-11-01T06:59:59Z" },
      { ...delivery, sentAt: null },
      { ...delivery, status: "queued" },
      { ...delivery, status: "suppressed", reason: "quiet_hours" },
      { ...delivery, status: "bounced" },
      { ...delivery, body: "Dear…" },
    ]);
  });
});

describe("NotificationPreference", () => {
  it("accepts quiet hours across midnight and no quiet hours", () => {
    expect(NotificationPreferenceSchema.safeParse(preference).success).toBe(true);
    expect(
      NotificationPreferenceSchema.safeParse({
        ...preference,
        eventType: "m22.fee.due",
        quietHours: null,
      }).success,
    ).toBe(true);
  });

  it("rejects bad times, equal start/end, bad zones", () => {
    for (const v of ["00:00", "23:59", "07:30"])
      expect(TimeOfDaySchema.safeParse(v).success, v).toBe(true);
    rejects(TimeOfDaySchema, ["24:00", "7:30", "07:60", "0730"]);
    rejects(NotificationPreferenceSchema, [
      { ...preference, quietHours: { start: "22:00", end: "22:00" } },
      { ...preference, quietHours: { start: "22:00" } },
      { ...preference, timeZone: "London" },
      { ...preference, channel: "pager" },
      { ...preference, extra: 1 },
    ]);
  });
});
