import type { Locale, Person } from "@nexus/contracts";
import { PERSON, TENANT } from "./ids";
import { CREATED_AT, UPDATED_AT } from "./tenants";

/* All names, emails (`*.example.edu` / `*.test`) and phones are invented (D16). */

interface PersonExtras {
  readonly preferredName?: string;
  readonly dateOfBirth?: string;
  readonly isMinor?: boolean;
  readonly email?: string;
  readonly phone?: string;
  readonly preferredLocale?: Locale;
}

const person = (tenantId: string, id: string, legalName: string, x: PersonExtras = {}): Person => ({
  id,
  tenantId,
  legalName,
  preferredName: x.preferredName ?? null,
  dateOfBirth: x.dateOfBirth ?? null,
  isMinor: x.isMinor ?? false,
  email: x.email ?? null,
  phone: x.phone ?? null,
  preferredLocale: x.preferredLocale ?? null,
  retentionState: "active",
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
});

/** A minor learner: date of birth, no contact details of their own unless given. */
const minor = (
  tenantId: string,
  id: string,
  legalName: string,
  dob: string,
  x: PersonExtras = {},
) => person(tenantId, id, legalName, { ...x, dateOfBirth: dob, isMinor: true });

const LS = TENANT.littleSteps;
const RV = TENANT.riverside;
const NB = TENANT.northbridge;
const AX = TENANT.apex;
const HM = TENANT.harmony;
const TA: Locale = "ta-IN";

const lsMail = (local: string) => `${local}@littlesteps.example.edu`;
const rvMail = (local: string) => `${local}@riverside.example.edu`;
const nbMail = (local: string) => `${local}@northbridge.example.edu`;
const axMail = (local: string) => `${local}@apex.example.edu`;
const hmMail = (local: string) => `${local}@harmony.example.edu`;
const family = (local: string) => `${local}@family.test`;

