import { DEMO_PERSONAS, HOUSEHOLD, PERSON, USER } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { useAuthorisedPickups, useGuardianRelationships, useHouseholds } from "../index";
import { freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M14 hooks", () => {
  it("loads households and pickups and parses a masked court restriction", async () => {
    const teacher = DEMO_PERSONAS.find((persona) => persona.userId === USER.rvTom)!;
    signInAs(teacher);
    const { result } = renderHook(
      () => ({
        households: useHouseholds(),
        relationships: useGuardianRelationships(PERSON.rvElla),
        pickups: useAuthorisedPickups(PERSON.rvMia),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.households.data?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: HOUSEHOLD.rvBennett })]),
      );
      expect(result.current.relationships.data?.items).toMatchObject([
        { learnerPersonId: PERSON.rvElla, pickupRight: "court_restricted", courtOrderNote: null },
      ]);
      expect(result.current.pickups.data?.items).toMatchObject([{ learnerPersonId: PERSON.rvMia }]);
    });
  });
});
