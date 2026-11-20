import {
  AccessGrantSchema,
  AccessModeSchema,
  AccessRequestSchema,
  AuditEventSchema,
  BreakGlassNoticeSchema,
  KeyStatusSchema,
  MAX_GRANT_HOURS,
  ModuleIdSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type AccessGrant,
  type AccessRequest,
} from "@nexus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "../keys";
import { NO_PERSIST, useServices } from "../query";
import { useSession } from "../session";

/* M83 data vault & provider access (L0, D22): online only, never persisted, never sent to Assist. */

export const ApproveInputSchema = z.strictObject({
  modules: z.array(ModuleIdSchema).min(1),
  mode: AccessModeSchema,
  durationHours: z.int().min(1).max(MAX_GRANT_HOURS),
});
export type ApproveInput = z.infer<typeof ApproveInputSchema>;

export const ApproveResponseSchema = z.strictObject({
  request: AccessRequestSchema,
  grant: AccessGrantSchema,
});
export type ApproveResponse = z.infer<typeof ApproveResponseSchema>;

const all = { pageSize: PAGE_SIZE_MAX };

function useVaultQuery<T>(
  key: "keys" | "requests" | "grants" | "breakGlass",
  path: string,
  schema: z.ZodType<T>,
) {
  const { client, scope } = useServices();
  return useQuery({
    queryKey: scope ? queryKeys.m83[key](scope) : ["signed-out"],
    queryFn: ({ signal }) => client.get(path, schema, all, { signal }),
    enabled: scope !== null,
    meta: NO_PERSIST,
  });
}

export const useKeyStatus = () => useVaultQuery("keys", "/vault/keys", pageSchema(KeyStatusSchema));
export const useAccessRequests = () =>
  useVaultQuery("requests", "/access-requests", pageSchema(AccessRequestSchema));
export const useAccessGrants = () =>
  useVaultQuery("grants", "/access-grants", pageSchema(AccessGrantSchema));
export const useBreakGlassNotices = () =>
  useVaultQuery("breakGlass", "/break-glass-notices", pageSchema(BreakGlassNoticeSchema));

/** What a provider grant did: audit events whose `grantId` matches (only fetched when `grantId` is set). */
export function useGrantHistory(grantId: string | null) {
  const { client, scope } = useServices();
  return useQuery({
    queryKey: scope ? queryKeys.m83.history(scope, grantId) : ["signed-out"],
    queryFn: ({ signal }) =>
      client.get("/audit-events", pageSchema(AuditEventSchema), { grantId, ...all }, { signal }),
    enabled: scope !== null && grantId !== null,
    meta: NO_PERSIST,
  });
}

function useVaultInvalidate() {
  const { session } = useSession();
  const qc = useQueryClient();
  return async () => {
    if (session) await qc.invalidateQueries({ queryKey: queryKeys.m83.all(session) });
  };
}

export type DecideAccessRequest =
  | { readonly id: string; readonly decision: "approve"; readonly scope: ApproveInput }
  | { readonly id: string; readonly decision: "deny"; readonly reason: string };

/** Approve (with an equal or narrower scope) or deny (with a reason) a pending provider access request. */
export function useDecideAccessRequest() {
  const { client } = useServices();
  const invalidate = useVaultInvalidate();
  return useMutation<ApproveResponse | AccessRequest, Error, DecideAccessRequest>({
    mutationFn: (vars) => {
      const base = `/access-requests/${encodeURIComponent(vars.id)}`;
      return vars.decision === "approve"
        ? client.send("POST", `${base}/approve`, vars.scope, ApproveResponseSchema)
        : client.send("POST", `${base}/deny`, { reason: vars.reason }, AccessRequestSchema);
    },
    onSuccess: invalidate,
  });
}

/** Ends an active grant before its end time. */
export function useRevokeGrant() {
  const { client } = useServices();
  const invalidate = useVaultInvalidate();
  return useMutation<AccessGrant, Error, string>({
    mutationFn: (id) =>
      client.send("POST", `/access-grants/${encodeURIComponent(id)}/revoke`, {}, AccessGrantSchema),
    onSuccess: invalidate,
  });
}
