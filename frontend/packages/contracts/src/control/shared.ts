import { z } from "zod";

/** Helpers shared by the Nexus Control contracts (Stage 2, D50). */
export const hasNoDuplicates = (values: readonly unknown[]) =>
  new Set(values).size === values.length;
export const notBefore = (from: string, to: string) => Date.parse(to) >= Date.parse(from);

/** A short lower-case code, e.g. `standard` or `ai-pack-10k`. */
export const ControlCodeSchema = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, {
  message: "Must be a lower-case slug, e.g. standard or ai-pack-10k",
});

/** Human-readable document number, e.g. `INV-2026-00042`. */
export const DocumentNumberSchema = z.string().regex(/^[A-Z]{2,5}-\d{4}-\d{3,6}$/, {
  message: "Must look like INV-2026-00042",
});

/** Line totals add up to the subtotal, and subtotal + tax to the total (money in minor units). */
export const totalsMatch = (doc: {
  readonly lines: readonly { readonly amountMinor: number }[];
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
}) =>
  doc.lines.reduce((sum, l) => sum + l.amountMinor, 0) === doc.subtotalMinor &&
  doc.subtotalMinor + doc.taxMinor === doc.totalMinor;
