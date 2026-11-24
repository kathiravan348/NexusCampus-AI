import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useAdmissionOffers,
  useApplications,
  useCreateEnquiry,
  useEnquiries,
  useWaitlist,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M12 hooks", () => {
  it("loads enquiries, applications, offers, and waitlist entries", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({
        enquiries: useEnquiries("visit_booked"),
        applications: useApplications(),
        offers: useAdmissionOffers(),
        waitlist: useWaitlist(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.enquiries.data?.items).toMatchObject([{ status: "visit_booked" }]);
      expect(result.current.applications.data?.items).toHaveLength(2);
      expect(result.current.offers.data?.items).toHaveLength(1);
      expect(result.current.waitlist.data?.items).toHaveLength(1);
    });
  });

  it("refreshes the active status-filtered list after creating an enquiry", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({
        list: useEnquiries("new"),
        create: useCreateEnquiry(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const before = result.current.list.data!.total;
    await act(async () => {
      await result.current.create.mutateAsync({
        source: "walk_in",
        campusId: null,
        contactName: "Demo contact",
        contactPhone: null,
        contactEmail: "admissions@example.test",
        learnerName: "Demo learner",
        programId: null,
        followUpOn: null,
      } as const);
    });
    await waitFor(() => expect(result.current.list.data?.total).toBe(before + 1));
  });
});
