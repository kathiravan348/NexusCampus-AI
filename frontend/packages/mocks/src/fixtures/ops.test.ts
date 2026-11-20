import * as C from "@nexus/contracts";
import { describe, expect, it } from "vitest";
import * as F from "./index";

interface Parser {
  safeParse(value: unknown): { error?: unknown };
}

const SETS: [string, Parser, readonly unknown[]][] = [
  ["AUDIT_EVENTS", C.AuditEventSchema, F.AUDIT_EVENTS],
  ["CONSENTS", C.ConsentSchema, F.CONSENTS],
  ["DATA_SUBJECT_REQUESTS", C.DataSubjectRequestSchema, F.DATA_SUBJECT_REQUESTS],
  ["COMPLIANCE_PACKS", C.CompliancePackSchema, F.COMPLIANCE_PACKS],
  ["NOTIFICATION_TEMPLATES", C.NotificationTemplateSchema, F.NOTIFICATION_TEMPLATES],
  ["NOTIFICATION_DELIVERIES", C.NotificationDeliverySchema, F.NOTIFICATION_DELIVERIES],
  ["NOTIFICATION_PREFERENCES", C.NotificationPreferenceSchema, F.NOTIFICATION_PREFERENCES],
  ["DEVICE_SYNCS", C.DeviceSyncSchema, F.DEVICE_SYNCS],
  ["SYNC_CONFLICTS", C.SyncConflictSchema, F.SYNC_CONFLICTS],
  ["AI_SETTINGS", C.AiSettingsSchema, F.AI_SETTINGS],
  ["AI_CREDITS", C.AiCreditSchema, F.AI_CREDITS],
  ["ASSIST_ANSWERS", C.AssistAnswerSchema, F.ASSIST_ANSWERS],
  ["KEY_STATUSES", C.KeyStatusSchema, F.KEY_STATUSES],
  ["ACCESS_REQUESTS", C.AccessRequestSchema, F.ACCESS_REQUESTS],
  ["ACCESS_GRANTS", C.AccessGrantSchema, F.ACCESS_GRANTS],
  ["BREAK_GLASS_NOTICES", C.BreakGlassNoticeSchema, F.BREAK_GLASS_NOTICES],
];

const NOW = Date.parse(F.DEMO_NOW);
const at = (iso: string) => Date.parse(iso);
const tenantIds = F.DEMO_TENANTS.map((t) => t.tenantId);
const institutionOf = (tenantId: string) => F.INSTITUTIONS.find((i) => i.tenantId === tenantId);

/** Every id a fixture may point at, with its tenant. */
const tenantOf = new Map<string, string>(
  [
    ...F.PEOPLE,
    ...F.USERS,
    ...F.INSTITUTIONS,
    ...F.CAMPUSES,
    ...F.THEMES,
    ...F.ACADEMIC_CALENDARS,
    ...F.CONSENTS,
    ...F.DATA_SUBJECT_REQUESTS,
    ...F.NOTIFICATION_TEMPLATES,
    ...F.DEVICE_SYNCS,
    ...F.ACCESS_REQUESTS,
    ...F.ACCESS_GRANTS,
    ...F.BREAK_GLASS_NOTICES,
  ].map((r) => [r.id, r.tenantId]),
);
const resolves = (tenantId: string, id: string | null) =>
  id === null || tenantOf.get(id) === tenantId;
const isUser = (id: string | null) => id !== null && F.USERS.some((u) => u.id === id);

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** `HH:mm` of an instant in a time zone. */
const localTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
const inQuietHours = (time: string, q: { start: string; end: string }) =>
  q.start < q.end ? time >= q.start && time < q.end : time >= q.start || time < q.end;

