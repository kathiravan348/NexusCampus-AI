import * as C from "@nexus/contracts";
import { expect, it } from "vitest";
import { PROGRAMS, SUBJECT_OFFERINGS, SUBJECTS, YEAR_LEVELS } from "./academics";
import { ORIGINALITY_SIGNALS } from "./assignments";
import { ACADEMIC_CALENDARS } from "./calendars";
import { CONSENTS } from "./compliance";
import { COURSE_SPACES } from "./courses";
import { GUARDIAN_RELATIONSHIPS } from "./families";
import * as H from "./higher-ed";
import { TENANT } from "./ids";
import { LEARNERS } from "./learner-records";
import { PEOPLE } from "./people";
import { ROLE_PROFILES } from "./role-profiles";
import { SESSION_PACKS } from "./session-courses";
import * as ST from "./store";
import { DEMO_TENANTS, INSTITUTIONS } from "./tenants";

type TenantRow = { tenantId: string; id: string };
type Parser = { safeParse(value: unknown): { error?: unknown } };

const sets: [string, Parser, readonly TenantRow[]][] = [
  ["program requirements", C.ProgramRequirementSchema, H.PROGRAM_REQUIREMENTS],
  ["registration windows", C.RegistrationWindowSchema, H.REGISTRATION_WINDOWS],
  ["elective registrations", C.ElectiveRegistrationSchema, H.ELECTIVE_REGISTRATIONS],
  ["degree audits", C.DegreeAuditSchema, H.DEGREE_AUDITS],
  ["theses", C.ThesisSchema, H.THESES],
  ["path advice", C.PathAdviceSchema, H.PATH_ADVICE],
  ["store products", C.StoreProductSchema, ST.STORE_PRODUCTS],
  ["coupons", C.CouponSchema, ST.COUPONS],
  ["store orders", C.StoreOrderSchema, ST.STORE_ORDERS],
  ["store subscriptions", C.StoreSubscriptionSchema, ST.STORE_SUBSCRIPTIONS],
  ["affiliates", C.AffiliateSchema, ST.AFFILIATES],
  ["affiliate conversions", C.AffiliateConversionSchema, ST.AFFILIATE_CONVERSIONS],
];

const staff = ROLE_PROFILES.filter((row) => row.kind === "staff");

function ref<T extends TenantRow>(rows: readonly T[], id: string | null, tenantId: string): T {
  const row = rows.find((candidate) => candidate.id === id && candidate.tenantId === tenantId);
  if (!row) throw new Error(`Missing fixture reference ${id} in ${tenantId}`);
  return row;
}

function learnerByProfile(profile: TenantRow): C.Learner {
  const learner = LEARNERS.find(
    (row) => row.roleProfileId === profile.id && row.tenantId === profile.tenantId,
  );
  if (!learner) throw new Error(`Missing learner for profile ${profile.id}`);
  return learner;
}

function expectAiConsent(learner: C.Learner, at: string) {
  const { tenantId, personId } = learner;
  if (!ref(PEOPLE, personId, tenantId).isMinor) return;
  const consent = CONSENTS.find(
    (row) =>
      row.tenantId === tenantId &&
      row.personId === personId &&
      row.purpose === "ai_features" &&
      row.status === "granted" &&
      row.recordedAt <= at &&
      row.withdrawnAt === null,
  );
  if (!consent) throw new Error(`Missing AI consent for ${learner.id}`);
  const guardian = consent.givenByPersonId;
  ref(PEOPLE, guardian, tenantId);
  expect(
    GUARDIAN_RELATIONSHIPS.some(
      (row) =>
        row.tenantId === tenantId &&
        row.learnerPersonId === personId &&
        row.guardianPersonId === guardian &&
        row.parentalResponsibility,
    ),
  ).toBe(true);
}

function expectInCalendar(tenantId: string, value: string) {
  const calendar = ACADEMIC_CALENDARS.find((row) => row.tenantId === tenantId);
  if (!calendar) throw new Error(`Missing calendar for ${tenantId}`);
  const day = value.slice(0, 10);
  expect(day >= calendar.startsOn && day <= calendar.endsOn).toBe(true);
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, out);
  }
  return out;
}

function unique(keys: readonly string[]) {
  expect(new Set(keys).size).toBe(keys.length);
}

function covers<T, K extends keyof T>(rows: readonly T[], key: K, expected: readonly T[K][]) {
  expect(new Set(rows.map((row) => row[key]))).toEqual(new Set(expected));
}

it.each(sets)("%s parse and have unique IDs", (_name, schema, rows) => {
  expect(rows.length).toBeGreaterThan(0);
  unique(rows.map((row) => row.id));
  for (const row of rows) {
    expect(DEMO_TENANTS.some((tenant) => tenant.tenantId === row.tenantId)).toBe(true);
    expect(schema.safeParse(row).error, row.id).toBeUndefined();
  }
});

