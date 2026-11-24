import type { Enrolment, HealthFlag, Learner, LearnerDocument } from "@nexus/contracts";
import { CLASS_GROUPS } from "./academics";
import { LEARNER_FIELD, NUMBERING_FORMATS } from "./config";
import { PERSON } from "./ids";
import { CLASS_GROUP, ENROLMENT, LEARNER, LEARNER_DOCUMENT } from "./ids-stage3";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

function learnerPlacement(
  person: keyof typeof LEARNER,
  classGroupId: string,
  sequence: number,
  interest: string,
  healthFlags: HealthFlag[] = [],
) {
  const personId = PERSON[person];
  const profile = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === "learner");
  const group = CLASS_GROUPS.find((row) => row.id === classGroupId);
  if (!profile || !group) throw new Error("Incomplete learner fixture placement");

  const { tenantId, institutionId, campusId, effectiveFrom } = profile;
  const numbering = NUMBERING_FORMATS.find((row) => row.tenantId === tenantId);
  if (!numbering) throw new Error("Learner fixture is missing its numbering format");
  const learner: Learner = {
    id: LEARNER[person],
    tenantId,
    institutionId,
    campusId,
    personId,
    roleProfileId: profile.id,
    learnerNumber: numbering.pattern
      .replace("{YYYY}", effectiveFrom.slice(0, 4))
      .replace(/\{SEQ:([1-9])\}/, (_, width: string) =>
        String(sequence).padStart(Number(width), "0"),
      ),
    admissionDate: effectiveFrom,
    status: "enrolled",
    leftOn: null,
    healthFlags,
    customFields: { [LEARNER_FIELD.studyInterest]: interest },
    retentionState: "active",
    ...timestamps,
  };
  const enrolment: Enrolment = {
    id: ENROLMENT[person],
    tenantId,
    learnerId: learner.id,
    academicYearId: group.academicYearId,
    programId: group.programId,
    yearLevelId: group.yearLevelId,
    classGroupId: group.id,
    rollNumber: String(sequence),
    status: "active",
    effectiveFrom,
    effectiveTo: null,
    ...timestamps,
  };
  return { learner, enrolment, group };
}

const placements = [
  learnerPlacement("lsKavya", CLASS_GROUP.lsSeedlings, 1, "Storytelling", [
    { kind: "allergy", label: "Egg allergy", note: "Confirm the care plan with the family." },
  ]),
  learnerPlacement("lsRohan", CLASS_GROUP.lsExplorer, 2, "Music and movement"),
  learnerPlacement("lsIshaan", CLASS_GROUP.lsSeedlings, 3, "Creative play"),
  learnerPlacement("lsAnaya", CLASS_GROUP.lsExplorer, 4, "Nature discovery"),
  learnerPlacement("rvOliver", CLASS_GROUP.rvNorthYearTen, 1, "History"),
  learnerPlacement("rvMia", CLASS_GROUP.rvSouthYearFive, 2, "Reading"),
  learnerPlacement("rvLeo", CLASS_GROUP.rvSouthYearSeven, 3, "Science"),
  learnerPlacement("rvElla", CLASS_GROUP.rvNorthYearNine, 4, "Mathematics"),
  learnerPlacement("nbJordan", CLASS_GROUP.nbFirstYear, 1, "Programming"),
  learnerPlacement("nbSofia", CLASS_GROUP.nbFirstYear, 2, "Discrete mathematics"),
  learnerPlacement("nbAiden", CLASS_GROUP.nbSecondYear, 3, "Databases"),
  learnerPlacement("nbNora", CLASS_GROUP.nbSecondYear, 4, "Computer systems"),
  learnerPlacement("axVijay", CLASS_GROUP.axFoundation, 1, "Algebra"),
  learnerPlacement("axDivya", CLASS_GROUP.axFoundation, 2, "Mechanics"),
  learnerPlacement("axArun", CLASS_GROUP.axAdvanced, 3, "Calculus"),
  learnerPlacement("axNila", CLASS_GROUP.axAdvanced, 4, "Electricity"),
  learnerPlacement("hmEthan", CLASS_GROUP.hmBeginner, 1, "Piano"),
  learnerPlacement("hmChloe", CLASS_GROUP.hmBeginner, 2, "Ear training"),
  learnerPlacement("hmRachel", CLASS_GROUP.hmIntermediate, 3, "Music theory"),
  learnerPlacement("hmMarcus", CLASS_GROUP.hmIntermediate, 4, "Ensemble practice"),
];

export const LEARNERS: readonly Learner[] = placements.map(({ learner }) => learner);
export const ENROLMENTS: readonly Enrolment[] = placements.map(({ enrolment }) => enrolment);

function learnerDocument(
  id: string,
  learnerId: string,
  kind: LearnerDocument["kind"],
  fileName: string,
): LearnerDocument {
  const placement = placements.find(({ learner }) => learner.id === learnerId);
  if (!placement) throw new Error("Learner document fixture is missing its learner");

  const { learner, group } = placement;
  return {
    id,
    tenantId: learner.tenantId,
    learnerId,
    kind,
    fileName,
    contentType: "application/pdf",
    sizeBytes: 24_000,
    verified: group.homeroomStaffProfileId !== null,
    verifiedByStaffProfileId: group.homeroomStaffProfileId,
    uploadedAt: `${learner.admissionDate}T12:00:00Z`,
  };
}

export const LEARNER_DOCUMENTS: readonly LearnerDocument[] = [
  learnerDocument(LEARNER_DOCUMENT.littleSteps, LEARNER.lsKavya, "birth_certificate", "birth.pdf"),
  learnerDocument(LEARNER_DOCUMENT.riverside, LEARNER.rvOliver, "previous_report", "report.pdf"),
  learnerDocument(LEARNER_DOCUMENT.northbridge, LEARNER.nbJordan, "previous_report", "grades.pdf"),
  learnerDocument(LEARNER_DOCUMENT.apex, LEARNER.axVijay, "other", "enrolment.pdf"),
  learnerDocument(LEARNER_DOCUMENT.harmony, LEARNER.hmEthan, "other", "placement-summary.pdf"),
];
