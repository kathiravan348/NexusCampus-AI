import {
  BreakGlassCaseSchema,
  BrokerRequestSchema,
  BrokerSessionSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type AccessMode,
  type BrokerRequest,
  type ModuleId,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useControlQuery } from "./hooks";
import { useControlServices } from "./provider";

export const BrokerRequestPageSchema = pageSchema(BrokerRequestSchema);
export const BrokerSessionPageSchema = pageSchema(BrokerSessionSchema);
export const BreakGlassPageSchema = pageSchema(BreakGlassCaseSchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

export function useBrokerRequests() {
  return useControlQuery("/broker-requests", BrokerRequestPageSchema, ALL);
}

export function useBrokerSessions() {
  return useControlQuery("/broker-sessions", BrokerSessionPageSchema, ALL);
}

export function useBreakGlassCases() {
  return useControlQuery("/break-glass-cases", BreakGlassPageSchema, ALL);
}

export interface AccessRequestInput {
  readonly accountId: string;
  readonly tenantId: string;
  readonly ticketId: string | null;
  readonly reason: string;
  readonly modules: readonly ModuleId[];
  readonly mode: AccessMode;
  readonly durationHours: number;
}

/** Asks an institution for time-boxed access (`ctl.broker.request`); the institution decides in M83. */
export function useRequestAccess() {
  const { client, staffId } = useControlServices();
  const qc = useQueryClient();
  return useMutation<BrokerRequest, Error, AccessRequestInput>({
    mutationFn: (input) => client.send("POST", "/broker-requests", input, BrokerRequestSchema),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["control", staffId, "/broker-requests"] });
    },
  });
}
