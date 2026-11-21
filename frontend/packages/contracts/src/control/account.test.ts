import { describe, expect, it } from "vitest";
import {
  AccountContactSchema,
  AccountNoteSchema,
  AccountSchema,
  ContractSchema,
  OpportunitySchema,
} from "./account";
import { rejects } from "./test-utils";

const account = {
  id: "acc_riverside",
  name: "Riverside Education Group",
  institutionType: "grp",
  country: "IN",
  region: "in",
  deliveryModel: "saas_shared",
  stage: "customer",
  ownerStaffId: "stf_arjun",
  partnerId: null,
  tenantIds: ["ten_riverside"],
  learnerCount: 2140,
  healthScore: 82,
  renewalDate: "2027-03-31",
  createdAt: "2025-04-01T05:30:00Z",
};

describe("Account", () => {
  it("accepts SaaS and self-hosted accounts", () => {
    expect(AccountSchema.safeParse(account).success).toBe(true);
    expect(
      AccountSchema.safeParse({ ...account, deliveryModel: "self_hosted", tenantIds: [] }).success,
    ).toBe(true);
  });

  it("rejects bad scores, duplicate tenants, tenants on self-hosted and extra fields", () => {
    rejects(AccountSchema, [
      { ...account, healthScore: 101 },
      { ...account, learnerCount: -1 },
      { ...account, tenantIds: ["ten_a", "ten_a"] },
      { ...account, deliveryModel: "self_hosted" },
      { ...account, region: "mars" },
      { ...account, learners: [{ name: "x" }] },
    ]);
  });
});

describe("AccountContact, Opportunity, AccountNote", () => {
  const contact = {
    id: "con_1",
    accountId: "acc_riverside",
    name: "Kavita Rao",
    workEmail: "accounts@riverside.example",
    phone: "+919876543210",
    kind: "billing",
  };
  const opportunity = {
    id: "opp_1",
    accountId: "acc_riverside",
    title: "Add second campus",
    stage: "proposal",
    valueMinor: 45000000,
    currency: "INR",
    closeDate: "2026-12-15",
    ownerStaffId: "stf_arjun",
  };
  const note = {
    id: "note_1",
    accountId: "acc_riverside",
    authorStaffId: "stf_arjun",
    body: "Wants a demo of the AI tutor.",
    createdAt: "2026-11-02T10:00:00Z",
  };

  it("accepts valid rows", () => {
    expect(AccountContactSchema.safeParse(contact).success).toBe(true);
    expect(OpportunitySchema.safeParse(opportunity).success).toBe(true);
    expect(AccountNoteSchema.safeParse(note).success).toBe(true);
  });

  it("rejects bad phones, kinds, values and empty notes", () => {
    rejects(AccountContactSchema, [
      { ...contact, phone: "98765" },
      { ...contact, kind: "parent" },
    ]);
    rejects(OpportunitySchema, [
      { ...opportunity, valueMinor: -5 },
      { ...opportunity, stage: "maybe" },
    ]);
    rejects(AccountNoteSchema, [
      { ...note, body: "  " },
      { ...note, body: "x".repeat(2001) },
    ]);
  });
});

describe("Contract", () => {
  const contract = {
    id: "ctr_1",
    accountId: "acc_riverside",
    kind: "saas_subscription",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
    autoRenew: true,
    valueMinor: 128400000,
    currency: "INR",
    slaTier: "priority",
    status: "active",
  };

  it("accepts a term contract and a perpetual licence", () => {
    expect(ContractSchema.safeParse(contract).success).toBe(true);
    expect(
      ContractSchema.safeParse({ ...contract, kind: "licence_perpetual", endDate: null }).success,
    ).toBe(true);
  });

  it("rejects an open end on a term contract, an end on a perpetual one, and end before start", () => {
    rejects(ContractSchema, [
      { ...contract, endDate: null },
      { ...contract, kind: "licence_perpetual" },
      { ...contract, endDate: "2026-03-31" },
    ]);
  });
});
