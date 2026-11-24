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
