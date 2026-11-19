import { describe, expect, it } from "vitest";
import { SessionSchema, SsoProviderSchema, UserSchema } from "./user";

const user = {
  id: "usr_asha",
  tenantId: "ten_riverside_group",
  personId: "per_asha",
  email: "asha.rao@example.edu",
  status: "active",
  mfaEnabled: true,
  passkeyCount: 1,
  ssoOnly: false,
  lastSignInAt: "2026-11-19T04:30:00Z",
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-11-19T04:30:00Z",
};

const session = {
  id: "ses_01",
  tenantId: "ten_riverside_group",
  userId: "usr_asha",
  deviceId: "dev_pixel",
  deviceLabel: "Pixel 8 · Chrome",
  authMethod: "passkey",
  mfaVerified: true,
  ipAddress: "203.0.113.7",
  createdAt: "2026-11-19T04:30:00Z",
  lastSeenAt: "2026-11-19T06:00:00Z",
  expiresAt: "2026-11-26T04:30:00Z",
  revokedAt: null,
};

const sso = {
  id: "sso_riverside",
  tenantId: "ten_riverside_group",
  institutionId: null,
  protocol: "oidc",
  name: "Riverside Google Workspace",
  issuerUrl: "https://accounts.example.com",
  clientId: "riverside-campus",
  domains: ["riverside.example.edu", "staff.riverside.example.edu"],
  scimEnabled: true,
  enabled: true,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-02T00:00:00Z",
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: object[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

const SECRET_KEY = /password|secret|token|hash|private|apikey/i;

describe("identity contracts carry no secrets", () => {
  it("no schema has a password, secret, token, hash or key field", () => {
    for (const schema of [UserSchema, SessionSchema, SsoProviderSchema])
      for (const key of Object.keys(schema.shape)) expect(key).not.toMatch(SECRET_KEY);
  });
});

describe("User", () => {
  it("accepts an active user and a never-signed-in invited user", () => {
    expect(UserSchema.safeParse(user).success).toBe(true);
    expect(
      UserSchema.safeParse({ ...user, status: "invited", passkeyCount: 0, lastSignInAt: null })
        .success,
    ).toBe(true);
  });

  it("rejects bad email, status, counts, times and extra keys", () => {
    rejects(UserSchema, [
      { ...user, email: "asha" },
      { ...user, status: "deleted" },
      { ...user, passkeyCount: -1 },
      { ...user, passkeyCount: 1.5 },
      { ...user, updatedAt: "2026-05-01T00:00:00Z" },
      { ...user, passwordHash: "x" },
    ]);
  });
});

describe("Session", () => {
  it("accepts live, IPv6 and revoked sessions", () => {
    expect(SessionSchema.safeParse(session).success).toBe(true);
    expect(SessionSchema.safeParse({ ...session, ipAddress: "2001:db8::1" }).success).toBe(true);
    expect(
      SessionSchema.safeParse({ ...session, ipAddress: null, revokedAt: "2026-11-19T07:00:00Z" })
        .success,
    ).toBe(true);
  });

  it("rejects invalid time ranges, auth methods, IPs and extra keys", () => {
    rejects(SessionSchema, [
      { ...session, expiresAt: session.createdAt },
      { ...session, expiresAt: "2026-11-18T00:00:00Z" },
      { ...session, lastSeenAt: "2026-11-19T04:00:00Z" },
      { ...session, revokedAt: "2026-11-19T04:00:00Z" },
      { ...session, authMethod: "magic_link" },
      { ...session, ipAddress: "999.1.1.1" },
      { ...session, token: "x" },
    ]);
  });
});

describe("SsoProvider", () => {
  it("accepts OIDC and institution-scoped SAML providers", () => {
    expect(SsoProviderSchema.safeParse(sso).success).toBe(true);
    expect(
      SsoProviderSchema.safeParse({
        ...sso,
        institutionId: "inst_riverside",
        protocol: "saml2",
        issuerUrl: "https://idp.example.org/saml/metadata",
      }).success,
    ).toBe(true);
  });

  it("rejects http issuers, bad domains, secrets and extra keys", () => {
    rejects(SsoProviderSchema, [
      { ...sso, issuerUrl: "http://accounts.example.com" },
      { ...sso, issuerUrl: "accounts.example.com" },
      { ...sso, domains: [] },
      { ...sso, domains: ["Riverside.example.edu"] },
      { ...sso, domains: ["riverside.example.edu", "riverside.example.edu"] },
      { ...sso, domains: ["@riverside.example.edu"] },
      { ...sso, protocol: "ldap" },
      { ...sso, updatedAt: "2026-05-01T00:00:00Z" },
      { ...sso, clientSecret: "x" },
    ]);
  });
});
