import { renderHook, waitFor } from "@testing-library/react";
import { useAdmissionOffers, useApplications, useEnquiries, useWaitlist } from "../index";
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
});
