import {
  CredentialTemplateSchema,
  CredentialVerificationSchema,
  IssuedCredentialSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "../config";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const templatePage = pageSchema(CredentialTemplateSchema);
const credentialPage = pageSchema(IssuedCredentialSchema);

export function useCredentialTemplates() {
  return useScopedQuery(
    (s) => queryKeys.m45.templates(s),
    (c, signal) => c.get("/credential-templates", templatePage, all, { signal }),
  );
}

export function useIssuedCredentials() {
  return useScopedQuery(
    (s) => queryKeys.m45.issuedCredentials(s),
    (c, signal) => c.get("/issued-credentials", credentialPage, all, { signal }),
  );
}

export function useIssuedCredential(credentialId: string) {
  return useScopedQuery(
    (s) => queryKeys.m45.issuedCredential(s, credentialId),
    (c, signal) =>
      c.get(
        `/issued-credentials/${encodeURIComponent(credentialId)}`,
        IssuedCredentialSchema,
        undefined,
        { signal },
      ),
  );
}

export function useCredentialVerification(code: string) {
  return useQuery({
    queryKey: queryKeys.m45.verification(code),
    enabled: code.length > 0,
    queryFn: async ({ signal }) => {
      const url = new URL(
        `${API_BASE}/credential-verifications/${encodeURIComponent(code)}`,
        window.location.origin,
      );
      const response = await fetch(url, { credentials: "omit", signal });
      if (!response.ok) throw new Error(`Credential verification failed (${response.status})`);
      return CredentialVerificationSchema.parse(await response.json());
    },
  });
}
