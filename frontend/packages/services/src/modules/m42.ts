import {
  DegreeAuditSchema,
  ElectiveRegistrationSchema,
  PAGE_SIZE_MAX,
  PathAdviceSchema,
  ProgramRequirementSchema,
  RegistrationWindowSchema,
  ThesisSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const ProgramRequirementPage = pageSchema(ProgramRequirementSchema);
const RegistrationWindowPage = pageSchema(RegistrationWindowSchema);
const ElectiveRegistrationPage = pageSchema(ElectiveRegistrationSchema);
const DegreeAuditPage = pageSchema(DegreeAuditSchema);
const ThesisPage = pageSchema(ThesisSchema);
const PathAdvicePage = pageSchema(PathAdviceSchema);

export function useProgramRequirements() {
  return useScopedQuery(
    (s) => queryKeys.m42.programRequirements(s),
    (c, signal) => c.get("/program-requirements", ProgramRequirementPage, all, { signal }),
  );
}

export function useRegistrationWindows() {
  return useScopedQuery(
    (s) => queryKeys.m42.registrationWindows(s),
    (c, signal) => c.get("/registration-windows", RegistrationWindowPage, all, { signal }),
  );
}

export function useElectiveRegistrations(
  learnerId: string | null = null,
  windowId: string | null = null,
) {
  const query = {
    ...all,
    ...(learnerId !== null ? { learnerId } : {}),
    ...(windowId !== null ? { windowId } : {}),
  };
  return useScopedQuery(
    (s) => queryKeys.m42.electiveRegistrations(s, learnerId, windowId),
    (c, signal) => c.get("/elective-registrations", ElectiveRegistrationPage, query, { signal }),
  );
}

export function useDegreeAudits(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m42.degreeAudits(s, learnerId),
    (c, signal) => c.get("/degree-audits", DegreeAuditPage, query, { signal }),
  );
}

export function useTheses(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m42.theses(s, learnerId),
    (c, signal) => c.get("/theses", ThesisPage, query, { signal }),
  );
}

export function usePathAdvice(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m42.pathAdvice(s, learnerId),
    (c, signal) => c.get("/path-advice", PathAdvicePage, query, { signal }),
  );
}
