import {
  EnquiryFormSummarySchema,
  PAGE_SIZE_MAX,
  PublicEnquiryFormSchema,
  PublicEnquiryReceiptSchema,
  pageSchema,
  type PublicEnquiryInput,
  type PublicEnquiryReceipt,
} from "@nexus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { NO_PERSIST, useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

const EnquiryFormPage = pageSchema(EnquiryFormSummarySchema);

/** Submission payload allowing the hidden honeypot field to pass through to the server (D79). */
export type PublicEnquirySubmission = Omit<PublicEnquiryInput, "website"> & {
  readonly website: string;
};

/** Loads public admissions enquiry form metadata without requiring a session (D79). */
export function usePublicEnquiryForm(formId: string | undefined) {
  const { client } = useServices();
  const id = formId ?? "";
  return useQuery({
    queryKey: ["public", "m12", "enquiry-form", id],
    queryFn: ({ signal }) =>
      client.get(
        `/public/enquiry-forms/${encodeURIComponent(id)}`,
        PublicEnquiryFormSchema,
        undefined,
        { signal },
      ),
    enabled: Boolean(formId),
    meta: NO_PERSIST,
  });
}

/** Sends a public admissions enquiry without requiring a session; returns `{ received: true }` (D79). */
export function useSubmitPublicEnquiry(formId: string) {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation<PublicEnquiryReceipt, Error, PublicEnquirySubmission>({
    mutationFn: (body) =>
      client.send(
        "POST",
        `/public/enquiry-forms/${encodeURIComponent(formId)}/enquiries`,
        body,
        PublicEnquiryReceiptSchema,
      ),
    onSuccess: async () => {
      if (!session) return;
      await qc.invalidateQueries({ queryKey: queryKeys.m12.applications(session).slice(0, -1) });
    },
  });
}

/** Lists public enquiry form ids for the signed-in tenant (`m12.admissions.manage`). */
export function useEnquiryForms(enabled = true) {
  return useScopedQuery(
    (s) => [...queryKeys.m12.applications(s).slice(0, -1), "enquiry-forms"],
    (c, signal) =>
      c.get("/enquiry-forms", EnquiryFormPage, { pageSize: PAGE_SIZE_MAX }, { signal }),
    enabled,
  );
}
