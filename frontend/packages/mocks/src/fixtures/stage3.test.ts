import {
  AuthorisedPickupSchema,
  ClassGroupSchema,
  CustomFieldDefinitionSchema,
  EnrolmentSchema,
  FormDefinitionSchema,
  GuardianRelationshipSchema,
  HouseholdSchema,
  LearnerDocumentSchema,
  LearnerSchema,
  NumberingFormatSchema,
  ProgramSchema,
  SubjectOfferingSchema,
  SubjectSchema,
  WorkflowDefinitionSchema,
  YearLevelSchema,
} from "@nexus/contracts";
import { describe, expect, it } from "vitest";
import * as F from "./index";

interface TenantRow {
  id: string;
  tenantId: string;
}

interface Parser {
  safeParse(value: unknown): { error?: unknown };
}

const SETS: [string, Parser, readonly TenantRow[]][] = [
  ["PROGRAMS", ProgramSchema, F.PROGRAMS],
  ["YEAR_LEVELS", YearLevelSchema, F.YEAR_LEVELS],
  ["CLASS_GROUPS", ClassGroupSchema, F.CLASS_GROUPS],
  ["SUBJECTS", SubjectSchema, F.SUBJECTS],
  ["SUBJECT_OFFERINGS", SubjectOfferingSchema, F.SUBJECT_OFFERINGS],
  ["LEARNERS", LearnerSchema, F.LEARNERS],
  ["ENROLMENTS", EnrolmentSchema, F.ENROLMENTS],
  ["LEARNER_DOCUMENTS", LearnerDocumentSchema, F.LEARNER_DOCUMENTS],
  ["HOUSEHOLDS", HouseholdSchema, F.HOUSEHOLDS],
  ["GUARDIAN_RELATIONSHIPS", GuardianRelationshipSchema, F.GUARDIAN_RELATIONSHIPS],
  ["AUTHORISED_PICKUPS", AuthorisedPickupSchema, F.AUTHORISED_PICKUPS],
  ["CUSTOM_FIELD_DEFINITIONS", CustomFieldDefinitionSchema, F.CUSTOM_FIELD_DEFINITIONS],
  ["FORM_DEFINITIONS", FormDefinitionSchema, F.FORM_DEFINITIONS],
  ["WORKFLOW_DEFINITIONS", WorkflowDefinitionSchema, F.WORKFLOW_DEFINITIONS],
  ["NUMBERING_FORMATS", NumberingFormatSchema, F.NUMBERING_FORMATS],
];
const tenantIds = new Set(F.DEMO_TENANTS.map(({ tenantId }) => tenantId));

const inTenant = <T extends TenantRow>(rows: readonly T[], tenantId: string) =>
  rows.filter((row) => row.tenantId === tenantId);

function expectReference(rows: readonly TenantRow[], id: string | null, tenantId: string) {
  if (id !== null) expect(rows.find((row) => row.id === id)?.tenantId, id).toBe(tenantId);
}

const staffProfiles = F.ROLE_PROFILES.filter(({ kind }) => kind === "staff");
const guardianProfiles = F.ROLE_PROFILES.filter(({ kind }) => kind === "guardian");
const learnerProfiles = F.ROLE_PROFILES.filter(({ kind }) => kind === "learner");

function expectCalendarDate(tenantId: string, date: string | null) {
  if (date === null) return;
  const calendar = F.ACADEMIC_CALENDARS.find((row) => row.tenantId === tenantId);
  expect(calendar).toBeDefined();
  expect(date >= (calendar?.startsOn ?? "") && date <= (calendar?.endsOn ?? "")).toBe(true);
}

