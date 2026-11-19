import { describe, expect, it } from "vitest";
import { ApiErrorSchema } from "./error";

describe("ApiError", () => {
  it("accepts a minimal error and one with details and requestId", () => {
    expect(
      ApiErrorSchema.safeParse({ error: { code: "not_found", message: "Campus not found" } })
        .success,
    ).toBe(true);
    expect(
      ApiErrorSchema.safeParse({
        error: {
          code: "invalid_request",
          message: "Some fields are invalid",
          details: [{ path: "locale.timeZone", message: "Must be an IANA time zone" }],
          requestId: "req_8f2a",
        },
      }).success,
    ).toBe(true);
  });

  it("accepts every platform code", () => {
    for (const code of [
      "unauthorized",
      "forbidden",
      "conflict",
      "module_disabled",
      "rate_limited",
      "internal",
    ]) {
      expect(ApiErrorSchema.safeParse({ error: { code, message: "x" } }).success, code).toBe(true);
    }
  });

  it("rejects unknown codes, empty messages and extra keys", () => {
    expect(ApiErrorSchema.safeParse({ error: { code: "bad_request", message: "x" } }).success).toBe(
      false,
    );
    expect(ApiErrorSchema.safeParse({ error: { code: "internal", message: "" } }).success).toBe(
      false,
    );
    expect(
      ApiErrorSchema.safeParse({ error: { code: "internal", message: "x", stack: "…" } }).success,
    ).toBe(false);
    expect(
      ApiErrorSchema.safeParse({ error: { code: "internal", message: "x" }, status: 500 }).success,
    ).toBe(false);
  });
});
