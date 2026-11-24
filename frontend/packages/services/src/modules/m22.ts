import { ReportCardSchema, PAGE_SIZE_MAX, pageSchema } from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const ReportCardPage = pageSchema(ReportCardSchema);

export function useReportCards(learnerId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m22.reportCards(s, learnerId),
    (c, signal) => c.get("/report-cards", ReportCardPage, { ...all, learnerId }, { signal }),
  );
}
