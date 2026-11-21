import { z } from "zod";
import { IdSchema, NameSchema, UtcDateTimeSchema } from "../common";
import { ControlCodeSchema, SemverSchema } from "./shared";

/**
 * A per-customer extension package built on the extension SDK (P08, DM-5). Customer-specific work lives here,
 * never in a fork of the core (D20).
 */
export const ExtensionSchema = z.strictObject({
  id: IdSchema,
  accountId: IdSchema,
  code: ControlCodeSchema,
  name: NameSchema,
  version: SemverSchema,
  signed: z.boolean(),
  builtAt: UtcDateTimeSchema,
});
export type Extension = z.infer<typeof ExtensionSchema>;

export const CompatibilityResultSchema = z.enum(["compatible", "warning", "incompatible"]);
export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;

/** Result of checking one extension against one release (P08 impact check; may be drafted by AI). */
export const ExtensionCompatibilitySchema = z
  .strictObject({
    extensionId: IdSchema,
    releaseVersion: SemverSchema,
    result: CompatibilityResultSchema,
    notes: z.string().max(2000),
    aiDrafted: z.boolean(),
    checkedAt: UtcDateTimeSchema,
  })
  .refine((c) => c.result === "compatible" || c.notes.trim().length > 0, {
    message: "a warning or incompatibility needs notes",
    path: ["notes"],
  });
export type ExtensionCompatibility = z.infer<typeof ExtensionCompatibilitySchema>;
