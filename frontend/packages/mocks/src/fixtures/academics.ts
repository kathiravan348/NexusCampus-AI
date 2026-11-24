import type {
  ClassGroup,
  ClassGroupKind,
  Program,
  ProgramKind,
  Subject,
  SubjectKind,
  SubjectOffering,
  YearLevel,
} from "@nexus/contracts";
import { CALENDAR, CAMPUS, INSTITUTION, PERSON, TENANT } from "./ids";
import { CLASS_GROUP, OFFERING, PROGRAM, SUBJECT, YEAR_LEVEL } from "./ids-stage3";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

type SubjectSpec = readonly [id: string, code: string, name: string, kind: SubjectKind];

interface GroupSpec {
  level: readonly [id: string, code: string, name: string];
  key: keyof typeof CLASS_GROUP;
  className: string;
  staffing: readonly [campusId: string, staffPersonId: string];
}

interface AcademicSpec {
  tenantId: string;
  institutionId: string;
  academicYearId: string;
  program: readonly [
    id: string,
    code: string,
    name: string,
    kind: ProgramKind,
    years: number | null,
  ];
  groupKind: ClassGroupKind;
  capacity: number;
  groups: readonly GroupSpec[];
  subjects: readonly [SubjectSpec, SubjectSpec, SubjectSpec, SubjectSpec];
  credits: number | null;
}

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

function academicStructure(spec: AcademicSpec) {
  const { tenantId, institutionId, academicYearId } = spec;
  const [programId, code, name, kind, durationYears] = spec.program;
  const program: Program = {
    id: programId,
    tenantId,
    institutionId,
    code,
    name,
    kind,
    durationYears,
    active: true,
    ...timestamps,
  };
  const subjects: Subject[] = spec.subjects.map(([id, code, name, kind]) => ({
    id,
    tenantId,
    institutionId,
    code,
    name,
    kind,
    credits: spec.credits,
    active: true,
    ...timestamps,
  }));
  const placements = spec.groups.map((group, index) => {
    const [yearLevelId, yearCode, yearName] = group.level;
    const [campusId, staffPersonId] = group.staffing;
    const staff = ROLE_PROFILES.find(
      (profile) =>
        profile.tenantId === tenantId &&
        profile.personId === staffPersonId &&
        profile.kind === "staff",
    );
    if (!staff) throw new Error("Academic fixture is missing its staff profile");

    const yearLevel: YearLevel = {
      id: yearLevelId,
      tenantId,
      programId,
      code: yearCode,
      name: yearName,
      order: index + 1,
    };
    const classGroup: ClassGroup = {
      id: CLASS_GROUP[group.key],
      tenantId,
      institutionId,
      campusId,
      academicYearId,
      programId,
      yearLevelId: yearLevel.id,
      kind: spec.groupKind,
      code: yearCode,
      name: group.className,
      capacity: spec.capacity,
      homeroomStaffProfileId: staff.id,
      ...timestamps,
    };
    const [first, second, third, fourth] = spec.subjects;
    const [primary, secondary] = index % 2 === 0 ? [first, second] : [third, fourth];
    const [firstOfferingId, secondOfferingId] = OFFERING[group.key];
    const offerings: SubjectOffering[] = [
      { id: firstOfferingId, subjectId: primary[0] },
      { id: secondOfferingId, subjectId: secondary[0] },
    ].map(({ id, subjectId }) => ({
      id,
      tenantId,
      academicYearId,
      periodId: null,
      classGroupId: classGroup.id,
      subjectId,
      staffProfileIds: [staff.id],
      weeklyPeriods: 2,
      ...timestamps,
    }));
    return { yearLevel, classGroup, offerings };
  });
  return { program, subjects, placements };
}

