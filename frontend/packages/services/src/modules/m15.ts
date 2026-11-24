import {
  ClassGroupSchema,
  PAGE_SIZE_MAX,
  ProgramSchema,
  SubjectOfferingSchema,
  SubjectSchema,
  YearLevelSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const ProgramPage = pageSchema(ProgramSchema);
const YearLevelPage = pageSchema(YearLevelSchema);
const ClassGroupPage = pageSchema(ClassGroupSchema);
const SubjectPage = pageSchema(SubjectSchema);
const SubjectOfferingPage = pageSchema(SubjectOfferingSchema);

export function usePrograms() {
  return useScopedQuery(queryKeys.m15.programs, (c, signal) =>
    c.get("/programs", ProgramPage, all, { signal }),
  );
}

export function useYearLevels() {
  return useScopedQuery(queryKeys.m15.yearLevels, (c, signal) =>
    c.get("/year-levels", YearLevelPage, all, { signal }),
  );
}

export function useClassGroups() {
  return useScopedQuery(queryKeys.m15.classGroups, (c, signal) =>
    c.get("/class-groups", ClassGroupPage, all, { signal }),
  );
}

export function useSubjects() {
  return useScopedQuery(queryKeys.m15.subjects, (c, signal) =>
    c.get("/subjects", SubjectPage, all, { signal }),
  );
}

export function useSubjectOfferings(academicYearId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m15.subjectOfferings(s, academicYearId),
    (c, signal) =>
      c.get("/subject-offerings", SubjectOfferingPage, { ...all, academicYearId }, { signal }),
  );
}
