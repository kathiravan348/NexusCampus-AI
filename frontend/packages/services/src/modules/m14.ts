import {
  AuthorisedPickupSchema,
  GuardianRelationshipViewSchema,
  HouseholdSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const HouseholdPage = pageSchema(HouseholdSchema);
const GuardianRelationshipViewPage = pageSchema(GuardianRelationshipViewSchema);
const AuthorisedPickupPage = pageSchema(AuthorisedPickupSchema);

export function useHouseholds() {
  return useScopedQuery(queryKeys.m14.households, (c, signal) =>
    c.get("/households", HouseholdPage, all, { signal }),
  );
}

export function useGuardianRelationships(learnerPersonId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m14.guardianRelationships(s, learnerPersonId),
    (c, signal) =>
      c.get(
        "/guardian-relationships",
        GuardianRelationshipViewPage,
        { ...all, learnerPersonId },
        { signal },
      ),
  );
}

export function useAuthorisedPickups(learnerPersonId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m14.authorisedPickups(s, learnerPersonId),
    (c, signal) =>
      c.get("/authorised-pickups", AuthorisedPickupPage, { ...all, learnerPersonId }, { signal }),
  );
}
