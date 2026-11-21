import {
  LicenceFileSchema,
  LicenceSchema,
  PAGE_SIZE_MAX,
  UsageRecordSchema,
  pageSchema,
  type Licence,
  type LicenceFile,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useControlQuery } from "./hooks";
import { useControlServices } from "./provider";

export const LicencePageSchema = pageSchema(LicenceSchema);
export const UsagePageSchema = pageSchema(UsageRecordSchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

export function useLicences() {
  return useControlQuery("/licences", LicencePageSchema, ALL);
}

/** PII-free usage counts (`ctl.usage.read`); idle without the permission. */
export function useUsageRecords(enabled = true) {
  return useControlQuery("/usage", UsagePageSchema, ALL, { enabled });
}

/** Fetches the signed licence file for offline activation (`ctl.licence.issue`). */
export function useFetchLicenceFile() {
  const { client } = useControlServices();
  return useMutation<LicenceFile, Error, string>({
    mutationFn: (id) => client.get(`/licence-files/${encodeURIComponent(id)}`, LicenceFileSchema),
  });
}

/** Renews a licence for a year: new dates and a new signed file (`ctl.licence.issue`). */
export function useRenewLicence() {
  const { client, staffId } = useControlServices();
  const qc = useQueryClient();
  return useMutation<Licence, Error, string>({
    mutationFn: (id) =>
      client.send("POST", `/licences/${encodeURIComponent(id)}/renew`, {}, LicenceSchema),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["control", staffId, "/licences"] });
    },
  });
}
