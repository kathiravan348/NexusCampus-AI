import {
  ClassGroupSchema,
  PAGE_SIZE_MAX,
  ProgramSchema,
  SubjectOfferingSchema,
  SubjectSchema,
  YearLevelSchema,
  pageSchema,
  type ClassGroup,
  type ClassGroupInput,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

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

/** Creates a class group (M15, L1: online save) and invalidates all M15 queries for the session. */
export function useCreateClassGroup() {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation<ClassGroup, Error, ClassGroupInput>({
    mutationFn: (body) => client.send("POST", "/class-groups", body, ClassGroupSchema),
    onSuccess: async () => {
      if (!session) return;
      await qc.invalidateQueries({ queryKey: queryKeys.m15.programs(session).slice(0, -1) });
    },
  });
}
