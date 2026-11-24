import { describe, expect, it } from "vitest";
import {
  AuthorisedPickupSchema,
  GuardianRelationshipSchema,
  GuardianRelationshipViewSchema,
  HouseholdSchema,
  type AuthorisedPickup,
  type GuardianRelationship,
  type Household,
} from "./index";

const tenantId = "tenant-play-school";
const learnerPersonId = "person-play-school";
const createdAt = "2025-06-01T09:00:00Z";
const updatedAt = "2025-06-01T10:00:00Z";

const mother = {
  id: "relationship-1",
  tenantId,
  guardianPersonId: "person-mother",
  learnerPersonId,
  kind: "mother",
  parentalResponsibility: true,
  livesWithLearner: true,
  contactPriority: 1,
  pickupRight: "allowed",
  courtOrderNote: null,
  effectiveFrom: "2025-06-01",
  effectiveTo: null,
  createdAt,
  updatedAt,
} satisfies GuardianRelationship;

const father = {
  ...mother,
  id: "relationship-2",
  guardianPersonId: "person-father",
  kind: "father",
  livesWithLearner: false,
  contactPriority: 2,
  pickupRight: "court_restricted",
  courtOrderNote: "Collection requires supervised handover.",
} satisfies GuardianRelationship;

const household = {
  id: "household-1",
  tenantId,
  name: "Lotus household",
  address: { line1: "4 Example Lane", city: "Chennai", countryCode: "IN" },
  learnerPersonIds: [learnerPersonId],
  guardianPersonIds: [mother.guardianPersonId],
  primaryLanguage: "ta-IN",
  createdAt,
  updatedAt,
} satisfies Household;

const grandmotherPickup = {
  id: "pickup-1",
  tenantId,
  learnerPersonId,
  name: "Mira Raman",
  phone: "+12025550123",
  relationshipLabel: "Grandmother",
  validFrom: "2025-06-02",
  validTo: "2025-06-02",
  addedByPersonId: mother.guardianPersonId,
  createdAt,
} satisfies AuthorisedPickup;

describe("GuardianRelationship", () => {
  it("accepts a separated family with a court-restricted parent", () => {
    expect(GuardianRelationshipSchema.parse(mother)).toEqual(mother);
    expect(GuardianRelationshipSchema.parse(father)).toEqual(father);
  });

  it("rejects a guardian linked to themself", () => {
    const selfLink = { ...mother, guardianPersonId: learnerPersonId };
    expect(GuardianRelationshipSchema.safeParse(selfLink).success).toBe(false);
  });

  it("requires a court note exactly for court-restricted pickup", () => {
    const unexpectedNote = { ...father, pickupRight: "not_allowed" };
    const missingNote = { ...father, courtOrderNote: null };
    expect(GuardianRelationshipSchema.safeParse(unexpectedNote).success).toBe(false);
    expect(GuardianRelationshipSchema.safeParse(missingNote).success).toBe(false);
  });

  it("rejects invalid dates, contact priorities and extra keys", () => {
    for (const changes of [
      { effectiveTo: "2025-05-31" },
      { createdAt: updatedAt, updatedAt: createdAt },
      { contactPriority: 11 },
      { contactPriority: 1.5 },
      { extra: true },
    ]) {
      expect(GuardianRelationshipSchema.safeParse({ ...mother, ...changes }).success).toBe(false);
    }
  });
});

describe("GuardianRelationshipView", () => {
  it("accepts a masked note on a court-restricted pickup", () => {
    const masked = { ...father, courtOrderNote: null };
    expect(GuardianRelationshipViewSchema.parse(masked)).toEqual(masked);
  });

  it("rejects a court note on a pickup with no court restriction", () => {
    const unexpectedNote = { ...mother, courtOrderNote: father.courtOrderNote };
    expect(GuardianRelationshipViewSchema.safeParse(unexpectedNote).success).toBe(false);
  });
});

describe("Household", () => {
  it("accepts a household with a learner and only the parent they live with", () => {
    expect(HouseholdSchema.parse(household)).toEqual(household);
  });

  it("rejects duplicates in either member list", () => {
    const learnerPersonIds = [learnerPersonId, learnerPersonId];
    const guardianPersonId = mother.guardianPersonId;
    const guardianPersonIds = [guardianPersonId, guardianPersonId];
    expect(HouseholdSchema.safeParse({ ...household, learnerPersonIds }).success).toBe(false);
    expect(HouseholdSchema.safeParse({ ...household, guardianPersonIds }).success).toBe(false);
  });

  it("rejects an empty learner list, invalid timestamps and extra keys", () => {
    const reversedTimestamps = { ...household, createdAt: updatedAt, updatedAt: createdAt };
    expect(HouseholdSchema.safeParse({ ...household, learnerPersonIds: [] }).success).toBe(false);
    expect(HouseholdSchema.safeParse(reversedTimestamps).success).toBe(false);
    expect(HouseholdSchema.safeParse({ ...household, extra: true }).success).toBe(false);
  });
});

describe("AuthorisedPickup", () => {
  it("accepts a grandmother authorised to collect a learner for one day", () => {
    expect(AuthorisedPickupSchema.parse(grandmotherPickup)).toEqual(grandmotherPickup);
  });

  it("rejects a non-E.164 phone, a reversed validity window and extra keys", () => {
    const localPhone = { ...grandmotherPickup, phone: "2025550123" };
    const reversedDates = { ...grandmotherPickup, validTo: "2025-06-01" };
    const extraKey = { ...grandmotherPickup, extra: true };
    expect(AuthorisedPickupSchema.safeParse(localPhone).success).toBe(false);
    expect(AuthorisedPickupSchema.safeParse(reversedDates).success).toBe(false);
    expect(AuthorisedPickupSchema.safeParse(extraKey).success).toBe(false);
  });
});
