import { z } from "zod";
import { EmailSchema, IdSchema, NameSchema, UtcDateTimeSchema } from "./common";

/* Identity contracts carry no passwords, secrets, tokens or key material — only metadata (E-1). */

const notBefore = (from: string, to: string) => Date.parse(to) >= Date.parse(from);
const after = (from: string, to: string) => Date.parse(to) > Date.parse(from);
const hasNoDuplicates = (values: readonly unknown[]) => new Set(values).size === values.length;

export const UserStatusSchema = z.enum(["invited", "active", "suspended", "locked"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** A sign-in account of a `Person`. `ssoOnly` = password sign-in is disabled. */
export const UserSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    personId: IdSchema,
    email: EmailSchema,
    status: UserStatusSchema,
    mfaEnabled: z.boolean(),
    passkeyCount: z.int().min(0),
    ssoOnly: z.boolean(),
    lastSignInAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((u) => notBefore(u.createdAt, u.updatedAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type User = z.infer<typeof UserSchema>;

export const AuthMethodSchema = z.enum(["password", "sso", "passkey"]);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

/** A signed-in device session, as listed to its user or an admin. Never carries the session token. */
export const SessionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    userId: IdSchema,
    deviceId: IdSchema,
    deviceLabel: NameSchema,
    authMethod: AuthMethodSchema,
    mfaVerified: z.boolean(),
    ipAddress: z.union([z.ipv4(), z.ipv6()]).nullable(),
    createdAt: UtcDateTimeSchema,
    lastSeenAt: UtcDateTimeSchema,
    expiresAt: UtcDateTimeSchema,
    revokedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((s) => notBefore(s.createdAt, s.lastSeenAt), {
    message: "lastSeenAt is before createdAt",
    path: ["lastSeenAt"],
  })
  .refine((s) => after(s.createdAt, s.expiresAt), {
    message: "expiresAt must be after createdAt",
    path: ["expiresAt"],
  })
  .refine((s) => s.revokedAt === null || notBefore(s.createdAt, s.revokedAt), {
    message: "revokedAt is before createdAt",
    path: ["revokedAt"],
  });
export type Session = z.infer<typeof SessionSchema>;

export const SsoProtocolSchema = z.enum(["oidc", "saml2"]);
export type SsoProtocol = z.infer<typeof SsoProtocolSchema>;

/** Lower-case DNS domain such as `riverside.example.edu`. */
const DomainSchema = z
  .string()
  .max(253)
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, {
    message: "Must be a lower-case domain, e.g. riverside.example.edu",
  });

/**
 * An SSO identity provider (OIDC or SAML 2) for the tenant or one institution (`institutionId` null =
 * tenant-wide). Client secrets and signing keys stay in the vault and are never part of this contract.
 */
export const SsoProviderSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema.nullable(),
    protocol: SsoProtocolSchema,
    name: NameSchema,
    issuerUrl: z.url({ protocol: /^https$/ }),
    clientId: z.string().trim().min(1).max(256),
    domains: z.array(DomainSchema).min(1),
    scimEnabled: z.boolean(),
    enabled: z.boolean(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((p) => p.issuerUrl.startsWith("https://"), {
    message: "issuerUrl must use https://",
    path: ["issuerUrl"],
  })
  .refine((p) => hasNoDuplicates(p.domains), {
    message: "domains has duplicates",
    path: ["domains"],
  })
  .refine((p) => notBefore(p.createdAt, p.updatedAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type SsoProvider = z.infer<typeof SsoProviderSchema>;
