import { describe, expect, it } from "vitest";
import {
  CustomFieldDefinitionSchema,
  CustomFieldKeySchema,
  CustomFieldInputSchema,
  NumberingSubjectSchema,
  WorkflowSubjectSchema,
  CustomFieldValuesSchema,
  FormDefinitionSchema,
  LocalizedLabelSchema,
  NumberingFormatSchema,
  WorkflowDefinitionSchema,
} from "./index";

const tenantId = "tenant-demo";
const createdAt = "2026-11-23T08:00:00Z";
const updatedAt = "2026-11-23T08:00:01Z";
const label = { "en-IN": "Preferred contact" };
const option = { value: "phone", label: { "en-IN": "Phone" } };

const field = {
  id: "field-contact",
  tenantId,
  entity: "guardian",
  key: "preferredContact",
  label,
  type: "choice",
  required: true,
  sensitive: true,
  options: [option],
  order: 0,
  archived: false,
  createdAt,
  updatedAt,
};

const form = {
  id: "form-application",
  tenantId,
  entity: "application",
  name: "Application",
  fieldKeys: ["preferredContact", "contactName"],
  public: true,
  published: true,
  createdAt,
  updatedAt,
};

const step = {
  id: "step-one",
  approverRoleId: "role-finance",
  slaHours: 24,
  escalateToRoleId: "role-owner",
};
const workflow = {
  id: "workflow-concession",
  tenantId,
  subject: "fee_concession",
  name: "Fee concession",
  steps: [
    step,
    { id: "step-two", approverRoleId: "role-owner", slaHours: null, escalateToRoleId: null },
  ],
  active: true,
  createdAt,
  updatedAt,
};

const numbering = {
  id: "numbering-application",
  tenantId,
  subject: "application",
  pattern: "ADM/{YYYY}/{SEQ:5}",
  resetsYearly: true,
  nextSequence: 1,
  updatedAt,
};

describe("localized labels", () => {
  it("trims labels and accepts canonical locales", () => {
    expect(LocalizedLabelSchema.parse({ "en-IN": "  Phone  ", ta: "தொலைபேசி" })).toEqual({
      "en-IN": "Phone",
      ta: "தொலைபேசி",
    });
  });

  it.each([{}, { "en-in": "Phone" }, { en: " " }, { en: "a".repeat(121) }])(
    "rejects invalid labels %j",
    (labels) => expect(LocalizedLabelSchema.safeParse(labels).success).toBe(false),
  );
});

describe("custom field definitions", () => {
  it("accepts a sensitive guardian choice and a multi-choice field", () => {
    expect(CustomFieldDefinitionSchema.parse(field)).toEqual(field);
    expect(CustomFieldDefinitionSchema.safeParse({ ...field, type: "multi_choice" }).success).toBe(
      true,
    );
  });

  it("accepts independently optional number bounds", () => {
    const numeric = { ...field, type: "number", options: undefined };
    expect(CustomFieldDefinitionSchema.safeParse({ ...numeric, max: 0 }).success).toBe(true);
    expect(CustomFieldDefinitionSchema.safeParse({ ...numeric, min: -1, max: -1 }).success).toBe(
      true,
    );
  });

  it.each([
    { type: "text" },
    { options: undefined },
    { options: [] },
    { options: [option, option] },
    { options: [{ ...option, value: "Invalid" }] },
    { options: [{ ...option, extra: true }] },
    { options: Array.from({ length: 101 }, (_, index) => ({ ...option, value: `opt${index}` })) },
    { min: 0 },
    { type: "number", options: undefined, min: 2, max: 1 },
    { entity: "person" },
    { key: "a" },
    { key: "a".repeat(41) },
    { order: -1 },
    { extra: true },
  ])("rejects invalid field attributes %j", (attrs) => {
    expect(CustomFieldDefinitionSchema.safeParse({ ...field, ...attrs }).success).toBe(false);
  });
});

describe("custom field inputs", () => {
  const input = {
    entity: field.entity,
    key: field.key,
    label,
    type: "choice",
    required: true,
    sensitive: false,
    order: 2,
    options: [option],
  };

  it("accepts writable attributes and rejects server-owned attributes", () => {
    expect(CustomFieldInputSchema.parse(input)).toEqual(input);
    for (const key of ["tenantId", "id", "archived", "createdAt", "updatedAt"]) {
      expect(
        CustomFieldInputSchema.safeParse({ ...input, [key]: field[key as keyof typeof field] })
          .success,
      ).toBe(false);
    }
  });

  it("applies the definition's choice and numeric refinements to writes", () => {
    expect(CustomFieldInputSchema.safeParse({ ...input, type: "text" }).success).toBe(false);
    expect(CustomFieldInputSchema.safeParse({ ...input, options: undefined }).success).toBe(false);
    expect(CustomFieldInputSchema.safeParse({ ...input, min: 1 }).success).toBe(false);
    expect(
      CustomFieldInputSchema.safeParse({
        ...input,
        type: "number",
        options: undefined,
        min: 2,
        max: 1,
      }).success,
    ).toBe(false);
  });
});

