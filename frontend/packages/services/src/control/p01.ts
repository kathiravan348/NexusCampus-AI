import {
  AccountContactSchema,
  AccountNoteSchema,
  AccountSchema,
  ContractSchema,
  OpportunitySchema,
  PartnerSchema,
  PAGE_SIZE_MAX,
  StaffDirectoryEntrySchema,
  pageSchema,
  type AccountNote,
  type AccountStage,
  type DeliveryModel,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useControlQuery } from "./hooks";
import { useControlServices } from "./provider";

export const AccountPageSchema = pageSchema(AccountSchema);
export const ContactPageSchema = pageSchema(AccountContactSchema);
export const OpportunityPageSchema = pageSchema(OpportunitySchema);
export const ContractPageSchema = pageSchema(ContractSchema);
export const NotePageSchema = pageSchema(AccountNoteSchema);
export const StaffDirectoryPageSchema = pageSchema(StaffDirectoryEntrySchema);
export const PartnerPageSchema = pageSchema(PartnerSchema);

export interface AccountFilters {
  readonly stage?: AccountStage | null;
  readonly deliveryModel?: DeliveryModel | null;
}

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

/** Customer accounts the staff member may see (partners: only their own), filtered on the server. */
export function useAccounts(filters: AccountFilters = {}) {
  return useControlQuery("/accounts", AccountPageSchema, {
    ...ALL,
    stage: filters.stage ?? null,
    deliveryModel: filters.deliveryModel ?? null,
  });
}

export function useAccount(id: string) {
  return useControlQuery(`/accounts/${encodeURIComponent(id)}`, AccountSchema);
}

export function useAccountContacts(accountId: string) {
  return useControlQuery("/contacts", ContactPageSchema, { ...ALL, accountId });
}

export function useOpportunities(accountId: string) {
  return useControlQuery("/opportunities", OpportunityPageSchema, { ...ALL, accountId });
}

export function useContracts(accountId: string) {
  return useControlQuery("/contracts", ContractPageSchema, { ...ALL, accountId });
}

export function useAccountNotes(accountId: string) {
  return useControlQuery("/notes", NotePageSchema, { ...ALL, accountId });
}

/** Colleagues' names by id (owners, note authors). */
export function useStaffDirectory(): ReadonlyMap<string, string> {
  const query = useControlQuery("/staff-directory", StaffDirectoryPageSchema, ALL);
  return useMemo(
    () => new Map((query.data?.items ?? []).map((s) => [s.id, s.displayName])),
    [query.data],
  );
}

/** Adds a note to an account (`ctl.account.manage`); the notes list refetches. */
export function useAddAccountNote() {
  const { client, staffId } = useControlServices();
  const qc = useQueryClient();
  return useMutation<AccountNote, Error, { accountId: string; body: string }>({
    mutationFn: (input) => client.send("POST", "/notes", input, AccountNoteSchema),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["control", staffId, "/notes"],
      });
    },
  });
}

/** Partner names by id, for staff who may read partners (`ctl.partner.read`); empty otherwise. */
export function usePartnerNames(enabled: boolean): ReadonlyMap<string, string> {
  const query = useControlQuery("/partners", PartnerPageSchema, ALL, { enabled });
  return useMemo(
    () =>
      enabled
        ? new Map((query.data?.items ?? []).map((p) => [p.id, p.name]))
        : new Map<string, string>(),
    [query.data, enabled],
  );
}
