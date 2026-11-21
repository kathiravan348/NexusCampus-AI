import { useAccounts, useCatalogue, useStaffCan } from "@nexus/services/control";
import { useMemo } from "react";

/** Account names by id for tables (empty when the staff member cannot read accounts). */
export function useAccountNames(): ReadonlyMap<string, string> {
  const can = useStaffCan();
  const accounts = useAccounts({}, can("ctl.account.read"));
  return useMemo(
    () => new Map((accounts.data?.items ?? []).map((a) => [a.id, a.name])),
    [accounts.data],
  );
}

/** Catalogue item names by id (plans, add-ons) for staff who may read the catalogue. */
export function useCatalogueNames(): ReadonlyMap<string, string> {
  const can = useStaffCan();
  const catalogue = useCatalogue(can("ctl.quote.read"));
  return useMemo(
    () => new Map((catalogue.data?.items ?? []).map((i) => [i.id, i.name])),
    [catalogue.data],
  );
}
