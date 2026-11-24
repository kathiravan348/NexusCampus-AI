import {
  AdmissionOfferSchema,
  ApplicationSchema,
  EnquirySchema,
  PAGE_SIZE_MAX,
  WaitlistEntrySchema,
  pageSchema,
  type EnquiryStatus,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const EnquiryPage = pageSchema(EnquirySchema);
const ApplicationPage = pageSchema(ApplicationSchema);
const AdmissionOfferPage = pageSchema(AdmissionOfferSchema);
const WaitlistEntryPage = pageSchema(WaitlistEntrySchema);

export function useEnquiries(status: EnquiryStatus | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m12.enquiries(s, status),
    (c, signal) => c.get("/enquiries", EnquiryPage, { ...all, status }, { signal }),
  );
}

export function useApplications() {
  return useScopedQuery(queryKeys.m12.applications, (c, signal) =>
    c.get("/applications", ApplicationPage, all, { signal }),
  );
}

export function useAdmissionOffers() {
  return useScopedQuery(queryKeys.m12.admissionOffers, (c, signal) =>
    c.get("/admission-offers", AdmissionOfferPage, all, { signal }),
  );
}

export function useWaitlist() {
  return useScopedQuery(queryKeys.m12.waitlist, (c, signal) =>
    c.get("/waitlist", WaitlistEntryPage, all, { signal }),
  );
}
