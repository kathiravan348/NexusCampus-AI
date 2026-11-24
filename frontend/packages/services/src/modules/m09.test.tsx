import { IMPORT_JOB, ROLLOVER_RUN } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useImportJobIssues,
  useImportJobMappings,
  useImportJobs,
  useRolloverDecisions,
  useRolloverRuns,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M09 and M86 hooks", () => {
  it("loads import jobs, mappings, issues, rollover runs, and decisions", async () => {
    signInAs(ADMIN);
    const jobId = IMPORT_JOB.ls[1];
    const runId = ROLLOVER_RUN.ls;
    const { result } = renderHook(
      () => ({
        jobs: useImportJobs(),
        mappings: useImportJobMappings(jobId),
        issues: useImportJobIssues(jobId),
        runs: useRolloverRuns(),
        decisions: useRolloverDecisions(runId),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.jobs.data?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: jobId })]),
      );
      expect(result.current.mappings.data?.items).toMatchObject([{ jobId }]);
      expect(result.current.issues.data?.items).toHaveLength(2);
      expect(result.current.runs.data?.items).toMatchObject([{ id: runId }]);
      const decisions = result.current.decisions.data?.items;
      expect(decisions).toHaveLength(4);
      expect(decisions?.every((row) => row.runId === runId)).toBe(true);
    });
  });
});
