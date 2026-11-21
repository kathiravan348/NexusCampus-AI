import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LicenceFileSchema } from "./licence";

/** The backend signs licences (NEX-095); its fixed test vector must fit this contract exactly. */
const VECTOR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../backend/tests/licensing/vector.json",
);

describe("licence file test vector (backend ⇄ contract)", () => {
  it("parses with LicenceFileSchema and keeps every field", () => {
    const vector = JSON.parse(readFileSync(VECTOR, "utf-8")) as { file: unknown };
    const file = LicenceFileSchema.parse(vector.file);
    expect(file).toEqual(vector.file);
    expect(file.payload.signingKeyId).toBe("nexus-licence:v1");
  });
});
