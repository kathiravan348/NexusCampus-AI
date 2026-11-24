import {
  AuthorisedPickupSchema,
  GuardianRelationshipViewSchema,
  HouseholdSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { HOUSEHOLD, PERSON, TENANT, USER } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.rvHelen) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: TENANT.riverside, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

const relationships = "/guardian-relationships";
const pickups = "/authorised-pickups";
const ellaPath = `${relationships}?learnerPersonId=${PERSON.rvElla}`;
const miaPickupPath = `${pickups}?learnerPersonId=${PERSON.rvMia}`;
const RelationshipsPage = pageSchema(GuardianRelationshipViewSchema);
const HouseholdsPage = pageSchema(HouseholdSchema);
const PickupsPage = pageSchema(AuthorisedPickupSchema);

describe("M14 read handlers", () => {
  it("lets admins see tenant households, pickup permissions and court notes", async () => {
    const households = await get("/households");
    expect(households.status).toBe(200);
    const { items } = HouseholdsPage.parse(await households.json());
    expect(items).toHaveLength(3);
    expect(items.every((row) => row.tenantId === TENANT.riverside)).toBe(true);

    const restricted = await get(ellaPath);
    expect(restricted.status).toBe(200);
    const page = RelationshipsPage.parse(await restricted.json());
    expect(page.items).toMatchObject([
      {
        tenantId: TENANT.riverside,
        learnerPersonId: PERSON.rvElla,
        pickupRight: "court_restricted",
      },
    ]);
    expect(page.items[0]?.courtOrderNote).toEqual(expect.any(String));

    const response = await get(miaPickupPath);
    expect(response.status).toBe(200);
    expect(PickupsPage.parse(await response.json()).items).toMatchObject([
      { tenantId: TENANT.riverside, learnerPersonId: PERSON.rvMia },
    ]);
  });

  it("lets teachers read relationship restrictions with court notes masked", async () => {
    const response = await get(ellaPath, USER.rvTom);
    expect(response.status).toBe(200);
    expect(RelationshipsPage.parse(await response.json()).items).toMatchObject([
      { learnerPersonId: PERSON.rvElla, pickupRight: "court_restricted", courtOrderNote: null },
    ]);
  });

  it("limits guardians to their family and masks court notes even for family", async () => {
    const households = await get("/households", USER.rvGrace);
    expect(households.status).toBe(200);
    expect(HouseholdsPage.parse(await households.json()).items).toMatchObject([
      { id: HOUSEHOLD.rvBennett, learnerPersonIds: [PERSON.rvOliver, PERSON.rvMia] },
    ]);

    const ownPickups = await get(pickups, USER.rvGrace);
    expect(ownPickups.status).toBe(200);
    expect(PickupsPage.parse(await ownPickups.json()).items).toMatchObject([
      { learnerPersonId: PERSON.rvMia },
    ]);
    expect((await get(ellaPath, USER.rvGrace)).status).toBe(404);
    expect((await get(miaPickupPath, USER.rvDaniel)).status).toBe(404);

    const ownCourtRestriction = await get(ellaPath, USER.rvDaniel);
    expect(ownCourtRestriction.status).toBe(200);
    expect(RelationshipsPage.parse(await ownCourtRestriction.json()).items).toMatchObject([
      { learnerPersonId: PERSON.rvElla, pickupRight: "court_restricted", courtOrderNote: null },
    ]);
  });

  it.each([relationships, pickups])("returns 404 for a foreign learner on %s", async (path) => {
    expect((await get(`${path}?learnerPersonId=${PERSON.lsKavya}`)).status).toBe(404);
  });

  it.each(["/households", relationships, pickups])(
    "denies viewers with neither read permission nor family scope at %s",
    async (path) => {
      mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
      expect((await get(path)).status).toBe(403);
    },
  );
});
