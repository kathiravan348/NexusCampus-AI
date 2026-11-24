import {
  PAGE_SIZE_MAX,
  ReportCardSchema,
  pageSchema,
  type ReportCardStatusInput,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

const all = { pageSize: PAGE_SIZE_MAX };
const ReportCardPage = pageSchema(ReportCardSchema);

export function useReportCards(
  learnerId: string | null = null,
  classGroupId: string | null = null,
) {
  return useScopedQuery(
    (s) => {
      const key = queryKeys.m22.reportCards(s, learnerId);
      return classGroupId === null ? key : [...key, classGroupId];
    },
    (c, signal) =>
      c.get("/report-cards", ReportCardPage, { ...all, learnerId, classGroupId }, { signal }),
  );
}

export function useUpdateReportCardStatus() {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, status }: ReportCardStatusInput & { id: string }) => {
      if (!navigator.onLine) throw new Error("offline");
      return client.send(
        "POST",
        `/report-cards/${encodeURIComponent(id)}/status`,
        { status },
        ReportCardSchema,
      );
    },
    onSettled: async () => {
      if (!session) return;
      await qc.invalidateQueries({
        queryKey: queryKeys.m22.reportCards(session, null).slice(0, -1),
      });
    },
  });
}
