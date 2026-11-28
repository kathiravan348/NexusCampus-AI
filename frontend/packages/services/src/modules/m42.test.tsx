import {
  DEGREE_AUDIT,
  ELECTIVE_REGISTRATION,
  LEARNER,
  PATH_ADVICE_ID,
  ROLE_ASSIGNMENTS,
  REGISTRATION_WINDOW,
  TENANT,
  THESIS,
  resetMockDb,
  roleId,
} from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useDegreeAudits,
  useElectiveRegistrations,
  usePathAdvice,
  useProgramRequirements,
  useRegistrationWindows,
  useTheses,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M42 hooks", () => {
  it("loads requirements, windows, registrations, audits, theses and advice", async () => {
    const tenantId = TENANT.northbridge;
    const admin = ROLE_ASSIGNMENTS.find(
      (row) => row.roleId === roleId(tenantId, "admin") || row.roleId === roleId(tenantId, "owner"),
    )!.userId;
    signInAs({ ...ADMIN, tenantId, userId: admin });
    const { result } = renderHook(
      () => ({
        requirements: useProgramRequirements(),
        windows: useRegistrationWindows(),
        registrations: useElectiveRegistrations(LEARNER.nbJordan, REGISTRATION_WINDOW.nbSpringOpen),
        audits: useDegreeAudits(LEARNER.nbAiden),
        theses: useTheses(LEARNER.nbJordan),
        advice: usePathAdvice(LEARNER.nbAiden),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { requirements, windows, registrations, audits, theses, advice } = result.current;
      expect(requirements.data?.total).toBe(3);
      expect(windows.data?.total).toBe(3);
      expect(registrations.data?.items.map((row) => row.id)).toEqual([
        ELECTIVE_REGISTRATION.nbWithdrawn,
      ]);
      expect(audits.data?.items.map((row) => row.id)).toEqual([DEGREE_AUDIT.nbAidenProgress]);
      expect(theses.data?.items.map((row) => row.id)).toEqual([THESIS.nbSubmitted]);
      expect(advice.data?.items.map((row) => row.id)).toEqual([PATH_ADVICE_ID.nbReviewed]);
    });
  });
});
