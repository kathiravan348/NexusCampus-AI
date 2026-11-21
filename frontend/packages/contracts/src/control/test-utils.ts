import { expect } from "vitest";

/** Test helper: every case must fail to parse. */
export const rejects = (
  schema: { safeParse: (v: unknown) => { success: boolean } },
  cases: readonly unknown[],
) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};
