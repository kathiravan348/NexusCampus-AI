import { describe, expect, it } from "vitest";
import { UsageRecordSchema } from "./usage";
import { rejects } from "./test-utils";

const record = {
  id: "use_1",
  accountId: "acc_apex",
  deploymentId: null,
  tenantId: "ten_apex",
  metric: "ai_credits",
  periodStart: "2026-11-01T00:00:00Z",
  periodEnd: "2026-12-01T00:00:00Z",
  quantity: 4750,
  cap: 5000,
};

describe("UsageRecord", () => {
  it("accepts tenant and install usage, with or without a cap", () => {
    expect(UsageRecordSchema.safeParse(record).success).toBe(true);
    expect(
      UsageRecordSchema.safeParse({ ...record, tenantId: null, deploymentId: "dep_1", cap: null })
        .success,
    ).toBe(true);
  });

  it("rejects orphan records, reversed periods and negative counts", () => {
    rejects(UsageRecordSchema, [
      { ...record, tenantId: null },
      { ...record, periodEnd: record.periodStart },
      { ...record, quantity: -1 },
      { ...record, metric: "learner_names" },
    ]);
  });
});