describe("Stage 3 fixtures (D16)", () => {
  it.each(SETS)("%s parse and cover all demo tenants", (_name, schema, rows) => {
    expect(new Set(rows.map(({ tenantId }) => tenantId))).toEqual(tenantIds);
    expect(new Set(rows.map(({ id }) => id)).size).toBe(rows.length);
    for (const row of rows) expect(schema.safeParse(row).error, row.id).toBeUndefined();
  });

  it("resolve academic references within the same tenant and institution", () => {
    for (const { institutionId, tenantId } of [...F.PROGRAMS, ...F.SUBJECTS]) {
      expectReference(F.INSTITUTIONS, institutionId, tenantId);
    }
    for (const { programId, tenantId } of F.YEAR_LEVELS) {
      expectReference(F.PROGRAMS, programId, tenantId);
    }
    for (const group of F.CLASS_GROUPS) {
      const { campusId, academicYearId, programId, tenantId, institutionId } = group;
      expectReference(F.INSTITUTIONS, institutionId, tenantId);
      expect(F.CAMPUSES.find(({ id }) => id === campusId)).toMatchObject({
        tenantId,
        institutionId,
      });
      expect(F.ACADEMIC_CALENDARS.find(({ id }) => id === academicYearId)).toMatchObject({
        tenantId,
        institutionId,
      });
      expect(F.PROGRAMS.find(({ id }) => id === programId)).toMatchObject({
        tenantId,
        institutionId,
      });
      expect(F.YEAR_LEVELS.find(({ id }) => id === group.yearLevelId)).toMatchObject({
        tenantId,
        programId,
      });
      expectReference(staffProfiles, group.homeroomStaffProfileId, tenantId);
    }
    for (const offering of F.SUBJECT_OFFERINGS) {
      const { academicYearId, classGroupId, subjectId, staffProfileIds, tenantId, periodId } =
        offering;
      const group = F.CLASS_GROUPS.find(({ id }) => id === classGroupId);
      const calendar = F.ACADEMIC_CALENDARS.find(({ id }) => id === academicYearId);
      expect(group).toMatchObject({ tenantId, academicYearId });
      expect(calendar?.tenantId).toBe(tenantId);
      expect(F.SUBJECTS.find(({ id }) => id === subjectId)).toMatchObject({
        tenantId,
        institutionId: group?.institutionId,
      });
      if (periodId !== null) expect(calendar?.periods.map(({ id }) => id)).toContain(periodId);
      expect(staffProfileIds.length).toBeGreaterThan(0);
      for (const id of staffProfileIds) expectReference(staffProfiles, id, tenantId);
    }
  });

  it("cover the academic scope per institution type and both Riverside campuses", () => {
    for (const tenantId of tenantIds) {
      const groups = inTenant(F.CLASS_GROUPS, tenantId);
      const counts = [
        [inTenant(F.PROGRAMS, tenantId).length, 1, 2],
        [inTenant(F.YEAR_LEVELS, tenantId).length, 2, 4],
        [groups.length, 2, 4],
        [inTenant(F.SUBJECTS, tenantId).length, 4, 6],
      ] as const;
      for (const [count, min, max] of counts) {
        expect(count, tenantId).toBeGreaterThanOrEqual(min);
        expect(count, tenantId).toBeLessThanOrEqual(max);
      }
      for (const group of groups) {
        const offerings = F.SUBJECT_OFFERINGS.filter((row) => row.classGroupId === group.id);
        expect(offerings, group.id).toHaveLength(2);
        expect(new Set(offerings.map(({ subjectId }) => subjectId)).size).toBe(2);
      }
    }
    const expectedKinds: Readonly<Record<string, string>> = {
      [F.TENANT.littleSteps]: "group",
      [F.TENANT.riverside]: "section",
      [F.TENANT.northbridge]: "cohort",
      [F.TENANT.apex]: "batch",
      [F.TENANT.harmony]: "group",
    };
    for (const group of F.CLASS_GROUPS) {
      expect(group.kind, group.id).toBe(expectedKinds[group.tenantId]);
    }
    expect(
      new Set(inTenant(F.CLASS_GROUPS, F.TENANT.riverside).map(({ campusId }) => campusId)),
    ).toEqual(new Set([F.CAMPUS.riversideNorth, F.CAMPUS.riversideSouth]));
  });

  it("assign every learner profile one record, active enrolment, and household", () => {
    expect(F.LEARNERS.map(({ roleProfileId }) => roleProfileId).sort()).toEqual(
      learnerProfiles.map(({ id }) => id).sort(),
    );
    for (const learner of F.LEARNERS) {
      const { id, roleProfileId, personId, campusId, institutionId, tenantId } = learner;
      const profile = learnerProfiles.find((row) => row.id === roleProfileId);
      expect(profile).toMatchObject({
        personId,
        campusId,
        institutionId,
        tenantId,
      });
      expectReference(F.PEOPLE, personId, tenantId);
      expectReference(F.INSTITUTIONS, institutionId, tenantId);
      expectReference(F.CAMPUSES, campusId, tenantId);
      expectCalendarDate(tenantId, learner.admissionDate);
      expectCalendarDate(tenantId, learner.leftOn);
      const enrolments = F.ENROLMENTS.filter(({ learnerId }) => learnerId === id);
      expect(enrolments).toHaveLength(1);
      expect(enrolments[0]).toMatchObject({
        tenantId,
        academicYearId: profile?.academicYearId,
        status: "active",
      });
      const households = F.HOUSEHOLDS.filter((row) => row.learnerPersonIds.includes(personId));
      expect(households.map((row) => row.tenantId)).toEqual([tenantId]);
    }
    expect(F.LEARNERS.some(({ healthFlags }) => healthFlags.length > 0)).toBe(true);
    for (const enrolment of F.ENROLMENTS) {
      const { classGroupId, programId, yearLevelId, academicYearId, tenantId } = enrolment;
      const learner = F.LEARNERS.find(({ id }) => id === enrolment.learnerId);
      expect(learner?.tenantId).toBe(tenantId);
      expect(F.CLASS_GROUPS.find(({ id }) => id === classGroupId)).toMatchObject({
        tenantId,
        programId,
        yearLevelId,
        academicYearId,
        campusId: learner?.campusId,
        institutionId: learner?.institutionId,
      });
      expectReference(F.ACADEMIC_CALENDARS, academicYearId, tenantId);
      expectReference(F.PROGRAMS, programId, tenantId);
      expectReference(F.YEAR_LEVELS, yearLevelId, tenantId);
      expectCalendarDate(tenantId, enrolment.effectiveFrom);
      expectCalendarDate(tenantId, enrolment.effectiveTo);
    }
    for (const doc of F.LEARNER_DOCUMENTS) {
      expectReference(F.LEARNERS, doc.learnerId, doc.tenantId);
      expectReference(staffProfiles, doc.verifiedByStaffProfileId, doc.tenantId);
      expectCalendarDate(doc.tenantId, doc.uploadedAt.slice(0, 10));
    }
  });

  it("keep household, guardian, and pickup references local to the tenant", () => {
    const linkKey = (link: (typeof F.GUARDIAN_LINKS)[number]) =>
      [link.tenantId, link.guardianPersonId, link.learnerPersonId].join("/");
    const existingLinks = F.GUARDIAN_LINKS.map(linkKey).sort();
    expect(F.GUARDIAN_RELATIONSHIPS.map(linkKey).sort()).toEqual(existingLinks);

    function expectParticipant(
      personId: string,
      tenantId: string,
      profiles: typeof F.ROLE_PROFILES,
    ) {
      expectReference(F.PEOPLE, personId, tenantId);
      expect(inTenant(profiles, tenantId).map((row) => row.personId)).toContain(personId);
    }
    for (const row of F.GUARDIAN_RELATIONSHIPS) {
      expectParticipant(row.guardianPersonId, row.tenantId, guardianProfiles);
      expectParticipant(row.learnerPersonId, row.tenantId, learnerProfiles);
      expectCalendarDate(row.tenantId, row.effectiveFrom);
      expectCalendarDate(row.tenantId, row.effectiveTo);
    }
    for (const { guardianPersonIds, learnerPersonIds, tenantId } of F.HOUSEHOLDS) {
      for (const id of guardianPersonIds) expectParticipant(id, tenantId, guardianProfiles);
      for (const id of learnerPersonIds) expectParticipant(id, tenantId, learnerProfiles);
    }
    for (const row of F.AUTHORISED_PICKUPS) {
      expectParticipant(row.learnerPersonId, row.tenantId, learnerProfiles);
      expectReference(F.PEOPLE, row.addedByPersonId, row.tenantId);
      expectCalendarDate(row.tenantId, row.validFrom);
      expectCalendarDate(row.tenantId, row.validTo);
    }
    const restricted = F.GUARDIAN_RELATIONSHIPS.filter(
      (row) => row.pickupRight === "court_restricted",
    );
    expect(restricted).toHaveLength(1);
    expect(restricted[0]).toMatchObject({
      tenantId: F.TENANT.riverside,
      courtOrderNote: expect.any(String),
    });
  });

  it("resolve field keys, workflow roles, and learner numbering within each tenant", () => {
    for (const tenantId of tenantIds) {
      const definitions = inTenant(F.CUSTOM_FIELD_DEFINITIONS, tenantId);
      const learners = inTenant(F.LEARNERS, tenantId);
      expect(definitions.length).toBeGreaterThanOrEqual(2);
      expect(definitions.some(({ sensitive }) => sensitive)).toBe(true);
      for (const form of inTenant(F.FORM_DEFINITIONS, tenantId)) {
        const fields = definitions.filter((row) => row.entity === form.entity);
        const keys = fields.map((row) => row.key);
        for (const key of form.fieldKeys) expect(keys, form.id).toContain(key);
      }
      const learnerFields = definitions.filter((row) => row.entity === "learner");
      const learnerKeys = learnerFields.map((row) => row.key);
      for (const learner of learners) {
        for (const key of Object.keys(learner.customFields)) {
          expect(learnerKeys, learner.id).toContain(key);
        }
      }
      const formats = inTenant(F.NUMBERING_FORMATS, tenantId);
      expect(formats).toHaveLength(1);
      const [format] = formats;
      expect(format?.subject).toBe("learner");
      expect(format?.nextSequence).toBe(learners.length + 1);
      const expectedNumbers = learners.map(({ admissionDate }, index) =>
        format?.pattern
          .replace("{YYYY}", admissionDate.slice(0, 4))
          .replace(/\{SEQ:([1-9])\}/, (_, width: string) =>
            String(index + 1).padStart(Number(width), "0"),
          ),
      );
      expect(learners.map(({ learnerNumber }) => learnerNumber)).toEqual(expectedNumbers);
    }
    for (const workflow of F.WORKFLOW_DEFINITIONS) {
      for (const step of workflow.steps) {
        expectReference(F.ROLES, step.approverRoleId, workflow.tenantId);
        expectReference(F.ROLES, step.escalateToRoleId, workflow.tenantId);
      }
    }
  });
});
