import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as install from "../install";
import * as control from "./index";

/**
 * V-7 guard (D50): Nexus Control stores only commercial and technical metadata. No control contract may carry a
 * field about an institution's learners, families or staff. Counts (`learnerCount`, `learners`, `learnersUsed`,
 * `learnerCap`) are allowed.
 */
const BANNED = [
  /^(student|guardian|parent|pupil|child|family)/i,
  /^learner(?!Count$|s$|Cap$|sUsed$)/i,
  /birth|^dob$/i,
  /address/i,
  /medical|diagnos|allerg|safeguard/i,
  /aadhaar|passport|nationalId|ssn/i,
];

function fieldNames(schema: z.ZodType, prefix = ""): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape as Record<string, z.ZodType>).flatMap(([key, value]) => [
      `${prefix}${key}`,
      ...fieldNames(value, `${prefix}${key}.`),
    ]);
  }
  if (schema instanceof z.ZodArray) return fieldNames(schema.element as z.ZodType, prefix);
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return fieldNames(schema.unwrap() as z.ZodType, prefix);
  }
  return [];
}

function personalFields(schema: z.ZodType): string[] {
  return fieldNames(schema).filter((path) => {
    const leaf = path.split(".").at(-1) ?? path;
    return BANNED.some((re) => re.test(leaf));
  });
}

const schemas: [string, z.ZodType][] = Object.entries({ ...control, ...install } as Record<
  string,
  unknown
>).flatMap(([name, value]) =>
  name.endsWith("Schema") && value instanceof z.ZodType ? [[name, value]] : [],
);

describe("Nexus Control contracts carry metadata only (V-7)", () => {
  it("finds the control schemas", () => {
    expect(schemas.length).toBeGreaterThan(20);
  });

  it.each(schemas)("%s has no institution-people fields", (_name, schema) => {
    expect(personalFields(schema)).toEqual([]);
  });

  it("flags a schema that would carry a learner's details", () => {
    const leaky = z.strictObject({
      accountId: z.string(),
      learnerCount: z.int(),
      rows: z.array(z.strictObject({ studentName: z.string(), dateOfBirth: z.string() })),
      contact: z.strictObject({ homeAddress: z.string() }).nullable(),
    });
    expect(personalFields(leaky)).toEqual([
      "rows.studentName",
      "rows.dateOfBirth",
      "contact.homeAddress",
    ]);
  });
});
