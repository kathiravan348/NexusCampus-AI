import type { AuditActorKind, AuditEvent, ModuleId } from "@nexus/contracts";
import { AUDIT_HASHES } from "./audit-hashes";
import { CONSENTS, DATA_SUBJECT_REQUESTS } from "./compliance";
import { CAMPUS, INSTITUTION, PERSON, TENANT, THEME, USER } from "./ids";
import { templateId } from "./notifications";
import { DEVICE } from "./sync";
import { ACCESS_GRANT, ACCESS_REQUEST, PROVIDER_STAFF } from "./vault";

/**
 * Hash-chained audit log per tenant (E-3, D25). `hash` = SHA-256 hex of `id|occurredAt|action|prevHash`
 * (`prevHash` null → empty string), precomputed in `audit-hashes.ts`; the tests recompute every link with Web Crypto.
 */
export const auditHashInput = (e: Pick<AuditEvent, "id" | "occurredAt" | "action" | "prevHash">) =>
  `${e.id}|${e.occurredAt}|${e.action}|${e.prevHash ?? ""}`;

interface Row {
  readonly action: string;
  readonly actorKind: AuditActorKind;
  readonly actorId: string | null;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly at?: string;
  readonly changes?: readonly string[];
  readonly grantId?: string;
  readonly deviceId?: string;
}

interface Tenant {
  readonly tenantId: string;
  readonly admin: string;
  readonly teacher: string;
  readonly guardianUser: string;
  readonly guardianPerson: string;
  readonly learner: string;
  readonly institution: string;
  readonly campus: string;
  readonly theme: string;
  readonly locale: string;
}

const SENSITIVE = new Set(["person.dateOfBirth", "person.phone"]);

type More = Pick<Row, "at" | "changes" | "deviceId">;

/** A user event, or a system event when `actorId` is null. */
const ev = (
  action: string,
  actorId: string | null,
  targetType: string,
  targetId: string | null,
  more: More = {},
): Row => ({
  action,
  actorKind: actorId === null ? "system" : "user",
  actorId,
  targetType,
  targetId,
  ...more,
});

/** The 20 events every demo tenant has, at 12-hour steps from 4 May 2026. */
const common = (t: Tenant): Row[] => [
  ev("m01.institution.created", null, "institution", t.institution),
  ev("m01.institution.updated", t.admin, "institution", t.institution, {
    changes: ["locale.timeZone"],
  }),
  ev("m01.campus.updated", t.admin, "campus", t.campus, { changes: ["address.line1"] }),
  ev("m03.theme.published", t.admin, "theme", t.theme, { changes: ["tokens"] }),
  ev("m02.user.invited", t.admin, "user", t.teacher),
  ev("m02.user.activated", t.teacher, "user", t.teacher),
  ev("m02.user.invited", t.admin, "user", t.guardianUser),
  ev("m02.user.activated", t.guardianUser, "user", t.guardianUser),
  ev("m02.role.assigned", t.admin, "user", t.guardianUser),
  ev("m02.person.created", t.admin, "person", t.learner),
  ev("m02.person.updated", t.admin, "person", t.learner, { changes: ["person.dateOfBirth"] }),
  ev("m02.person.viewed", t.teacher, "person", t.learner),
  ev("m02.person.updated", t.guardianUser, "person", t.guardianPerson, {
    changes: ["person.phone"],
  }),
  ev("m04.terminology.updated", t.admin, "institution", t.institution),
  ev(
    "m07.template.updated",
    t.admin,
    "notificationTemplate",
    templateId(t.tenantId, "m02.user.invited", "email", t.locale),
    { changes: ["body"] },
  ),
  ev("m05.usage.exported", t.admin, "institution", t.institution),
  ev("m06.auditLog.exported", t.admin, "institution", t.institution),
  ev("m06.retention.checked", null, "institution", t.institution),
  ev("m02.user.signedIn", t.teacher, "user", t.teacher),
  ev("m02.user.signedIn", t.admin, "user", t.admin),
];

const dsrRows = (tenantId: string): Row[] =>
  DATA_SUBJECT_REQUESTS.filter((r) => r.tenantId === tenantId).map((r) =>
    ev("m06.dataRequest.received", null, "dataSubjectRequest", r.id, { at: r.receivedAt }),
  );

/** The consent event for a learner's consent record, at the time it was recorded or withdrawn. */
const consentRow = (personId: string, purpose: string, actorId: string): Row => {
  const c = CONSENTS.find((x) => x.personId === personId && x.purpose === purpose);
  if (!c) throw new Error(`No consent for ${personId}/${purpose}`);
  const at = c.withdrawnAt ?? c.recordedAt;
  return ev(`m06.consent.${c.status}`, actorId, "consent", c.id, { at });
};

const tenant = (
  tenantId: string,
  locale: string,
  [admin, teacher, guardianUser]: readonly [string, string, string],
  [guardianPerson, learner]: readonly [string, string],
  [institution, campus, theme]: readonly [string, string, string],
): Tenant => ({
  tenantId,
  admin,
  teacher,
  guardianUser,
  guardianPerson,
  learner,
  institution,
  campus,
  theme,
  locale,
});

