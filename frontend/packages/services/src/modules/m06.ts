import {
  AuditEventSchema,
  CompliancePackSchema,
  ConsentSchema,
  DataSubjectRequestSchema,
  DsrStatusSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type DataSubjectRequest,
} from "@nexus/contracts";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { z } from "zod";
import type { ApiClient } from "../client";
import { queryKeys, type KeyScope } from "../keys";
import { NO_PERSIST, useServices } from "../query";
import { useSession } from "../session";

/* M06 audit, privacy & consent — L0: online only, never persisted on the device. */

export interface AuditFilters {
  readonly action?: string;
  readonly actorId?: string;
  /** UTC instants, inclusive. */
  readonly from?: string;
  readonly to?: string;
}

export const DsrUpdateInputSchema = z.strictObject({
  status: DsrStatusSchema,
  reason: z.string().max(500).optional(),
});
export type DsrUpdateInput = z.infer<typeof DsrUpdateInputSchema>;

export const AuditPageSchema = pageSchema(AuditEventSchema);
const ConsentPage = pageSchema(ConsentSchema);
const DsrPage = pageSchema(DataSubjectRequestSchema);
const PackPage = pageSchema(CompliancePackSchema);
const all = { pageSize: PAGE_SIZE_MAX };

/** Online-only query for the signed-in user, kept out of the persisted cache. */
function useL0Query<T>(
  key: (s: KeyScope) => QueryKey,
  fetch: (client: ApiClient, signal: AbortSignal) => Promise<T>,
) {
  const { client, scope } = useServices();
  return useQuery({
    queryKey: scope ? key(scope) : ["signed-out"],
    queryFn: ({ signal }) => fetch(client, signal),
    enabled: scope !== null,
    meta: NO_PERSIST,
  });
}

export function useAuditEvents(filters: AuditFilters, page: number, pageSize: number) {
  return useL0Query(
    (s) => queryKeys.m06.audit(s, filters, page, pageSize),
    (c, signal) =>
      c.get("/audit-events", AuditPageSchema, { ...filters, page, pageSize }, { signal }),
  );
}

export function useConsents() {
  return useL0Query(queryKeys.m06.consents, (c, signal) =>
    c.get("/consents", ConsentPage, all, { signal }),
  );
}

export function useDataRequests() {
  return useL0Query(queryKeys.m06.dataRequests, (c, signal) =>
    c.get("/data-requests", DsrPage, all, { signal }),
  );
}

export function useCompliancePacks() {
  return useL0Query(queryKeys.m06.compliancePacks, (c, signal) =>
    c.get("/compliance-packs", PackPage, all, { signal }),
  );
}

/** Moves a data subject request one step; refetches requests and the audit log. */
export function useUpdateDataRequest() {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation<DataSubjectRequest, Error, { id: string; data: DsrUpdateInput }>({
    mutationFn: ({ id, data }) =>
      client.send(
        "PATCH",
        `/data-requests/${encodeURIComponent(id)}`,
        data,
        DataSubjectRequestSchema,
      ),
    onSuccess: async () => {
      if (session) await qc.invalidateQueries({ queryKey: queryKeys.m06.all(session) });
    },
  });
}
