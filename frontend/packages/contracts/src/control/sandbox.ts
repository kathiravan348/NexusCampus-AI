import { z } from "zod";
import { IdSchema, InstitutionTypeSchema, RegionSchema, UtcDateTimeSchema } from "../common";
import { SemverSchema } from "./shared";

/** A self-expiring sales demo or a staging clone for release and extension testing (P17). */
export const SandboxSchema = z
  .strictObject({
    id: IdSchema,
    kind: z.enum(["sales_demo", "staging_clone"]),
    /** Null for a sales demo that is not yet tied to a customer. */
    accountId: IdSchema.nullable(),
    institutionType: InstitutionTypeSchema,
    region: RegionSchema,
    /** Demos use synthetic data; staging clones are masked copies the customer approved (never raw data). */
    dataKind: z.enum(["synthetic", "masked"]),
    version: SemverSchema,
    status: z.enum(["creating", "ready", "expired", "deleted"]),
    createdAt: UtcDateTimeSchema,
    expiresAt: UtcDateTimeSchema,
  })
  .refine((s) => s.kind !== "sales_demo" || s.dataKind === "synthetic", {
    message: "a sales demo uses synthetic data only",
    path: ["dataKind"],
  })
  .refine((s) => s.kind !== "staging_clone" || s.accountId !== null, {
    message: "a staging clone belongs to an account",
    path: ["accountId"],
  })
  .refine((s) => Date.parse(s.expiresAt) > Date.parse(s.createdAt), {
    message: "expiresAt must be after createdAt",
    path: ["expiresAt"],
  });
export type Sandbox = z.infer<typeof SandboxSchema>;
