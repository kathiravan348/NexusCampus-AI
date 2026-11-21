import {
  CatalogueItemSchema,
  PAGE_SIZE_MAX,
  QuoteSchema,
  pageSchema,
  type Quote,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useControlQuery } from "./hooks";
import { useControlServices } from "./provider";

export const CataloguePageSchema = pageSchema(CatalogueItemSchema);
export const QuotePageSchema = pageSchema(QuoteSchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

/** Everything we sell, with prices per country (P02). */
export function useCatalogue(enabled = true) {
  return useControlQuery("/catalogue", CataloguePageSchema, ALL, { enabled });
}

/** Quotes the staff member may see (partners: their accounts only). */
export function useQuotes() {
  return useControlQuery("/quotes", QuotePageSchema, ALL);
}

/** Sends a draft quote; AI drafts need `checkedByHuman: true` (A-1). Quotes refetch afterwards. */
export function useSendQuote() {
  const { client, staffId } = useControlServices();
  const qc = useQueryClient();
  return useMutation<Quote, Error, { id: string; checkedByHuman: boolean }>({
    mutationFn: ({ id, checkedByHuman }) =>
      client.send(
        "POST",
        `/quotes/${encodeURIComponent(id)}/send`,
        { checkedByHuman },
        QuoteSchema,
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["control", staffId, "/quotes"] });
    },
  });
}
