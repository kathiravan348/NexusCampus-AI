import type { RoleProfile, RoleProfileKind } from "@nexus/contracts";
import { ACADEMIC_CALENDARS } from "./calendars";
import { CAMPUS, CALENDAR, INSTITUTION, PERSON, TENANT } from "./ids";
import { CREATED_AT, UPDATED_AT } from "./tenants";

interface Membership {
  readonly tenantId: string;
  readonly institutionId: string;
  readonly calendarId: string;
}

const yearStart = (calendarId: string): string => {
  const calendar = ACADEMIC_CALENDARS.find((c) => c.id === calendarId);
  if (!calendar) throw new Error(`Unknown calendar ${calendarId}`);
  return calendar.startsOn;
};

/** Staff and guardians are open-ended; learners are enrolled for the academic year (D25). */
const profile = (
  at: Membership,
  personId: string,
  kind: RoleProfileKind,
  campusId: string | null,
): RoleProfile => ({
  id: `rp-${personId.replace(/^per-/, "")}-${kind}`,
  tenantId: at.tenantId,
  personId,
  institutionId: at.institutionId,
  campusId,
  kind,
  academicYearId: kind === "learner" ? at.calendarId : null,
  effectiveFrom: kind === "staff" ? "2025-04-01" : yearStart(at.calendarId),
  effectiveTo: null,
  status: "active",
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
});

const LS: Membership = {
  tenantId: TENANT.littleSteps,
  institutionId: INSTITUTION.littleSteps,
  calendarId: CALENDAR.littleSteps,
};
const RV: Membership = {
  tenantId: TENANT.riverside,
  institutionId: INSTITUTION.riversideSchool,
  calendarId: CALENDAR.riversideSchool,
};
const NB: Membership = {
  tenantId: TENANT.northbridge,
  institutionId: INSTITUTION.northbridge,
  calendarId: CALENDAR.northbridge,
};
const AX: Membership = {
  tenantId: TENANT.apex,
  institutionId: INSTITUTION.apex,
  calendarId: CALENDAR.apex,
};
const HM: Membership = {
  tenantId: TENANT.harmony,
  institutionId: INSTITUTION.harmony,
  calendarId: CALENDAR.harmony,
};
const N = CAMPUS.riversideNorth;
const S = CAMPUS.riversideSouth;

/** One staff member per tenant is also a guardian (D25): one `Person`, two role profiles. */
export const ROLE_PROFILES: readonly RoleProfile[] = [
  profile(LS, PERSON.lsPriya, "staff", null),
  profile(LS, PERSON.lsArjun, "staff", CAMPUS.littleSteps),
  profile(LS, PERSON.lsArjun, "guardian", null),
  profile(LS, PERSON.lsSunita, "guardian", null),
  profile(LS, PERSON.lsDeepak, "guardian", null),
  profile(LS, PERSON.lsKavya, "learner", CAMPUS.littleSteps),
  profile(LS, PERSON.lsRohan, "learner", CAMPUS.littleSteps),
  profile(LS, PERSON.lsIshaan, "learner", CAMPUS.littleSteps),
  profile(LS, PERSON.lsAnaya, "learner", CAMPUS.littleSteps),

  profile(RV, PERSON.rvHelen, "staff", null),
  profile(RV, PERSON.rvTom, "staff", N),
  profile(RV, PERSON.rvAmira, "staff", S),
  profile(RV, PERSON.rvAmira, "guardian", null),
  profile(RV, PERSON.rvGrace, "guardian", null),
  profile(RV, PERSON.rvDaniel, "guardian", null),
  profile(RV, PERSON.rvOliver, "learner", N),
  profile(RV, PERSON.rvMia, "learner", S),
  profile(RV, PERSON.rvLeo, "learner", S),
  profile(RV, PERSON.rvElla, "learner", N),

  profile(NB, PERSON.nbRobert, "staff", null),
  profile(NB, PERSON.nbElena, "staff", CAMPUS.northbridge),
  profile(NB, PERSON.nbMarcus, "staff", CAMPUS.northbridge),
  profile(NB, PERSON.nbMarcus, "guardian", null),
  profile(NB, PERSON.nbPatricia, "guardian", null),
  profile(NB, PERSON.nbJordan, "learner", CAMPUS.northbridge),
  profile(NB, PERSON.nbSofia, "learner", CAMPUS.northbridge),
  profile(NB, PERSON.nbAiden, "learner", CAMPUS.northbridge),
  profile(NB, PERSON.nbNora, "learner", CAMPUS.northbridge),

  profile(AX, PERSON.axKarthik, "staff", null),
  profile(AX, PERSON.axMeena, "staff", CAMPUS.apex),
  profile(AX, PERSON.axMeena, "guardian", null),
  profile(AX, PERSON.axSuresh, "staff", CAMPUS.apex),
  profile(AX, PERSON.axLakshmi, "guardian", null),
  profile(AX, PERSON.axVijay, "learner", CAMPUS.apex),
  profile(AX, PERSON.axDivya, "learner", CAMPUS.apex),
  profile(AX, PERSON.axArun, "learner", CAMPUS.apex),
  profile(AX, PERSON.axNila, "learner", CAMPUS.apex),

  profile(HM, PERSON.hmWeiLing, "staff", null),
  profile(HM, PERSON.hmDaniel, "staff", CAMPUS.harmony),
  profile(HM, PERSON.hmDaniel, "guardian", null),
  profile(HM, PERSON.hmPriya, "staff", CAMPUS.harmony),
  profile(HM, PERSON.hmMei, "guardian", null),
  profile(HM, PERSON.hmEthan, "learner", CAMPUS.harmony),
  profile(HM, PERSON.hmChloe, "learner", CAMPUS.harmony),
  profile(HM, PERSON.hmRachel, "learner", CAMPUS.harmony),
  profile(HM, PERSON.hmMarcus, "learner", CAMPUS.harmony),
];

/**
 * Who is guardian of whom. Stage 1 has no guardian-link contract yet, so this is a fixture-only shape;
 * both ends are people of the same tenant with a guardian / learner role profile (checked by the tests).
 */
export interface GuardianLink {
  readonly tenantId: string;
  readonly guardianPersonId: string;
  readonly learnerPersonId: string;
}

const link = (m: Membership, guardianPersonId: string, learnerPersonId: string): GuardianLink => ({
  tenantId: m.tenantId,
  guardianPersonId,
  learnerPersonId,
});

export const GUARDIAN_LINKS: readonly GuardianLink[] = [
  link(LS, PERSON.lsArjun, PERSON.lsKavya),
  link(LS, PERSON.lsSunita, PERSON.lsRohan),
  link(LS, PERSON.lsSunita, PERSON.lsIshaan),
  link(LS, PERSON.lsDeepak, PERSON.lsAnaya),
  link(RV, PERSON.rvGrace, PERSON.rvOliver),
  link(RV, PERSON.rvGrace, PERSON.rvMia),
  link(RV, PERSON.rvAmira, PERSON.rvLeo),
  link(RV, PERSON.rvDaniel, PERSON.rvElla),
  link(NB, PERSON.nbMarcus, PERSON.nbJordan),
  link(NB, PERSON.nbPatricia, PERSON.nbSofia),
  link(AX, PERSON.axMeena, PERSON.axVijay),
  link(AX, PERSON.axLakshmi, PERSON.axDivya),
  link(HM, PERSON.hmDaniel, PERSON.hmEthan),
  link(HM, PERSON.hmMei, PERSON.hmChloe),
];
