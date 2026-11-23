import {
  BackupJobSchema,
  DiagnosticBundleSchema,
  DiagnosticContentSchema,
  InstallStatusSchema,
  PAGE_SIZE_MAX,
  UpdateOfferSchema,
  pageSchema,
  type DiagnosticBundle,
} from "@nexus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "../keys";
import { NO_PERSIST, useServices } from "../query";

/* M84 install agent (L0): answered by the install itself; online only and never persisted. */

export const UpdateOfferResponseSchema = z.strictObject({ offer: UpdateOfferSchema.nullable() });

function useInstallQuery<T>(
  key: "status" | "update" | "backups" | "diagnostics",
  path: string,
  schema: z.ZodType<T>,
  query?: Record<string, number>,
) {
  const { client, scope } = useServices();
  return useQuery({
    queryKey: scope ? queryKeys.m84[key](scope) : ["signed-out"],
    queryFn: ({ signal }) => client.get(path, schema, query, { signal }),
    enabled: scope !== null,
    meta: NO_PERSIST,
  });
}

const all = { pageSize: PAGE_SIZE_MAX };

export const useInstallStatus = () =>
  useInstallQuery("status", "/install/status", InstallStatusSchema);
export const useUpdateOffer = () =>
  useInstallQuery("update", "/install/update", UpdateOfferResponseSchema);
export const useBackups = () =>
  useInstallQuery("backups", "/install/backups", pageSchema(BackupJobSchema), all);
export const useDiagnosticBundles = () =>
  useInstallQuery("diagnostics", "/install/diagnostics", pageSchema(DiagnosticBundleSchema), all);

/**
 * Exactly the text a waiting support bundle would send (V-6, NEX-144). Only fetched while the review dialog is open
 * (`id` set); online only and never persisted, like every M84 read.
 */
export function useDiagnosticContent(id: string | null) {
  const { client, scope } = useServices();
  return useQuery({
    // Its own key, not under `diagnostics`: refreshing the list after a decision must not fetch the text again.
    queryKey: scope && id ? [...queryKeys.m84.all(scope), "diagnosticContent", id] : ["signed-out"],
    queryFn: ({ signal }) =>
      client.get(
        `/install/diagnostics/${encodeURIComponent(id ?? "")}/content`,
        DiagnosticContentSchema,
        undefined,
        { signal },
      ),
    enabled: scope !== null && id !== null,
    meta: NO_PERSIST,
    staleTime: 0,
  });
}

/** Approve sending or discard a bundle waiting for review; never queued offline (M84 is L0). */
function useDecideBundle(decision: "approve" | "discard") {
  const { client, scope } = useServices();
  const qc = useQueryClient();
  return useMutation<DiagnosticBundle, Error, string>({
    mutationFn: (id) =>
      client.send(
        "POST",
        `/install/diagnostics/${encodeURIComponent(id)}/${decision}`,
        {},
        DiagnosticBundleSchema,
      ),
    onSuccess: async () => {
      if (scope) await qc.invalidateQueries({ queryKey: queryKeys.m84.diagnostics(scope) });
    },
  });
}

export const useApproveBundle = () => useDecideBundle("approve");
export const useDiscardBundle = () => useDecideBundle("discard");
