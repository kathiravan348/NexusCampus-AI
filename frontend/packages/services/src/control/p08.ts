import {
  ExtensionCompatibilitySchema,
  ExtensionSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { useControlQuery } from "./hooks";

export const ExtensionPageSchema = pageSchema(ExtensionSchema);
export const CompatibilityPageSchema = pageSchema(ExtensionCompatibilitySchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

/** Per-customer extension packages (P08, D20). */
export function useExtensions() {
  return useControlQuery("/extensions", ExtensionPageSchema, ALL);
}

/** Compatibility of each extension with upcoming releases. */
export function useCompatibility() {
  return useControlQuery("/extension-compatibility", CompatibilityPageSchema, ALL);
}
