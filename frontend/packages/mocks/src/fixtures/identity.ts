import type { Session, SsoProvider, User, UserStatus } from "@nexus/contracts";
import { INSTITUTION, PERSON, SSO_PROVIDER, TENANT, USER } from "./ids";
import { PEOPLE } from "./people";
import { CREATED_AT, UPDATED_AT } from "./tenants";

interface UserExtras {
  readonly status?: UserStatus;
  readonly mfaEnabled?: boolean;
  readonly passkeyCount?: number;
  readonly ssoOnly?: boolean;
  readonly lastSignInAt?: string | null;
}

/** A sign-in account; tenant and email come from the person, so they always match. */
const user = (id: string, personId: string, x: UserExtras = {}): User => {
  const person = PEOPLE.find((p) => p.id === personId);
  if (!person?.email) throw new Error(`Person ${personId} is missing or has no email`);
  return {
    id,
    tenantId: person.tenantId,
    personId,
    email: person.email,
    status: x.status ?? "active",
    mfaEnabled: x.mfaEnabled ?? false,
    passkeyCount: x.passkeyCount ?? 0,
    ssoOnly: x.ssoOnly ?? false,
    lastSignInAt: x.lastSignInAt === undefined ? "2026-09-14T07:45:00Z" : x.lastSignInAt,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
};

const ADMIN: UserExtras = { mfaEnabled: true, passkeyCount: 1 };
const SSO: UserExtras = { ssoOnly: true, mfaEnabled: true };

export const USERS: readonly User[] = [
  user(USER.lsPriya, PERSON.lsPriya, ADMIN),
  user(USER.lsArjun, PERSON.lsArjun),
  user(USER.lsSunita, PERSON.lsSunita),
  user(USER.lsDeepak, PERSON.lsDeepak, { status: "invited", lastSignInAt: null }),

  user(USER.rvHelen, PERSON.rvHelen, { ...SSO, passkeyCount: 2 }),
  user(USER.rvTom, PERSON.rvTom, SSO),
  user(USER.rvAmira, PERSON.rvAmira, SSO),
  user(USER.rvGrace, PERSON.rvGrace),
  user(USER.rvDaniel, PERSON.rvDaniel, { status: "locked" }),
  user(USER.rvOliver, PERSON.rvOliver, SSO),

  user(USER.nbRobert, PERSON.nbRobert, { ...SSO, passkeyCount: 1 }),
  user(USER.nbElena, PERSON.nbElena, SSO),
  user(USER.nbMarcus, PERSON.nbMarcus, SSO),
  user(USER.nbPatricia, PERSON.nbPatricia),
  user(USER.nbJordan, PERSON.nbJordan, SSO),
  user(USER.nbSofia, PERSON.nbSofia, { ...SSO, status: "suspended" }),

  user(USER.axKarthik, PERSON.axKarthik, ADMIN),
  user(USER.axMeena, PERSON.axMeena),
  user(USER.axSuresh, PERSON.axSuresh),
  user(USER.axLakshmi, PERSON.axLakshmi),
  user(USER.axArun, PERSON.axArun),

  user(USER.hmWeiLing, PERSON.hmWeiLing, ADMIN),
  user(USER.hmDaniel, PERSON.hmDaniel),
  user(USER.hmPriya, PERSON.hmPriya),
  user(USER.hmMei, PERSON.hmMei),
  user(USER.hmRachel, PERSON.hmRachel),
];

/** Device sessions. IPs are documentation ranges (RFC 5737 / RFC 3849); no tokens. */
export const SESSIONS: readonly Session[] = [
  {
    id: "ses-ls-priya-1",
    tenantId: TENANT.littleSteps,
    userId: USER.lsPriya,
    deviceId: "dev-ls-office-pc",
    deviceLabel: "Office PC · Chrome",
    authMethod: "passkey",
    mfaVerified: true,
    ipAddress: "192.0.2.10",
    createdAt: "2026-09-14T07:45:00Z",
    lastSeenAt: "2026-09-14T11:20:00Z",
    expiresAt: "2026-09-28T07:45:00Z",
    revokedAt: null,
  },
  {
    id: "ses-rv-helen-1",
    tenantId: TENANT.riverside,
    userId: USER.rvHelen,
    deviceId: "dev-rv-helen-laptop",
    deviceLabel: "Laptop · Edge",
    authMethod: "sso",
    mfaVerified: true,
    ipAddress: "198.51.100.24",
    createdAt: "2026-09-14T07:45:00Z",
    lastSeenAt: "2026-09-14T15:02:00Z",
    expiresAt: "2026-09-15T07:45:00Z",
    revokedAt: null,
  },
  {
    id: "ses-rv-tom-1",
    tenantId: TENANT.riverside,
    userId: USER.rvTom,
    deviceId: "dev-rv-north-tablet",
    deviceLabel: "Classroom tablet · Android",
    authMethod: "sso",
    mfaVerified: true,
    ipAddress: "198.51.100.31",
    createdAt: "2026-09-10T08:00:00Z",
    lastSeenAt: "2026-09-11T09:15:00Z",
    expiresAt: "2026-09-17T08:00:00Z",
    revokedAt: "2026-09-11T09:30:00Z",
  },
  {
    id: "ses-nb-robert-1",
    tenantId: TENANT.northbridge,
    userId: USER.nbRobert,
    deviceId: "dev-nb-robert-mac",
    deviceLabel: "MacBook · Safari",
    authMethod: "sso",
    mfaVerified: true,
    ipAddress: "2001:db8::42",
    createdAt: "2026-09-14T07:45:00Z",
    lastSeenAt: "2026-09-14T13:40:00Z",
    expiresAt: "2026-09-15T07:45:00Z",
    revokedAt: null,
  },
  {
    id: "ses-ax-karthik-1",
    tenantId: TENANT.apex,
    userId: USER.axKarthik,
    deviceId: "dev-ax-karthik-phone",
    deviceLabel: "iPhone · Safari",
    authMethod: "password",
    mfaVerified: true,
    ipAddress: null,
    createdAt: "2026-09-14T07:45:00Z",
    lastSeenAt: "2026-09-14T08:10:00Z",
    expiresAt: "2026-09-21T07:45:00Z",
    revokedAt: null,
  },
];

/** SSO providers: Riverside SAML for the whole group tenant, Northbridge OIDC for the university. */
export const SSO_PROVIDERS: readonly SsoProvider[] = [
  {
    id: SSO_PROVIDER.riversideSaml,
    tenantId: TENANT.riverside,
    institutionId: null,
    protocol: "saml2",
    name: "Riverside staff and pupils",
    issuerUrl: "https://idp.riverside.example.edu/saml",
    clientId: "nexus-campus-riverside",
    domains: ["riverside.example.edu"],
    scimEnabled: true,
    enabled: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
  {
    id: SSO_PROVIDER.northbridgeOidc,
    tenantId: TENANT.northbridge,
    institutionId: INSTITUTION.northbridge,
    protocol: "oidc",
    name: "Northbridge NetID",
    issuerUrl: "https://login.northbridge.example.edu",
    clientId: "nexus-campus",
    domains: ["northbridge.example.edu"],
    scimEnabled: false,
    enabled: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
];