it("covers higher-ed and store statuses, stages, credit systems and product kinds", () => {
  const creditSystems = new Set(H.PROGRAM_REQUIREMENTS.map((row) => row.creditSystem));
  expect(creditSystems.size).toBeGreaterThanOrEqual(2);
  covers(H.REGISTRATION_WINDOWS, "status", ["draft", "open", "closed"]);
  covers(H.ELECTIVE_REGISTRATIONS, "status", C.ElectiveRegistrationStatusSchema.options);
  covers(H.DEGREE_AUDITS, "eligibleToGraduate", [true, false]);
  covers(H.THESES, "stage", C.ThesisStageSchema.options);
  covers(H.PATH_ADVICE, "status", ["draft", "reviewed"]);
  covers(ST.STORE_PRODUCTS, "kind", C.StoreProductKindSchema.options);
  covers(ST.STORE_PRODUCTS, "status", ["draft", "published", "archived"]);
  covers(ST.COUPONS, "kind", ["percent", "amount"]);
  covers(ST.STORE_ORDERS, "status", C.StoreOrderStatusSchema.options);
  covers(ST.STORE_SUBSCRIPTIONS, "status", [
    "trialing",
    "active",
    "past_due",
    "cancelled",
    "expired",
  ]);
  covers(ST.AFFILIATES, "status", ["active", "paused"]);
  covers(ST.AFFILIATE_CONVERSIONS, "status", ["pending", "approved", "paid", "reversed"]);
  unique(H.ELECTIVE_REGISTRATIONS.map((row) => row.clientId));
  unique(ST.STORE_PRODUCTS.map((row) => `${row.tenantId}:${row.slug}`));
  unique(ST.COUPONS.map((row) => `${row.tenantId}:${row.code}`));
  unique(ST.AFFILIATES.map((row) => `${row.tenantId}:${row.code}`));
});

it("links Northbridge higher-ed records, originality signals and AI path advice", () => {
  const nb = TENANT.northbridge;
  for (const row of H.PROGRAM_REQUIREMENTS) {
    expect(row.tenantId).toBe(nb);
    ref(PROGRAMS, row.programId, nb);
    ref(ACADEMIC_CALENDARS, row.effectiveFromYearId, nb);
    for (const subjectId of row.subjectIds) ref(SUBJECTS, subjectId, nb);
  }
  for (const row of H.REGISTRATION_WINDOWS) {
    expect(row.tenantId).toBe(nb);
    ref(PROGRAMS, row.programId, nb);
    const calendar = ref(ACADEMIC_CALENDARS, row.academicYearId, nb);
    if (row.yearLevelId) {
      expect(ref(YEAR_LEVELS, row.yearLevelId, nb).programId).toBe(row.programId);
    }
    if (row.periodId) {
      expect(calendar.periods.some((period) => period.id === row.periodId)).toBe(true);
    }
    expectInCalendar(nb, row.opensAt);
    expectInCalendar(nb, row.closesAt);
  }
  for (const row of H.ELECTIVE_REGISTRATIONS) {
    expect(row.tenantId).toBe(nb);
    ref(H.REGISTRATION_WINDOWS, row.windowId, nb);
    ref(LEARNERS, row.learnerId, nb);
    for (const choice of row.choices) ref(SUBJECT_OFFERINGS, choice.subjectOfferingId, nb);
    if (row.decidedByStaffProfileId) ref(staff, row.decidedByStaffProfileId, nb);
    expectInCalendar(nb, row.submittedAt);
    if (row.decidedAt) expectInCalendar(nb, row.decidedAt);
  }
  for (const row of H.DEGREE_AUDITS) {
    expect(row.tenantId).toBe(nb);
    ref(LEARNERS, row.learnerId, nb);
    ref(PROGRAMS, row.programId, nb);
    for (const req of row.requirements) {
      expect(ref(H.PROGRAM_REQUIREMENTS, req.requirementId, nb).programId).toBe(row.programId);
    }
    expectInCalendar(nb, row.computedAt);
  }
  for (const row of H.THESES) {
    expect(row.tenantId).toBe(nb);
    ref(LEARNERS, row.learnerId, nb);
    for (const supId of row.supervisorStaffProfileIds) ref(staff, supId, nb);
    if (row.originalitySignalId) ref(ORIGINALITY_SIGNALS, row.originalitySignalId, nb);
    for (const milestone of row.milestones) {
      expectInCalendar(nb, milestone.dueOn);
      if (milestone.completedOn) expectInCalendar(nb, milestone.completedOn);
    }
  }
  expect(H.THESES.some((row) => row.originalitySignalId !== null)).toBe(true);
  for (const row of H.PATH_ADVICE) {
    expect(row.tenantId).toBe(nb);
    expectAiConsent(ref(LEARNERS, row.learnerId, nb), row.createdAt);
    for (const suggestion of row.suggestions) ref(SUBJECTS, suggestion.subjectId, nb);
    if (row.reviewedByStaffProfileId) ref(staff, row.reviewedByStaffProfileId, nb);
    expectInCalendar(nb, row.createdAt);
    if (row.reviewedAt) expectInCalendar(nb, row.reviewedAt);
  }
});

