import { z } from "zod";
import { EmailSchema, IdSchema, NameSchema, UtcDateTimeSchema } from "../common";
import { hasNoDuplicates } from "./shared";

/** Provider staff roles in Nexus Control (P13). None of them reads institution data without a grant (V-3). */
export const StaffRoleSchema = z.enum([
  "super_admin",
  "sales",
  "billing",
  "support",
  "implementation",
  "release_manager",
  "sre",
  "security_officer",
  "partner",
]);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

/** One of our own staff (or a partner user). Staff identity is separate from any institution identity (D21). */
export const StaffUserSchema = z
  .strictObject({
    id: IdSchema,
    displayName: NameSchema,
    workEmail: EmailSchema,
    roles: z.array(StaffRoleSchema).min(1),
    /** Partner users belong to one partner account (P12). */
    partnerId: IdSchema.nullable(),
    mfaEnrolled: z.boolean(),
    active: z.boolean(),
    lastSignInAt: UtcDateTimeSchema.nullable(),
  })
  .refine((s) => hasNoDuplicates(s.roles), { message: "roles has duplicates", path: ["roles"] })
  .refine((s) => s.roles.includes("partner") === (s.partnerId !== null), {
    message: "partnerId is set iff the user has the partner role",
    path: ["partnerId"],
  });
export type StaffUser = z.infer<typeof StaffUserSchema>;

/** Control permission code `ctl.<area>.<action>`, e.g. `ctl.account.read`. */
export const ControlPermissionSchema = z.string().regex(/^ctl\.[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/, {
  message: "Must look like ctl.account.read",
});
export type ControlPermission = z.infer<typeof ControlPermissionSchema>;

/** The signed-in staff member and what they may do. MFA is mandatory for every staff session (P13). */
export const StaffSessionSchema = z
  .strictObject({
    staff: StaffUserSchema,
    permissions: z.array(ControlPermissionSchema),
    mfaVerified: z.literal(true),
    expiresAt: UtcDateTimeSchema,
  })
  .refine((s) => hasNoDuplicates(s.permissions), {
    message: "permissions has duplicates",
    path: ["permissions"],
  });
export type StaffSession = z.infer<typeof StaffSessionSchema>;
