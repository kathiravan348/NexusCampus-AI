import {
  KpiSchema,
  RoleHomeSchema,
  type ApplicationStatus,
  type HomeCard,
  type Kpi,
  type RoleHome,
} from "@nexus/contracts";
import { ApiFailure, entitled, familyOf, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { MESSAGES_READ, NOTICES_READ, viewerNotices, viewerThreads } from "./m24";
import { found, get, ok } from "./route";

const M = { module: "M28" } as const;
const DASHBOARDS_READ = "m28.dashboards.read";
const openApplicationStatuses: ReadonlySet<ApplicationStatus> = new Set([
  "draft",
  "submitted",
  "under_review",
  "test_scheduled",
  "offered",
  "waitlisted",
]);

function card(
  kind: HomeCard["kind"],
  moduleId: HomeCard["moduleId"],
  href: string,
  count: number | null,
): HomeCard {
  return { kind, titleKey: `m28.card.${kind}`, moduleId, count, severity: null, href };
}

function tenantLocale(tenantId: string) {
  return found(ofTenant(mockDb.institutions, tenantId)[0]).locale;
}

function tenantDate(tenantId: string, now: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tenantLocale(tenantId).timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function mondayOf(date: string) {
  const monday = new Date(`${date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function outstanding(invoice: { status: string; paid: number; total: number }) {
  return invoice.status === "issued" || invoice.status === "part_paid"
    ? invoice.total - invoice.paid
    : 0;
}

function communicationCards(viewer: Viewer, now: Date): HomeCard[] {
  if (!entitled(viewer.tenantId, "M24")) return [];
  const cards: HomeCard[] = [];
  if (viewer.permissions.has(MESSAGES_READ)) {
    const threadIds = new Set(
      viewerThreads(viewer)
        .filter((row) => !row.archived)
        .map((row) => row.id),
    );
    const unread = ofTenant(mockDb.threadMessages, viewer.tenantId).filter(
      (row) =>
        threadIds.has(row.threadId) &&
        row.senderPersonId !== viewer.personId &&
        !row.readByPersonIds.includes(viewer.personId),
    ).length;
    cards.push(card("messages", "M24", "/messages", unread));
  }
  if (viewer.permissions.has(NOTICES_READ)) {
    cards.push(card("notices", "M24", "/notices", viewerNotices(viewer, now).length));
  }
  return cards;
}

function learnerCards(viewer: Viewer, learnerIds: readonly string[], now: Date): HomeCard[] {
  const { tenantId } = viewer;
  const learners = new Set(learnerIds);
  const today = tenantDate(tenantId, now);
  const monday = mondayOf(today);
  const sessionIds = new Set(
    ofTenant(mockDb.attendanceSessions, tenantId)
      .filter((row) => row.date >= monday && row.date <= today)
      .map((row) => row.id),
  );
  const absences = ofTenant(mockDb.attendanceMarks, tenantId).filter(
    (row) =>
      row.status === "absent" && learners.has(row.learnerId) && sessionIds.has(row.sessionId),
  ).length;
  const unpaid = ofTenant(mockDb.feeInvoices, tenantId).filter(
    (row) => learners.has(row.learnerId) && outstanding(row) > 0,
  ).length;

  return [
    card("attendance", "M17", "/attendance", absences),
    card("fees", "M18", "/fees", unpaid),
    ...communicationCards(viewer, now),
  ];
}

function staffCards(viewer: Viewer, staffIds: ReadonlySet<string>, now: Date): HomeCard[] {
  const { tenantId } = viewer;
  const today = tenantDate(tenantId, now);
  const homerooms = new Set(
    ofTenant(mockDb.classGroups, tenantId)
      .filter(
        (row) => row.homeroomStaffProfileId !== null && staffIds.has(row.homeroomStaffProfileId),
      )
      .map((row) => row.id),
  );
  const slots = new Set(
    ofTenant(mockDb.timetableSlots, tenantId)
      .filter((row) => row.staffProfileIds.some((id) => staffIds.has(id)))
      .map((row) => row.id),
  );
  const sessions = ofTenant(mockDb.attendanceSessions, tenantId).filter(
    (row) =>
      row.date === today &&
      ((row.takenByStaffProfileId !== null && staffIds.has(row.takenByStaffProfileId)) ||
        (row.timetableSlotId !== null && slots.has(row.timetableSlotId)) ||
        (row.classGroupId !== null && homerooms.has(row.classGroupId))),
  ).length;

  const classGroups = new Set(homerooms);
  for (const offering of ofTenant(mockDb.subjectOfferings, tenantId)) {
    if (offering.staffProfileIds.some((id) => staffIds.has(id))) {
      classGroups.add(offering.classGroupId);
    }
  }
  const learnerIds = new Set(
    ofTenant(mockDb.enrolments, tenantId)
      .filter((row) => row.status === "active" && classGroups.has(row.classGroupId))
      .map((row) => row.learnerId),
  );
  const pending = ofTenant(mockDb.leaveRequests, tenantId).filter(
    (row) => row.status === "pending" && learnerIds.has(row.learnerId),
  ).length;
  return [
    card("attendance", "M17", "/attendance", sessions),
    card("leave", "M17", "/attendance/leave", pending),
    ...communicationCards(viewer, now),
  ];
}

function dashboardKpis(tenantId: string, asOf: string): Kpi[] {
  const { currency } = tenantLocale(tenantId);
  const marks = ofTenant(mockDb.attendanceMarks, tenantId);
  const attended = marks.filter(
    (row) => row.status === "present" || row.status === "late" || row.status === "remote",
  ).length;
  const fees = ofTenant(mockDb.feeInvoices, tenantId).filter(
    (row) => row.currency === currency && row.status !== "draft" && row.status !== "void",
  );
  const admissions = ofTenant(mockDb.applications, tenantId).filter((row) =>
    openApplicationStatuses.has(row.status),
  ).length;
  const activeLearners = ofTenant(mockDb.learners, tenantId).filter(
    (row) => row.status === "enrolled" || row.status === "on_leave",
  ).length;
  const metric = (code: string, value: number, unit: Kpi["unit"]): Kpi => ({
    code,
    labelKey: `m28.kpi.${code}`,
    value,
    unit,
    currency: unit === "minor_units" ? currency : null,
    trend: null,
    asOf,
  });
  const attendanceRate = marks.length === 0 ? 0 : (attended / marks.length) * 100;
  const feesCollected = fees.reduce((total, row) => total + row.paid, 0);
  const feesOutstanding = fees.reduce((total, row) => total + outstanding(row), 0);

  return [
    metric("attendance", attendanceRate, "percent"),
    metric("collected", feesCollected, "minor_units"),
    metric("outstanding", feesOutstanding, "minor_units"),
    metric("admissions", admissions, "count"),
    metric("learners", activeLearners, "count"),
  ];
}

function roleHome(viewer: Viewer, now: Date): RoleHome {
  const { tenantId, personId, permissions } = viewer;
  const profiles = ofTenant(mockDb.roleProfiles, tenantId).filter(
    (profile) => profile.personId === personId,
  );
  if (profiles.length === 0) throw new ApiFailure("forbidden");
  const generatedAt = now.toISOString();

  if (permissions.has(DASHBOARDS_READ)) {
    const kpis = dashboardKpis(tenantId, generatedAt);
    const alerts = ofTenant(mockDb.leaveRequests, tenantId).filter(
      (row) => row.status === "pending",
    ).length;
    return {
      role: "leader",
      personId,
      generatedAt,
      learnerIds: [],
      cards: [
        card("kpi", "M28", "/dashboards", kpis.length),
        card("alerts", "M17", "/attendance/leave", alerts),
      ],
    };
  }

  const staffIds = new Set(profiles.filter((row) => row.kind === "staff").map((row) => row.id));
  if (staffIds.size > 0) {
    return {
      role: "staff",
      personId,
      generatedAt,
      learnerIds: [],
      cards: staffCards(viewer, staffIds, now),
    };
  }

  const isGuardian = profiles.some((row) => row.kind === "guardian");
  if (!isGuardian && !profiles.some((row) => row.kind === "learner")) {
    throw new ApiFailure("forbidden");
  }
  const people = isGuardian ? familyOf(viewer) : new Set([personId]);
  const learnerIds = [
    ...new Set(
      ofTenant(mockDb.learners, tenantId)
        .filter((row) => people.has(row.personId))
        .map((row) => row.id),
    ),
  ];

  return {
    role: isGuardian ? "family" : "learner",
    personId,
    generatedAt,
    learnerIds: learnerIds.slice(0, 10),
    cards: learnerCards(viewer, learnerIds, now),
  };
}

export const m28Handlers = [
  get("/me/home", M, (ctx) => ok(RoleHomeSchema, roleHome(ctx.viewer, new Date()))),
  get("/dashboards/kpis", { ...M, permission: DASHBOARDS_READ }, (ctx) =>
    ok(KpiSchema.array(), dashboardKpis(ctx.viewer.tenantId, new Date().toISOString())),
  ),
];
