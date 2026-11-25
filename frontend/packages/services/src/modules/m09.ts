import {
  ColumnMappingSchema,
  ImportJobSchema,
  ImportRowIssueSchema,
  PAGE_SIZE_MAX,
  PromotionDecisionSchema,
  RolloverRunSchema,
  pageSchema,
  type ImportJob,
  type ImportJobInput,
  type PromotionDecision,
  type PromotionDecisionInput,
  type RolloverRun,
  type RolloverRunInput,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

const all = { pageSize: PAGE_SIZE_MAX };
const ImportJobPage = pageSchema(ImportJobSchema);
const ColumnMappingPage = pageSchema(ColumnMappingSchema);
const ImportRowIssuePage = pageSchema(ImportRowIssueSchema);
const RolloverRunPage = pageSchema(RolloverRunSchema);
const PromotionDecisionPage = pageSchema(PromotionDecisionSchema);

export function useImportJobs() {
  return useScopedQuery(queryKeys.m09.importJobs, (c, signal) =>
    c.get("/import-jobs", ImportJobPage, all, { signal }),
  );
}

export function useImportJobMappings(jobId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m09.importJobMappings(s, jobId),
    (c, signal) =>
      c.get(`/import-jobs/${encodeURIComponent(jobId ?? "")}/mappings`, ColumnMappingPage, all, {
        signal,
      }),
    jobId !== null,
  );
}

export function useImportJobIssues(jobId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m09.importJobIssues(s, jobId),
    (c, signal) =>
      c.get(`/import-jobs/${encodeURIComponent(jobId ?? "")}/issues`, ImportRowIssuePage, all, {
        signal,
      }),
    jobId !== null,
  );
}

/** Registers an import job (M09, L0: online only) and invalidates M09 queries for the session. */
export function useCreateImportJob() {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation<ImportJob, Error, ImportJobInput>({
    mutationFn: (body) => client.send("POST", "/import-jobs", body, ImportJobSchema),
    onSuccess: async () => {
      if (!session) return;
      await qc.invalidateQueries({ queryKey: queryKeys.m09.importJobs(session).slice(0, -1) });
    },
  });
}

export function useRolloverRuns() {
  return useScopedQuery(queryKeys.m86.rolloverRuns, (c, signal) =>
    c.get("/rollover-runs", RolloverRunPage, all, { signal }),
  );
}

export function useRolloverDecisions(runId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m86.rolloverDecisions(s, runId),
    (c, signal) =>
      c.get(
        `/rollover-runs/${encodeURIComponent(runId ?? "")}/decisions`,
        PromotionDecisionPage,
        all,
        { signal },
      ),
    runId !== null,
  );
}

/** Invalidates every M86 query of the session (runs and every run's decisions). */
function useInvalidateRollover() {
  const { session } = useSession();
  const qc = useQueryClient();
  return async () => {
    if (!session) return;
    await qc.invalidateQueries({ queryKey: queryKeys.m86.rolloverRuns(session).slice(0, -1) });
  };
}

/** Starts a rollover run with its dry run (M86, D84; L0: online only). */
export function useStartRollover() {
  const { client } = useServices();
  const invalidate = useInvalidateRollover();
  return useMutation<RolloverRun, Error, RolloverRunInput>({
    mutationFn: (body) => client.send("POST", "/rollover-runs", body, RolloverRunSchema),
    onSuccess: invalidate,
  });
}

/** Changes one learner's decision while the dry run is ready (M86, D84). */
export function useChangeDecision(runId: string) {
  const { client } = useServices();
  const invalidate = useInvalidateRollover();
  return useMutation<
    PromotionDecision,
    Error,
    { decisionId: string; input: PromotionDecisionInput }
  >({
    mutationFn: ({ decisionId, input }) =>
      client.send(
        "PUT",
        `/rollover-runs/${encodeURIComponent(runId)}/decisions/${encodeURIComponent(decisionId)}`,
        input,
        PromotionDecisionSchema,
      ),
    onSuccess: invalidate,
  });
}

function useRunAction(action: "confirm" | "rollback") {
  const { client } = useServices();
  const invalidate = useInvalidateRollover();
  return useMutation<RolloverRun, Error, string>({
    mutationFn: (runId) =>
      client.send(
        "POST",
        `/rollover-runs/${encodeURIComponent(runId)}/${action}`,
        {},
        RolloverRunSchema,
      ),
    onSuccess: invalidate,
  });
}

/** Applies a ready dry run (M86, D84): enrolments move, roll back stays possible for 14 days. */
export function useConfirmRollover() {
  return useRunAction("confirm");
}

/** Reverses a completed run inside its roll-back window (M86, D84). */
export function useRollBackRollover() {
  return useRunAction("rollback");
}
