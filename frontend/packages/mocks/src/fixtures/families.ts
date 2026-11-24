import type { AuthorisedPickup, GuardianRelationship, Household } from "@nexus/contracts";
import { PERSON, TENANT } from "./ids";
import { AUTHORISED_PICKUP, GUARDIAN_RELATIONSHIP, HOUSEHOLD } from "./ids-stage3";
import { PEOPLE } from "./people";
import { GUARDIAN_LINKS, ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

function calendarStart(tenantId: string, learnerPersonId: string): string {
  const profile = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === learnerPersonId && p.kind === "learner",
  );
  if (!profile) throw new Error("Family fixture is missing its learner profile");
  return profile.effectiveFrom;
}

type RelationshipSpec = readonly [id: string, kind: GuardianRelationship["kind"]];
const relationshipDetails: Readonly<Partial<Record<string, RelationshipSpec>>> = {
  [PERSON.lsKavya]: [GUARDIAN_RELATIONSHIP.lsKavya, "father"],
  [PERSON.lsRohan]: [GUARDIAN_RELATIONSHIP.lsRohan, "mother"],
  [PERSON.lsIshaan]: [GUARDIAN_RELATIONSHIP.lsIshaan, "mother"],
  [PERSON.lsAnaya]: [GUARDIAN_RELATIONSHIP.lsAnaya, "father"],
  [PERSON.rvOliver]: [GUARDIAN_RELATIONSHIP.rvOliver, "mother"],
  [PERSON.rvMia]: [GUARDIAN_RELATIONSHIP.rvMia, "mother"],
  [PERSON.rvLeo]: [GUARDIAN_RELATIONSHIP.rvLeo, "mother"],
  [PERSON.rvElla]: [GUARDIAN_RELATIONSHIP.rvElla, "father"],
  [PERSON.nbJordan]: [GUARDIAN_RELATIONSHIP.nbJordan, "father"],
  [PERSON.nbSofia]: [GUARDIAN_RELATIONSHIP.nbSofia, "mother"],
  [PERSON.axVijay]: [GUARDIAN_RELATIONSHIP.axVijay, "mother"],
  [PERSON.axDivya]: [GUARDIAN_RELATIONSHIP.axDivya, "mother"],
  [PERSON.hmEthan]: [GUARDIAN_RELATIONSHIP.hmEthan, "father"],
  [PERSON.hmChloe]: [GUARDIAN_RELATIONSHIP.hmChloe, "mother"],
};

function guardianRelationship(link: (typeof GUARDIAN_LINKS)[number]): GuardianRelationship {
  const details = relationshipDetails[link.learnerPersonId];
  const learner = PEOPLE.find((person) => person.id === link.learnerPersonId);
  if (!details || !learner) throw new Error("Guardian relationship fixture is incomplete");

  const [id, kind] = details;
  const courtRestricted = id === GUARDIAN_RELATIONSHIP.rvElla;
  return {
    ...link,
    id,
    kind,
    parentalResponsibility: learner.isMinor,
    livesWithLearner: learner.isMinor && !courtRestricted,
    contactPriority: 1,
    pickupRight: courtRestricted ? "court_restricted" : "allowed",
    courtOrderNote: courtRestricted ? "Collection requires prior court approval." : null,
    effectiveFrom: calendarStart(link.tenantId, link.learnerPersonId),
    effectiveTo: null,
    ...timestamps,
  };
}

export const GUARDIAN_RELATIONSHIPS = GUARDIAN_LINKS.map(guardianRelationship);

function household(
  id: string,
  tenantId: string,
  name: string,
  learnerPersonIds: string[],
): Household {
  const guardianPersonIds = GUARDIAN_RELATIONSHIPS.filter(
    (row) => row.tenantId === tenantId && learnerPersonIds.includes(row.learnerPersonId),
  ).map((row) => row.guardianPersonId);
  return {
    id,
    tenantId,
    name,
    address: null,
    learnerPersonIds,
    guardianPersonIds: [...new Set(guardianPersonIds)],
    primaryLanguage: null,
    ...timestamps,
  };
}