describe("custom field values", () => {
  it("accepts empty records and all supported value types", () => {
    const values = {
      text: "sample",
      count: 0,
      agreed: false,
      selections: ["phone"],
      missing: null,
    };
    expect(CustomFieldValuesSchema.parse({})).toEqual({});
    expect(CustomFieldValuesSchema.parse(values)).toEqual(values);
  });

  it.each([{ "bad-key": null }, { data: {} }, { selections: [1] }])("rejects %j", (values) => {
    expect(CustomFieldValuesSchema.safeParse(values).success).toBe(false);
  });
});

describe("form definitions", () => {
  it("preserves field order on a public application form", () => {
    expect(FormDefinitionSchema.parse(form)).toEqual(form);
    expect(FormDefinitionSchema.safeParse({ ...form, entity: "enquiry" }).success).toBe(true);
    expect(
      FormDefinitionSchema.safeParse({ ...form, entity: "staff", public: false }).success,
    ).toBe(true);
  });

  it.each([
    { entity: "staff" },
    { fieldKeys: [] },
    { fieldKeys: ["contactName", "contactName"] },
    { fieldKeys: ["bad-key"] },
    { fieldKeys: Array.from({ length: 81 }, (_, index) => `field${index}`) },
    { extra: true },
  ])("rejects invalid form attributes %j", (attrs) => {
    expect(FormDefinitionSchema.safeParse({ ...form, ...attrs }).success).toBe(false);
  });
});

describe("workflow definitions", () => {
  it("accepts a two-step concession workflow", () => {
    expect(WorkflowDefinitionSchema.parse(workflow)).toEqual(workflow);
  });

  it.each(
    [
      [],
      [step, step],
      [{ ...step, escalateToRoleId: step.approverRoleId }],
      [{ ...step, slaHours: 0 }],
      [{ ...step, slaHours: 721 }],
      [{ ...step, slaHours: 1.5 }],
      [{ ...step, extra: true }],
      Array.from({ length: 11 }, (_, index) => ({ ...step, id: `step-${index}` })),
    ].map((steps) => ({ steps })),
  )("rejects invalid steps %j", ({ steps }) => {
    expect(WorkflowDefinitionSchema.safeParse({ ...workflow, steps }).success).toBe(false);
  });

  it("rejects extra workflow keys", () => {
    expect(WorkflowDefinitionSchema.safeParse({ ...workflow, extra: true }).success).toBe(false);
  });
});

describe("record timestamps", () => {
  it.each([
    { schema: CustomFieldDefinitionSchema, record: field },
    { schema: FormDefinitionSchema, record: form },
    { schema: WorkflowDefinitionSchema, record: workflow },
  ])("compares timestamps as instants for $record.id", ({ schema, record }) => {
    expect(
      schema.safeParse({ ...record, updatedAt: createdAt.replace("Z", ".000Z") }).success,
    ).toBe(true);
    expect(schema.safeParse({ ...record, updatedAt: "2026-11-23T07:59:59.999Z" }).success).toBe(
      false,
    );
  });
});

describe("numbering formats", () => {
  it.each(["ADM/{YYYY}/{SEQ:5}", "{SEQ:1}_{YY}-{CAMPUS}/A9", `${"a".repeat(53)}{SEQ:9}`])(
    "accepts %s",
    (pattern) =>
      expect(NumberingFormatSchema.parse({ ...numbering, pattern }).pattern).toBe(pattern),
  );

  it.each([
    "ADM/{YYYY}",
    "{SEQ:1}/{SEQ:9}",
    "{SEQ:0}",
    "{SEQ:10}",
    "{SEQ:1}/{YEAR}",
    "ADM {SEQ:1}",
    "{SEQ:1}\n",
    `${"a".repeat(54)}{SEQ:9}`,
  ])("rejects %j", (pattern) => {
    expect(NumberingFormatSchema.safeParse({ ...numbering, pattern }).success).toBe(false);
  });

  it.each([{ nextSequence: 0 }, { nextSequence: 1.5 }, { extra: true }])(
    "rejects invalid numbering attributes %j",
    (attrs) =>
      expect(NumberingFormatSchema.safeParse({ ...numbering, ...attrs }).success).toBe(false),
  );
});

describe("shared M08 enums and keys", () => {
  it("exports the field key format and the workflow and numbering subjects", () => {
    expect(CustomFieldKeySchema.safeParse("bloodGroup").success).toBe(true);
    expect(CustomFieldKeySchema.safeParse("Blood group").success).toBe(false);
    expect(WorkflowSubjectSchema.options).toContain("fee_concession");
    expect(NumberingSubjectSchema.options).toContain("receipt");
  });
});