describe("ops fixtures (D16)", () => {
  it("parse against their contracts", () => {
    for (const [name, schema, rows] of SETS) {
      rows.forEach((row, i) =>
        expect(schema.safeParse(row).error, `${name}[${i}]`).toBeUndefined(),
      );
    }
  });

  it("have unique ids and only demo tenants", () => {
    for (const [name, , rows] of SETS) {
      const keyed = rows.filter(
        (r): r is { id: string } => typeof (r as { id?: unknown }).id === "string",
      );
      expect(new Set(keyed.map((r) => r.id)).size, name).toBe(keyed.length);
      for (const r of rows) {
        const tenantId = (r as { tenantId?: string }).tenantId;
        if (tenantId !== undefined) expect(tenantIds, name).toContain(tenantId);
      }
    }
  });

  it("keep a verifiable hash chain of 20–40 events per tenant, in time order", async () => {
    for (const tenantId of tenantIds) {
      const chain = F.AUDIT_EVENTS.filter((e) => e.tenantId === tenantId);
      expect(chain.length, tenantId).toBeGreaterThanOrEqual(20);
      expect(chain.length, tenantId).toBeLessThanOrEqual(40);
      let prev: string | null = null;
      for (const e of chain) {
        expect(e.prevHash, e.id).toBe(prev);
        expect(e.hash, e.id).toBe(await sha256(F.auditHashInput(e)));
        expect(at(e.occurredAt), e.id).toBeLessThanOrEqual(NOW);
        prev = e.hash;
      }
      const times = chain.map((e) => at(e.occurredAt));
      expect(times, tenantId).toEqual([...times].sort((a, b) => a - b));
    }
  });

  it("resolve audit actors, targets, devices and grants", () => {
    for (const e of F.AUDIT_EVENTS) {
      expect(resolves(e.tenantId, e.targetId), e.id).toBe(true);
      expect(resolves(e.tenantId, e.deviceId), e.id).toBe(true);
      if (e.actorKind === "user") {
        expect(isUser(e.actorId) && resolves(e.tenantId, e.actorId), e.id).toBe(true);
      }
      if (e.actorKind === "provider_grant") {
        const grant = F.ACCESS_GRANTS.find((g) => g.id === e.grantId);
        const request = F.ACCESS_REQUESTS.find((r) => r.id === grant?.requestId);
        expect(grant?.tenantId, e.id).toBe(e.tenantId);
        expect(e.actorId, e.id).toBe(request?.staffRef);
        expect(grant?.modules, e.id).toContain(e.moduleId);
        expect(at(e.occurredAt)).toBeGreaterThanOrEqual(at(grant!.startsAt));
        expect(at(e.occurredAt)).toBeLessThan(at(grant!.endsAt));
      }
    }
    const apexGrantEvents = F.AUDIT_EVENTS.filter(
      (e) => e.tenantId === F.TENANT.apex && e.actorKind === "provider_grant",
    );
    expect(apexGrantEvents).toHaveLength(1);
  });

  it("record guardian consent for EY/K12 minors and one request of each kind", () => {
    for (const c of F.CONSENTS) {
      expect([F.TENANT.littleSteps, F.TENANT.riverside], c.id).toContain(c.tenantId);
      expect(F.PEOPLE.find((p) => p.id === c.personId)?.isMinor, c.id).toBe(true);
      const linked = F.GUARDIAN_LINKS.some(
        (l) => l.learnerPersonId === c.personId && l.guardianPersonId === c.givenByPersonId,
      );
      expect(linked, c.id).toBe(true);
    }
    const ai = F.CONSENTS.filter((c) => c.purpose === "ai_features");
    expect(ai.every((c) => c.status === "granted")).toBe(true);
    const media = F.CONSENTS.filter((c) => c.purpose === "media_sharing").map((c) => c.status);
    expect(media.sort()).toEqual(["pending", "withdrawn"]);

    expect(F.DATA_SUBJECT_REQUESTS.map((r) => r.kind).sort()).toEqual([
      "access",
      "correct",
      "delete",
      "export",
    ]);
    for (const r of F.DATA_SUBJECT_REQUESTS) {
      expect(resolves(r.tenantId, r.personId), r.id).toBe(true);
      if (r.handledBy !== null)
        expect(isUser(r.handledBy) && resolves(r.tenantId, r.handledBy)).toBe(true);
      const days = Math.min(
        ...(F.TENANT_COMPLIANCE[r.tenantId] ?? []).map(
          (code) => F.COMPLIANCE_PACKS.find((p) => p.code === code)?.dsrDueDays ?? 0,
        ),
      );
      expect(at(r.dueAt) - at(r.receivedAt), r.id).toBe(days * 86_400_000);
    }
    const overdue = F.DATA_SUBJECT_REQUESTS.filter(
      (r) => r.completedAt === null && at(r.dueAt) < NOW,
    );
    expect(overdue).toHaveLength(1);
  });

  it("map every tenant to compliance packs of its region", () => {
    for (const tenantId of tenantIds) {
      const codes = F.TENANT_COMPLIANCE[tenantId] ?? [];
      expect(codes.length, tenantId).toBeGreaterThan(0);
      for (const code of codes) {
        const pack = F.COMPLIANCE_PACKS.find((p) => p.code === code);
        expect(pack?.region, `${tenantId}/${code}`).toBe(institutionOf(tenantId)?.region);
      }
    }
  });

  it("resolve notification templates, deliveries and preferences", () => {
    for (const tenantId of tenantIds) {
      const locale = institutionOf(tenantId)!.locale;
      const own = F.NOTIFICATION_TEMPLATES.filter((t) => t.tenantId === tenantId);
      for (const t of own) expect(locale.supportedLocales, t.id).toContain(t.locale);
      const inDefault = own.filter((t) => t.locale === locale.defaultLocale);
      expect(inDefault, tenantId).toHaveLength(F.NOTIFICATION_EVENTS.length * 2);
    }
    expect(
      F.NOTIFICATION_TEMPLATES.some((t) => t.tenantId === F.TENANT.apex && t.locale === "ta-IN"),
    ).toBe(true);

    for (const d of F.NOTIFICATION_DELIVERIES) {
      const template = F.NOTIFICATION_TEMPLATES.find((t) => t.id === d.templateId);
      expect(template?.tenantId, d.id).toBe(d.tenantId);
      expect(template?.channel, d.id).toBe(d.channel);
      expect(resolves(d.tenantId, d.recipientPersonId), d.id).toBe(true);
    }
    const statuses = new Set(F.NOTIFICATION_DELIVERIES.map((d) => d.status));
    expect([...statuses].sort()).toEqual(["delivered", "failed", "queued", "sent", "suppressed"]);

    for (const d of F.NOTIFICATION_DELIVERIES.filter((x) => x.status === "suppressed")) {
      const user = F.USERS.find((u) => u.personId === d.recipientPersonId);
      const pref = F.NOTIFICATION_PREFERENCES.find(
        (p) => p.userId === user?.id && p.channel === d.channel && p.quietHours !== null,
      );
      expect(pref?.quietHours, d.id).toBeDefined();
      expect(inQuietHours(localTime(d.queuedAt, pref!.timeZone), pref!.quietHours!), d.id).toBe(
        true,
      );
    }
    for (const p of F.NOTIFICATION_PREFERENCES) {
      const user = F.USERS.find((u) => u.id === p.userId);
      expect(user, p.userId).toBeDefined();
      expect(p.timeZone, p.userId).toBe(institutionOf(user!.tenantId)?.locale.timeZone);
    }
  });

  it("keep device and conflict counts consistent", () => {
    for (const tenantId of tenantIds) {
      const devices = F.DEVICE_SYNCS.filter((d) => d.tenantId === tenantId);
      expect(devices.length, tenantId).toBeGreaterThanOrEqual(2);
      expect(devices.length, tenantId).toBeLessThanOrEqual(4);
    }
    for (const d of F.DEVICE_SYNCS) {
      expect(isUser(d.userId) && resolves(d.tenantId, d.userId), d.id).toBe(true);
      const open = F.SYNC_CONFLICTS.filter((c) => c.deviceId === d.id && c.status === "open");
      expect(open.length, d.id).toBe(d.conflictCount);
      if (d.status === "revoked") expect(d.pendingCount, d.id).toBe(0);
      else expect(d.lostWriteCount, d.id).toBe(0);
      const session = F.SESSIONS.find((s) => s.deviceId === d.id);
      if (session) expect(session.userId, d.id).toBe(d.userId);
    }
    expect(F.DEVICE_SYNCS.filter((d) => d.status === "revoke_pending")).toHaveLength(1);
    const revoked = F.DEVICE_SYNCS.filter((d) => d.status === "revoked");
    expect(revoked.map((d) => d.lostWriteCount)).toEqual([2]);
    for (const c of F.SYNC_CONFLICTS) expect(resolves(c.tenantId, c.deviceId), c.id).toBe(true);
    expect(new Set(F.SYNC_CONFLICTS.map((c) => c.status))).toEqual(new Set(["open", "resolved"]));
  });

  it("switch AI off where M11 is not entitled and keep credits and answers consistent", () => {
    expect(F.AI_SETTINGS.map((s) => s.tenantId).sort()).toEqual([...tenantIds].sort());
    for (const s of F.AI_SETTINGS) {
      const m11 = F.ENTITLEMENTS.find((e) => e.tenantId === s.tenantId && e.moduleId === "M11");
      expect(s.enabled, s.tenantId).toBe(m11?.enabled === true);
      expect(s.provider.kind, s.tenantId).toBe(s.tenantId === F.TENANT.apex ? "local" : "cloud");
    }

    for (const c of F.AI_CREDITS) {
      const meter = F.USAGE_METERS.find(
        (m) => m.tenantId === c.tenantId && m.metric === "ai_credits",
      );
      expect(c.used, c.tenantId).toBe(meter?.used);
      const plan = F.PLANS.find((p) => p.id === F.TENANT_PLANS[c.tenantId]);
      expect(c.granted, c.tenantId).toBe(plan?.aiCreditsPerMonth);
    }
    const nearLimit = F.AI_CREDITS.filter((c) => c.granted > 0 && c.used / c.granted === 0.95);
    expect(nearLimit.map((c) => c.tenantId)).toEqual([F.TENANT.apex]);

    for (const a of F.ASSIST_ANSWERS) {
      expect(F.AI_SETTINGS.find((s) => s.tenantId === a.tenantId)?.enabled, a.id).toBe(true);
      expect(institutionOf(a.tenantId)?.locale.supportedLocales, a.id).toContain(a.locale);
      for (const s of a.sources) expect(resolves(a.tenantId, s.recordId), a.id).toBe(true);
    }
  });

  it("resolve vault keys, access requests, grants and break-glass notices", () => {
    const nbKeys = F.KEY_STATUSES.filter((k) => k.tenantId === F.TENANT.northbridge);
    expect(nbKeys.every((k) => k.custody === "byok")).toBe(true);
    expect(F.KEY_STATUSES.filter((k) => k.status === "rotating")).toHaveLength(1);

    const staff = Object.values(F.PROVIDER_STAFF) as string[];
    expect(F.ACCESS_REQUESTS.map((r) => r.status).sort()).toEqual([
      "approved",
      "denied",
      "expired",
      "pending",
    ]);
    for (const r of F.ACCESS_REQUESTS) {
      expect(staff, r.id).toContain(r.staffRef);
      if (r.decidedBy !== null)
        expect(isUser(r.decidedBy) && resolves(r.tenantId, r.decidedBy)).toBe(true);
      const grants = F.ACCESS_GRANTS.filter((g) => g.requestId === r.id);
      expect(grants.length, r.id).toBe(r.status === "approved" || r.status === "expired" ? 1 : 0);
    }
    for (const g of F.ACCESS_GRANTS) {
      const r = F.ACCESS_REQUESTS.find((x) => x.id === g.requestId)!;
      expect(r.tenantId, g.id).toBe(g.tenantId);
      expect(g.modules, g.id).toEqual(r.modules);
      expect(g.mode, g.id).toBe(r.mode);
      expect(at(g.endsAt) - at(g.startsAt), g.id).toBe(r.durationHours * 3_600_000);
      const active = g.revokedAt === null && at(g.startsAt) <= NOW && NOW < at(g.endsAt);
      expect(active, g.id).toBe(r.status === "approved");
    }
    for (const n of F.BREAK_GLASS_NOTICES) {
      expect(n.tenantId).toBe(F.TENANT.northbridge);
      for (const ref of n.approverRefs) expect(staff).toContain(ref);
    }
  });
});