const structures = [
  academicStructure({
    tenantId: TENANT.littleSteps,
    institutionId: INSTITUTION.littleSteps,
    academicYearId: CALENDAR.littleSteps,
    program: [PROGRAM.littleSteps, "EY", "Early Years", "early_years", 2],
    groupKind: "group",
    capacity: 16,
    groups: [
      {
        level: [YEAR_LEVEL.lsSeedlings, "NUR", "Nursery"],
        key: "lsSeedlings",
        className: "Seedlings Room",
        staffing: [CAMPUS.littleSteps, PERSON.lsArjun],
      },
      {
        level: [YEAR_LEVEL.lsExplorer, "PRE", "Pre-K"],
        key: "lsExplorer",
        className: "Explorers Room",
        staffing: [CAMPUS.littleSteps, PERSON.lsArjun],
      },
    ],
    subjects: [
      [SUBJECT.lsStory, "STORY", "Story Circle", "language"],
      [SUBJECT.lsPlay, "PLAY", "Creative Play", "activity"],
      [SUBJECT.lsNature, "NATURE", "Nature Discovery", "core"],
      [SUBJECT.lsRhythm, "RHYTHM", "Music and Movement", "activity"],
    ],
    credits: null,
  }),
  academicStructure({
    tenantId: TENANT.riverside,
    institutionId: INSTITUTION.riversideSchool,
    academicYearId: CALENDAR.riversideSchool,
    program: [PROGRAM.riverside, "MAIN", "Years 5 to 10", "school_stage", 6],
    groupKind: "section",
    capacity: 28,
    groups: [
      {
        level: [YEAR_LEVEL.rvYearFive, "Y5", "Year 5"],
        key: "rvSouthYearFive",
        className: "Year 5 South Section",
        staffing: [CAMPUS.riversideSouth, PERSON.rvAmira],
      },
      {
        level: [YEAR_LEVEL.rvYearSeven, "Y7", "Year 7"],
        key: "rvSouthYearSeven",
        className: "Year 7 South Section",
        staffing: [CAMPUS.riversideSouth, PERSON.rvAmira],
      },
      {
        level: [YEAR_LEVEL.rvYearNine, "Y9", "Year 9"],
        key: "rvNorthYearNine",
        className: "Year 9 North Section",
        staffing: [CAMPUS.riversideNorth, PERSON.rvTom],
      },
      {
        level: [YEAR_LEVEL.rvYearTen, "Y10", "Year 10"],
        key: "rvNorthYearTen",
        className: "Year 10 North Section",
        staffing: [CAMPUS.riversideNorth, PERSON.rvTom],
      },
    ],
    subjects: [
      [SUBJECT.rvEnglish, "ENG", "English", "language"],
      [SUBJECT.rvMaths, "MATH", "Mathematics", "core"],
      [SUBJECT.rvScience, "SCI", "Science", "core"],
      [SUBJECT.rvHistory, "HIST", "History", "core"],
    ],
    credits: null,
  }),
  academicStructure({
    tenantId: TENANT.northbridge,
    institutionId: INSTITUTION.northbridge,
    academicYearId: CALENDAR.northbridge,
    program: [PROGRAM.northbridge, "BSCS", "BS in Computer Science", "degree", 4],
    groupKind: "cohort",
    capacity: 60,
    groups: [
      {
        level: [YEAR_LEVEL.nbFirstYear, "Y1", "First Year"],
        key: "nbFirstYear",
        className: "First-Year Computing Cohort",
        staffing: [CAMPUS.northbridge, PERSON.nbElena],
      },
      {
        level: [YEAR_LEVEL.nbSecondYear, "Y2", "Second Year"],
        key: "nbSecondYear",
        className: "Second-Year Computing Cohort",
        staffing: [CAMPUS.northbridge, PERSON.nbMarcus],
      },
    ],
    subjects: [
      [SUBJECT.nbProgramming, "CS101", "Programming Fundamentals", "lab"],
      [SUBJECT.nbComputingMath, "CS102", "Discrete Mathematics", "core"],
      [SUBJECT.nbDatabases, "CS201", "Database Systems", "lab"],
      [SUBJECT.nbSystems, "CS202", "Computer Systems", "core"],
    ],
    credits: 3,
  }),
  academicStructure({
    tenantId: TENANT.apex,
    institutionId: INSTITUTION.apex,
    academicYearId: CALENDAR.apex,
    program: [PROGRAM.apex, "STEM", "STEM Exam Preparation", "batch_program", null],
    groupKind: "batch",
    capacity: 25,
    groups: [
      {
        level: [YEAR_LEVEL.axFoundation, "FND", "Foundation"],
        key: "axFoundation",
        className: "Foundation Batch",
        staffing: [CAMPUS.apex, PERSON.axMeena],
      },
      {
        level: [YEAR_LEVEL.axAdvanced, "ADV", "Advanced"],
        key: "axAdvanced",
        className: "Advanced Batch",
        staffing: [CAMPUS.apex, PERSON.axSuresh],
      },
    ],
    subjects: [
      [SUBJECT.axAlgebra, "ALG", "Algebra", "core"],
      [SUBJECT.axMechanics, "MECH", "Mechanics", "core"],
      [SUBJECT.axCalculus, "CALC", "Calculus", "core"],
      [SUBJECT.axElectricity, "ELEC", "Electricity", "core"],
    ],
    credits: null,
  }),
  academicStructure({
    tenantId: TENANT.harmony,
    institutionId: INSTITUTION.harmony,
    academicYearId: CALENDAR.harmony,
    program: [PROGRAM.harmony, "MUS", "Music Studies", "course", null],
    groupKind: "group",
    capacity: 12,
    groups: [
      {
        level: [YEAR_LEVEL.hmBeginner, "BEG", "Beginner"],
        key: "hmBeginner",
        className: "Beginner Music Group",
        staffing: [CAMPUS.harmony, PERSON.hmDaniel],
      },
      {
        level: [YEAR_LEVEL.hmIntermediate, "INT", "Intermediate"],
        key: "hmIntermediate",
        className: "Intermediate Music Group",
        staffing: [CAMPUS.harmony, PERSON.hmPriya],
      },
    ],
    subjects: [
      [SUBJECT.hmPiano, "PIANO", "Piano Skills", "core"],
      [SUBJECT.hmEarTraining, "EAR", "Ear Training", "activity"],
      [SUBJECT.hmTheory, "THEORY", "Music Theory", "core"],
      [SUBJECT.hmEnsemble, "ENS", "Ensemble Practice", "activity"],
    ],
    credits: null,
  }),
];

const placements = structures.flatMap((structure) => structure.placements);

export const PROGRAMS: readonly Program[] = structures.map((structure) => structure.program);
export const YEAR_LEVELS: readonly YearLevel[] = placements.map(({ yearLevel }) => yearLevel);
export const CLASS_GROUPS: readonly ClassGroup[] = placements.map((row) => row.classGroup);
export const SUBJECTS: readonly Subject[] = structures.flatMap(({ subjects }) => subjects);
export const SUBJECT_OFFERINGS: readonly SubjectOffering[] = placements.flatMap(
  (row) => row.offerings,
);
