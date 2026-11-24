import {
  IssuedDocumentReadSchema,
  IssuedDocumentSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type IssuedDocumentRevokeInput,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

const all = { pageSize: PAGE_SIZE_MAX };
const IssuedDocumentPage = pageSchema(IssuedDocumentReadSchema);

export function useIssuedDocuments(learnerId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m23.issuedDocuments(s, learnerId),
    (c, signal) =>
      c.get("/issued-documents", IssuedDocumentPage, { ...all, learnerId }, { signal }),
  );
}

export function useRevokeIssuedDocument(documentId: string) {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (input: IssuedDocumentRevokeInput) => {
      if (!navigator.onLine) throw new Error("offline");
      return client.send(
        "POST",
        `/issued-documents/${encodeURIComponent(documentId)}/revoke`,
        input,
        IssuedDocumentSchema,
      );
    },
    onSettled: async () => {
      if (session) {
        await qc.invalidateQueries({
          queryKey: queryKeys.m23.issuedDocuments(session, null).slice(0, -1),
        });
      }
    },
  });
}