export const PEOPLE: readonly Person[] = [
  // Little Steps (EY, India): learners are toddlers.
  person(LS, PERSON.lsPriya, "Priya Raman", {
    email: lsMail("priya.raman"),
    phone: "+919000000101",
  }),
  person(LS, PERSON.lsArjun, "Arjun Mehta", {
    email: lsMail("arjun.mehta"),
    phone: "+919000000102",
  }),
  person(LS, PERSON.lsSunita, "Sunita Rao", {
    email: family("sunita.rao"),
    phone: "+919000000103",
  }),
  person(LS, PERSON.lsDeepak, "Deepak Iyer", {
    email: family("deepak.iyer"),
    phone: "+919000000104",
  }),
  minor(LS, PERSON.lsKavya, "Kavya Mehta", "2023-02-11"),
  minor(LS, PERSON.lsRohan, "Rohan Rao", "2022-07-04"),
  minor(LS, PERSON.lsIshaan, "Ishaan Rao", "2023-09-19"),
  minor(LS, PERSON.lsAnaya, "Anaya Iyer", "2022-12-01"),

  // Riverside School (K12 under Riverside Education Group, UK).
  person(RV, PERSON.rvHelen, "Helen Carter", {
    email: rvMail("helen.carter"),
    phone: "+447700900101",
  }),
  person(RV, PERSON.rvTom, "Thomas Walsh", {
    preferredName: "Tom",
    email: rvMail("tom.walsh"),
    phone: "+447700900102",
  }),
  person(RV, PERSON.rvAmira, "Amira Shah", { email: rvMail("amira.shah"), phone: "+447700900103" }),
  person(RV, PERSON.rvGrace, "Grace Bennett", {
    email: family("grace.bennett"),
    phone: "+447700900104",
  }),
  person(RV, PERSON.rvDaniel, "Daniel Price", {
    email: family("daniel.price"),
    phone: "+447700900105",
  }),
  minor(RV, PERSON.rvOliver, "Oliver Bennett", "2012-03-14", { email: rvMail("oliver.bennett") }),
  minor(RV, PERSON.rvMia, "Mia Bennett", "2016-10-02"),
  minor(RV, PERSON.rvLeo, "Leo Shah", "2015-05-27"),
  minor(RV, PERSON.rvElla, "Ella Price", "2013-01-30"),

  // Northbridge University (HE, US): learners are adults.
  person(NB, PERSON.nbRobert, "Robert Hayes", {
    email: nbMail("robert.hayes"),
    phone: "+12025550101",
  }),
  person(NB, PERSON.nbElena, "Elena Ruiz", { email: nbMail("elena.ruiz"), phone: "+12025550102" }),
  person(NB, PERSON.nbMarcus, "Marcus Lee", { email: nbMail("marcus.lee"), phone: "+12025550103" }),
  person(NB, PERSON.nbPatricia, "Patricia Gomez", { email: family("patricia.gomez") }),
  person(NB, PERSON.nbJordan, "Jordan Lee", {
    dateOfBirth: "2007-04-22",
    email: nbMail("jordan.lee"),
  }),
  person(NB, PERSON.nbSofia, "Sofia Gomez", {
    dateOfBirth: "2006-11-08",
    email: nbMail("sofia.gomez"),
  }),
  person(NB, PERSON.nbAiden, "Aiden Clark", {
    dateOfBirth: "2005-02-17",
    email: nbMail("aiden.clark"),
  }),
  person(NB, PERSON.nbNora, "Nora Patel", {
    dateOfBirth: "2006-06-25",
    email: nbMail("nora.patel"),
  }),

  // Apex Coaching (TP, Chennai, Tamil first): names in Tamil script exercise an Indic script.
  person(AX, PERSON.axKarthik, "கார்த்திக் சுந்தரம்", {
    email: axMail("karthik"),
    phone: "+919000000401",
    preferredLocale: TA,
  }),
  person(AX, PERSON.axMeena, "மீனா ராஜன்", {
    email: axMail("meena"),
    phone: "+919000000402",
    preferredLocale: TA,
  }),
  person(AX, PERSON.axSuresh, "Suresh Kumar", {
    email: axMail("suresh"),
    phone: "+919000000403",
    preferredLocale: "en",
  }),
  person(AX, PERSON.axLakshmi, "லட்சுமி முருகன்", {
    email: family("lakshmi.murugan"),
    phone: "+919000000404",
    preferredLocale: TA,
  }),
  minor(AX, PERSON.axVijay, "விஜய் ராஜன்", "2010-05-03", { preferredLocale: TA }),
  minor(AX, PERSON.axDivya, "திவ்யா முருகன்", "2011-01-21", { preferredLocale: TA }),
  person(AX, PERSON.axArun, "அருண் பிரகாஷ்", {
    dateOfBirth: "2007-08-12",
    email: axMail("arun.prakash"),
    preferredLocale: TA,
  }),
  person(AX, PERSON.axNila, "நிலா செல்வம்", {
    dateOfBirth: "2006-03-30",
    email: axMail("nila.selvam"),
    preferredLocale: "en",
  }),

  // Harmony Music Academy (SK, Singapore): children and adult learners.
  person(HM, PERSON.hmWeiLing, "Tan Wei Ling", {
    email: hmMail("weiling.tan"),
    phone: "+6580000101",
  }),
  person(HM, PERSON.hmDaniel, "Daniel Koh", { email: hmMail("daniel.koh"), phone: "+6580000102" }),
  person(HM, PERSON.hmPriya, "Priya Nair", { email: hmMail("priya.nair"), phone: "+6580000103" }),
  person(HM, PERSON.hmMei, "Chen Mei", { email: family("mei.chen"), phone: "+6580000104" }),
  minor(HM, PERSON.hmEthan, "Ethan Koh", "2015-09-09"),
  minor(HM, PERSON.hmChloe, "Chloe Chen", "2014-12-15"),
  person(HM, PERSON.hmRachel, "Rachel Lim", {
    dateOfBirth: "1994-07-07",
    email: hmMail("rachel.lim"),
  }),
  person(HM, PERSON.hmMarcus, "Marcus Ong", {
    dateOfBirth: "1988-02-28",
    email: hmMail("marcus.ong"),
  }),
];
