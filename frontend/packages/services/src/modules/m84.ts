import {
  BackupJobSchema,
  DiagnosticBundleSchema,
  InstallStatusSchema,
  PAGE_SIZE_MAX,
  UpdateOfferSchema,
  pageSchema,
} from "@nexus/contracts";
import { useQuery } from "@tanstack/react-query";
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