it("links Apex and Harmony store products, orders, subscriptions and affiliates safely", () => {
  covers(ST.STORE_PRODUCTS, "tenantId", [TENANT.apex, TENANT.harmony]);
  expect(
    ST.STORE_PRODUCTS.some(
      (p) => p.copySource === "ai_draft" && p.status === "published" && p.publishedByStaffProfileId,
    ),
  ).toBe(true);
  expect(
    ST.STORE_PRODUCTS.some(
      (p) => p.copySource === "ai_draft" && p.status === "draft" && !p.publishedByStaffProfileId,
    ),
  ).toBe(true);

  const currencyOf = (tenantId: string) => {
    const inst = INSTITUTIONS.find((i) => i.tenantId === tenantId);
    if (!inst) throw new Error(`Missing institution for ${tenantId}`);
    return inst.locale.currency;
  };

  for (const row of ST.STORE_PRODUCTS) {
    const inst = ref(INSTITUTIONS, row.institutionId, row.tenantId);
    expect(row.currency).toBe(inst.locale.currency);
    if (row.publishedByStaffProfileId) ref(staff, row.publishedByStaffProfileId, row.tenantId);
    for (const targetId of row.refIds) {
      if (row.kind === "course") ref(COURSE_SPACES, targetId, row.tenantId);
      else if (row.kind === "session_pack") ref(SESSION_PACKS, targetId, row.tenantId);
      else if (row.kind === "bundle") ref(ST.STORE_PRODUCTS, targetId, row.tenantId);
      else {
        const hasTarget =
          COURSE_SPACES.some((c) => c.id === targetId && c.tenantId === row.tenantId) ||
          SESSION_PACKS.some((p) => p.id === targetId && p.tenantId === row.tenantId);
        expect(hasTarget).toBe(true);
      }
    }
  }
  for (const row of ST.COUPONS) {
    if (row.currency) expect(row.currency).toBe(currencyOf(row.tenantId));
    for (const productId of row.productIds) ref(ST.STORE_PRODUCTS, productId, row.tenantId);
  }
  for (const row of ST.STORE_ORDERS) {
    expect(row.currency).toBe(currencyOf(row.tenantId));
    for (const line of row.lines) ref(ST.STORE_PRODUCTS, line.productId, row.tenantId);
    if (row.couponId) ref(ST.COUPONS, row.couponId, row.tenantId);
    if (row.affiliateId) ref(ST.AFFILIATES, row.affiliateId, row.tenantId);
    expectInCalendar(row.tenantId, row.createdAt);
    if (row.paidAt) expectInCalendar(row.tenantId, row.paidAt);

    const buyer = row.buyerProfileId ? ref(ROLE_PROFILES, row.buyerProfileId, row.tenantId) : null;
    if (buyer) expect(ref(PEOPLE, buyer.personId, row.tenantId).isMinor).toBe(false);
    if (row.learnerProfileId) {
      const lp = ref(ROLE_PROFILES, row.learnerProfileId, row.tenantId);
      expect(lp.kind).toBe("learner");
      const learner = learnerByProfile(lp);
      if (ref(PEOPLE, learner.personId, row.tenantId).isMinor) {
        expect(buyer).not.toBeNull();
        expect(
          GUARDIAN_RELATIONSHIPS.some(
            (rel) =>
              rel.tenantId === row.tenantId &&
              rel.learnerPersonId === learner.personId &&
              rel.guardianPersonId === buyer?.personId,
          ),
        ).toBe(true);
      }
    }
  }
  for (const row of ST.STORE_SUBSCRIPTIONS) {
    expect(ref(ST.STORE_PRODUCTS, row.productId, row.tenantId).kind).toBe("subscription");
    const lp = ref(ROLE_PROFILES, row.learnerProfileId, row.tenantId);
    expect(lp.kind).toBe("learner");
    learnerByProfile(lp);
    expectInCalendar(row.tenantId, row.currentPeriodStart);
    expectInCalendar(row.tenantId, row.currentPeriodEnd);
  }
  for (const row of ST.AFFILIATE_CONVERSIONS) {
    ref(ST.AFFILIATES, row.affiliateId, row.tenantId);
    const order = ref(ST.STORE_ORDERS, row.orderId, row.tenantId);
    expect(order.affiliateId).toBe(row.affiliateId);
    expect(row.currency).toBe(order.currency);
  }
});

it("contains no URLs or card-like digit sequences in any string field", () => {
  for (const [, , rows] of sets) {
    for (const value of collectStrings(rows)) {
      expect(value).not.toMatch(/https?:\/\/|www\./i);
      expect(value).not.toMatch(/(?:\d[ -]?){13,19}/);
    }
  }
});
