import { PAGE_SIZE_MAX, TextOverrideSchema, pageSchema } from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

export const TextOverridePageSchema = pageSchema(TextOverrideSchema);

/** The tenant's text overrides for one locale, layered over the message catalogue. */
export function useTextOverrides(locale: string) {
  return useScopedQuery(
    (s) => queryKeys.m04.textOverrides(s, locale),
    (client, signal) =>
      client.get(
        "/texts/overrides",
        TextOverridePageSchema,
        { locale, pageSize: PAGE_SIZE_MAX },
        { signal },
      ),
  );
}
