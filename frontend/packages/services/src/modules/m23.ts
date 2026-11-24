import { IssuedDocumentSchema, PAGE_SIZE_MAX, pageSchema } from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const IssuedDocumentPage = pageSchema(IssuedDocumentSchema);

export function useIssuedDocuments(learnerId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m23.issuedDocuments(s, learnerId),
    (c, signal) =>
      c.get("/issued-documents", IssuedDocumentPage, { ...all, learnerId }, { signal }),
  );
}