const TENANTS: readonly [Tenant, Row[]][] = [
  [
    tenant(
      TENANT.littleSteps,
      "en-IN",
      [USER.lsPriya, USER.lsArjun, USER.lsSunita],
      [PERSON.lsSunita, PERSON.lsRohan],
      [INSTITUTION.littleSteps, CAMPUS.littleSteps, THEME.littleSteps],
    ),
    [
      consentRow(PERSON.lsRohan, "ai_features", USER.lsSunita),
      consentRow(PERSON.lsKavya, "media_sharing", USER.lsArjun),
      ev(
        "m83.accessRequest.approved",
        USER.lsPriya,
        "accessRequest",
        ACCESS_REQUEST.littleStepsExpired,
        { at: "2026-08-10T04:30:00Z" },
      ),
    ],
  ],
  [
    tenant(
      TENANT.riverside,
      "en-GB",
      [USER.rvHelen, USER.rvTom, USER.rvGrace],
      [PERSON.rvGrace, PERSON.rvMia],
      [INSTITUTION.riversideSchool, CAMPUS.riversideNorth, THEME.riversideSchool],
    ),
    [
      consentRow(PERSON.rvMia, "ai_features", USER.rvGrace),
      ...dsrRows(TENANT.riverside),
      ev("m10.device.revokeRequested", USER.rvHelen, "device", DEVICE.rvTomPhone, {
        deviceId: DEVICE.rvTomPhone,
        at: "2026-09-11T17:00:00Z",
      }),
    ],
  ],
  [
    tenant(
      TENANT.northbridge,
      "en-US",
      [USER.nbRobert, USER.nbElena, USER.nbPatricia],
      [PERSON.nbPatricia, PERSON.nbSofia],
      [INSTITUTION.northbridge, CAMPUS.northbridge, THEME.northbridge],
    ),
    [
      ev("m83.breakGlass.notified", null, "breakGlassNotice", "bgn-nb-0902", {
        at: "2026-09-02T03:12:00Z",
      }),
      ev("m10.device.revoked", USER.nbRobert, "device", DEVICE.nbElenaPhone, {
        deviceId: DEVICE.nbElenaPhone,
        at: "2026-09-07T09:00:00Z",
      }),
      ...dsrRows(TENANT.northbridge),
      ev(
        "m83.accessRequest.denied",
        USER.nbRobert,
        "accessRequest",
        ACCESS_REQUEST.northbridgeDenied,
        { at: "2026-09-05T15:45:00Z" },
      ),
    ],
  ],
  [
    tenant(
      TENANT.apex,
      "ta-IN",
      [USER.axKarthik, USER.axMeena, USER.axLakshmi],
      [PERSON.axLakshmi, PERSON.axDivya],
      [INSTITUTION.apex, CAMPUS.apex, THEME.apex],
    ),
    [
      ...dsrRows(TENANT.apex),
      ev(
        "m83.accessRequest.approved",
        USER.axKarthik,
        "accessRequest",
        ACCESS_REQUEST.apexApproved,
        { at: "2026-09-15T07:55:00Z" },
      ),
      {
        // Provider support reading a template under Apex's approved, time-boxed grant (V-3).
        action: "m07.template.viewed",
        actorKind: "provider_grant",
        actorId: PROVIDER_STAFF.morgan,
        grantId: ACCESS_GRANT.apexActive,
        targetType: "notificationTemplate",
        targetId: templateId(TENANT.apex, "m07.announcement.published", "email", "ta-IN"),
        at: "2026-09-15T09:05:00Z",
      },
    ],
  ],
  [
    tenant(
      TENANT.harmony,
      "en-SG",
      [USER.hmWeiLing, USER.hmDaniel, USER.hmMei],
      [PERSON.hmMei, PERSON.hmChloe],
      [INSTITUTION.harmony, CAMPUS.harmony, THEME.harmony],
    ),
    [...dsrRows(TENANT.harmony)],
  ],
];

const HOUR_MS = 3_600_000;
const START = Date.parse("2026-05-04T06:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

const chain = ([t, extras]: [Tenant, Row[]]): AuditEvent[] => {
  const rows = [
    ...common(t).map((r, i) => ({ ...r, at: r.at ?? iso(START + i * 12 * HOUR_MS) })),
    ...extras.map((r) => ({ ...r, at: r.at ?? iso(START) })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const hashes = AUDIT_HASHES[t.tenantId] ?? [];
  const short = t.tenantId.replace(/^ten-/, "");
  return rows.map((r, i) => ({
    id: `aud-${short}-${String(i + 1).padStart(2, "0")}`,
    tenantId: t.tenantId,
    occurredAt: r.at,
    actorKind: r.actorKind,
    actorId: r.actorId,
    grantId: r.grantId ?? null,
    action: r.action,
    moduleId: r.action.slice(0, 3).toUpperCase() as ModuleId,
    targetType: r.targetType,
    targetId: r.targetId,
    deviceId: r.deviceId ?? null,
    changes: (r.changes ?? []).map((field) => ({ field, sensitive: SENSITIVE.has(field) })),
    prevHash: i === 0 ? null : (hashes[i - 1] ?? ""),
    hash: hashes[i] ?? "",
  }));
};

/** 20–40 audit events per demo tenant; Apex includes a provider read under its active grant. */
export const AUDIT_EVENTS: readonly AuditEvent[] = TENANTS.flatMap(chain);
