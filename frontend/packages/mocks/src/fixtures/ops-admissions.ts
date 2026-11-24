import type { AdmissionOffer, Application, Enquiry, WaitlistEntry } from "@nexus/contracts";
import { CLASS_GROUPS, YEAR_LEVELS } from "./academics";
import { LEARNER_FIELD } from "./config";
import { CALENDAR, CAMPUS, INSTITUTION, PERSON, TENANT } from "./ids";
import {
  ADMISSION_OFFER,
  APPLICATION,
  ENQUIRY,
  FORM,
  LEARNER_DOCUMENT,
  type OpsTenantSlug,
  PROGRAM,
  WAITLIST_ENTRY,
} from "./ids-stage3";
import { LEARNERS } from "./learner-records";
import { GUARDIAN_LINKS, ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

export * from "./ops-admissions-2";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

interface AdmissionSpec {
  readonly slug: OpsTenantSlug;
  readonly key: keyof typeof FORM;
  readonly prefix: string;
  readonly tenantId: string;
  readonly institutionId: string;
  readonly campusId: string;
  readonly academicYearId: string;
  readonly adminPersonId: string;
  readonly phones: readonly [string, string, string];
  readonly contacts: readonly [
    readonly [string, string],
    readonly [string, string],
    readonly [string, string],
  ];
}

const SPECS: readonly AdmissionSpec[] = [
  {
    slug: "ls",
    key: "littleSteps",
    prefix: "LS",
    tenantId: TENANT.littleSteps,
    institutionId: INSTITUTION.littleSteps,
    campusId: CAMPUS.littleSteps,
    academicYearId: CALENDAR.littleSteps,
    adminPersonId: PERSON.lsPriya,
    phones: ["+919000000111", "+919000000112", "+919000000113"],
    contacts: [
      ["Ritu Nair", "Aarav Nair"],
      ["Kiran Joshi", "Mira Joshi"],
      ["Neha Verma", "Kabir Verma"],
    ],
  },
  {
    slug: "rv",
    key: "riverside",
    prefix: "RV",
    tenantId: TENANT.riverside,
    institutionId: INSTITUTION.riversideSchool,
    campusId: CAMPUS.riversideNorth,
    academicYearId: CALENDAR.riversideSchool,
    adminPersonId: PERSON.rvHelen,
    phones: ["+447700900111", "+447700900112", "+447700900113"],
    contacts: [
      ["Clara Dawson", "Finn Dawson"],
      ["Martin Brooks", "Hannah Brooks"],
      ["Sarah Evans", "Owen Evans"],
    ],
  },
  {
    slug: "nb",
    key: "northbridge",
    prefix: "NB",
    tenantId: TENANT.northbridge,
    institutionId: INSTITUTION.northbridge,
    campusId: CAMPUS.northbridge,
    academicYearId: CALENDAR.northbridge,
    adminPersonId: PERSON.nbRobert,
    phones: ["+12025550111", "+12025550112", "+12025550113"],
    contacts: [
      ["Samuel Ortiz", "Maya Ortiz"],
      ["Diana Foster", "Caleb Foster"],
      ["Victor Reed", "Chloe Reed"],
    ],
  },
  {
    slug: "ax",
    key: "apex",
    prefix: "AX",
    tenantId: TENANT.apex,
    institutionId: INSTITUTION.apex,
    campusId: CAMPUS.apex,
    academicYearId: CALENDAR.apex,
    adminPersonId: PERSON.axKarthik,
    phones: ["+919000000411", "+919000000412", "+919000000413"],
    contacts: [
      ["Kavitha Sundar", "Pranav Sundar"],
      ["Ramesh Kannan", "Harini Kannan"],
      ["Sangeetha Balan", "Nikhil Balan"],
    ],
  },
  {
    slug: "hm",
    key: "harmony",
    prefix: "HM",
    tenantId: TENANT.harmony,
    institutionId: INSTITUTION.harmony,
    campusId: CAMPUS.harmony,
    academicYearId: CALENDAR.harmony,
    adminPersonId: PERSON.hmWeiLing,
    phones: ["+6580000111", "+6580000112", "+6580000113"],
    contacts: [
      ["Lim Boon", "Lucas Lim"],
      ["Tan Siew", "Giselle Tan"],
      ["Goh Kenneth", "Ryan Goh"],
    ],
  },
];

const built = SPECS.map((spec) => {
  const { slug, key, prefix, tenantId, institutionId, campusId, academicYearId } = spec;
  const programId = PROGRAM[key];
  const adminStaff = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === spec.adminPersonId && p.kind === "staff",
  );
  const firstLevel = YEAR_LEVELS.find((y) => y.tenantId === tenantId);
  const firstGroup = CLASS_GROUPS.find((g) => g.tenantId === tenantId);
  const [firstLearner, secondLearner] = LEARNERS.filter((l) => l.tenantId === tenantId);
  if (!adminStaff || !firstLevel || !firstGroup || !firstLearner || !secondLearner) {
    throw new Error(`Incomplete admission references for ${tenantId}`);
  }

  const enquiryIds = ENQUIRY[slug];
  const enquiries: Enquiry[] = [
    {
      id: enquiryIds[0],
      tenantId,
      institutionId,
      campusId,
      source: "public_form",
      campaignCode: "OPEN-2026",
      contactName: spec.contacts[0][0],
      contactPhone: spec.phones[0],
      contactEmail: `enquiry.${slug}1@family.test`,
      learnerName: spec.contacts[0][1],
      programId,
      status: "applied",
      lostReason: null,
      assignedStaffProfileId: adminStaff.id,
      followUpOn: null,
      ...timestamps,
    },
    {
      id: enquiryIds[1],
      tenantId,
      institutionId,
      campusId,
      source: "referral",
      campaignCode: null,
      contactName: spec.contacts[1][0],
      contactPhone: spec.phones[1],
      contactEmail: `enquiry.${slug}2@family.test`,
      learnerName: spec.contacts[1][1],
      programId,
      status: "visit_booked",
      lostReason: null,
      assignedStaffProfileId: adminStaff.id,
      followUpOn: "2026-11-28",
      ...timestamps,
    },
    {
      id: enquiryIds[2],
      tenantId,
      institutionId,
      campusId,
      source: "website",
      campaignCode: null,
      contactName: spec.contacts[2][0],
      contactPhone: spec.phones[2],
      contactEmail: `enquiry.${slug}3@family.test`,
      learnerName: spec.contacts[2][1],
      programId,
      status: "lost",
      lostReason: "Family relocated to another city.",
      assignedStaffProfileId: adminStaff.id,
      followUpOn: null,
      ...timestamps,
    },
  ];

  const guardiansOf = (personId: string): string[] =>
    GUARDIAN_LINKS.filter((l) => l.tenantId === tenantId && l.learnerPersonId === personId).map(
      (l) => l.guardianPersonId,
    );

  const [appOneId, appTwoId] = APPLICATION[slug];
  const applications: Application[] = [
    {
      id: appOneId,
      tenantId,
      institutionId,
      enquiryId: enquiryIds[0],
      applicationNumber: `APP-${prefix}-2026-0001`,
      formId: FORM[key],
      academicYearId,
      programId,
      yearLevelId: firstLevel.id,
      applicantPersonId: firstLearner.personId,
      guardianPersonIds: guardiansOf(firstLearner.personId),
      answers: { [LEARNER_FIELD.studyInterest]: "Core program track" },
      documentIds: [LEARNER_DOCUMENT[key]],
      status: "offered",
      submittedAt: "2026-09-10T09:00:00Z",
      decidedAt: "2026-09-14T11:00:00Z",
      createdAt: "2026-09-10T08:30:00Z",
      updatedAt: "2026-09-14T11:00:00Z",
    },
    {
      id: appTwoId,
      tenantId,
      institutionId,
      enquiryId: null,
      applicationNumber: `APP-${prefix}-2026-0002`,
      formId: FORM[key],
      academicYearId,
      programId,
      yearLevelId: firstLevel.id,
      applicantPersonId: secondLearner.personId,
      guardianPersonIds: guardiansOf(secondLearner.personId),
      answers: { [LEARNER_FIELD.studyInterest]: "Extended study track" },
      documentIds: [],
      status: "waitlisted",
      submittedAt: "2026-09-11T09:00:00Z",
      decidedAt: "2026-09-14T11:00:00Z",
      createdAt: "2026-09-11T08:30:00Z",
      updatedAt: "2026-09-14T11:00:00Z",
    },
  ];

  const offer: AdmissionOffer = {
    id: ADMISSION_OFFER[slug],
    tenantId,
    applicationId: appOneId,
    classGroupId: firstGroup.id,
    expiresOn: "2026-12-05",
    status: "open",
    respondedAt: null,
    createdAt: "2026-09-14T11:05:00Z",
  };
  const waitlist: WaitlistEntry = {
    id: WAITLIST_ENTRY[slug],
    tenantId,
    applicationId: appTwoId,
    programId,
    position: 1,
    addedAt: "2026-09-14T11:10:00Z",
  };
  return { enquiries, applications, offer, waitlist };
});

export const ENQUIRIES: readonly Enquiry[] = built.flatMap((b) => b.enquiries);
export const APPLICATIONS: readonly Application[] = built.flatMap((b) => b.applications);
export const ADMISSION_OFFERS: readonly AdmissionOffer[] = built.map((b) => b.offer);
export const WAITLIST_ENTRIES: readonly WaitlistEntry[] = built.map((b) => b.waitlist);