const LS = TENANT.littleSteps;
const RV = TENANT.riverside;
const NB = TENANT.northbridge;
const AX = TENANT.apex;
const HM = TENANT.harmony;

export const HOUSEHOLDS: readonly Household[] = [
  household(HOUSEHOLD.lsMehta, LS, "Mehta household", [PERSON.lsKavya]),
  household(HOUSEHOLD.lsRao, LS, "Rao household", [PERSON.lsRohan, PERSON.lsIshaan]),
  household(HOUSEHOLD.lsIyer, LS, "Iyer household", [PERSON.lsAnaya]),
  household(HOUSEHOLD.rvBennett, RV, "Bennett household", [PERSON.rvOliver, PERSON.rvMia]),
  household(HOUSEHOLD.rvShah, RV, "Shah household", [PERSON.rvLeo]),
  household(HOUSEHOLD.rvPrice, RV, "Price household", [PERSON.rvElla]),
  household(HOUSEHOLD.nbLee, NB, "Lee household", [PERSON.nbJordan]),
  household(HOUSEHOLD.nbGomez, NB, "Gomez household", [PERSON.nbSofia]),
  household(HOUSEHOLD.nbClark, NB, "Clark household", [PERSON.nbAiden]),
  household(HOUSEHOLD.nbPatel, NB, "Patel household", [PERSON.nbNora]),
  household(HOUSEHOLD.axRajan, AX, "Rajan household", [PERSON.axVijay]),
  household(HOUSEHOLD.axMurugan, AX, "Murugan household", [PERSON.axDivya]),
  household(HOUSEHOLD.axPrakash, AX, "Prakash household", [PERSON.axArun]),
  household(HOUSEHOLD.axSelvam, AX, "Selvam household", [PERSON.axNila]),
  household(HOUSEHOLD.hmKoh, HM, "Koh household", [PERSON.hmEthan]),
  household(HOUSEHOLD.hmChen, HM, "Chen household", [PERSON.hmChloe]),
  household(HOUSEHOLD.hmLim, HM, "Lim household", [PERSON.hmRachel]),
  household(HOUSEHOLD.hmOng, HM, "Ong household", [PERSON.hmMarcus]),
];

function pickup(
  id: string,
  tenantId: string,
  learnerPersonId: string,
  name: string,
  phone: string,
  relationshipLabel: string,
  addedByPersonId: string,
): AuthorisedPickup {
  return {
    id,
    tenantId,
    learnerPersonId,
    name,
    phone,
    relationshipLabel,
    validFrom: calendarStart(tenantId, learnerPersonId),
    validTo: null,
    addedByPersonId,
    createdAt: CREATED_AT,
  };
}

export const AUTHORISED_PICKUPS: readonly AuthorisedPickup[] = [
  pickup(
    AUTHORISED_PICKUP.littleSteps,
    LS,
    PERSON.lsKavya,
    "Nandini Mehta",
    "+919000000105",
    "Aunt",
    PERSON.lsArjun,
  ),
  pickup(
    AUTHORISED_PICKUP.riverside,
    RV,
    PERSON.rvMia,
    "Eleanor Bennett",
    "+447700900106",
    "Grandparent",
    PERSON.rvGrace,
  ),
  pickup(
    AUTHORISED_PICKUP.northbridge,
    NB,
    PERSON.nbSofia,
    "Lucia Gomez",
    "+12025550104",
    "Designated contact",
    PERSON.nbSofia,
  ),
  pickup(
    AUTHORISED_PICKUP.apex,
    AX,
    PERSON.axDivya,
    "கமலா முருகன்",
    "+919000000405",
    "அத்தை",
    PERSON.axLakshmi,
  ),
  pickup(
    AUTHORISED_PICKUP.harmony,
    HM,
    PERSON.hmChloe,
    "Chen Hui",
    "+6580000105",
    "Adult sibling",
    PERSON.hmMei,
  ),
];
