import { z } from "zod";
import { IdSchema, LocaleSchema, NameSchema, UtcDateTimeSchema } from "./common";

/** Key of a custom field or choice option, e.g. `bloodGroup` (NEX-148 / NEX-149 records carry values by key). */
export const CustomFieldKeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]{1,39}$/);
const FieldKeySchema = CustomFieldKeySchema;
const timestamps = { createdAt: UtcDateTimeSchema, updatedAt: UtcDateTimeSchema };
const timestampIssue = {
  message: "updatedAt must be on or after createdAt",
  path: ["updatedAt"],
};

function timestampsInOrder({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) {
  return Date.parse(updatedAt) >= Date.parse(createdAt);
}

function hasUniqueValues(values: readonly string[]) {
  return new Set(values).size === values.length;
}

export const ConfigEntitySchema = z.enum([
  "learner",
  "guardian",
  "staff",
  "enquiry",
  "application",
]);
export type ConfigEntity = z.infer<typeof ConfigEntitySchema>;

/** The server checks that the institution's default locale is present. */
export const LocalizedLabelSchema = z
  .record(LocaleSchema, z.string().trim().min(1).max(120))
  .refine((labels) => Object.keys(labels).length > 0, {
    message: "At least one label is required",
  });
export type LocalizedLabel = z.infer<typeof LocalizedLabelSchema>;

export const CustomFieldTypeSchema = z.enum([
  "text",
  "long_text",
  "number",
  "date",
  "choice",
  "multi_choice",
  "boolean",
  "email",
  "phone",
]);
export type CustomFieldType = z.infer<typeof CustomFieldTypeSchema>;

const FieldOptionSchema = z.strictObject({ value: FieldKeySchema, label: LocalizedLabelSchema });

export const CustomFieldDefinitionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    entity: ConfigEntitySchema,
    key: FieldKeySchema,
    label: LocalizedLabelSchema,
    type: CustomFieldTypeSchema,
    required: z.boolean(),
    /** Sensitive values are personal data. Keep them out of logs and require consent for exports. */
    sensitive: z.boolean(),
    options: z
      .array(FieldOptionSchema)
      .min(1)
      .max(100)
      .refine((options) => hasUniqueValues(options.map((option) => option.value)), {
        message: "Option values must be unique",
      })
      .optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    order: z.int().nonnegative(),
    archived: z.boolean(),
    ...timestamps,
  })
  .refine((field) => (field.options !== undefined) === fieldUsesOptions(field.type), {
    message: "Options are required for choice fields and only allowed on those fields",
    path: ["options"],
  })
  .refine(
    (field) => field.type === "number" || (field.min === undefined && field.max === undefined),
    {
      message: "Only number fields can have min or max",
      path: ["type"],
    },
  )
  .refine((field) => field.min === undefined || field.max === undefined || field.min <= field.max, {
    message: "max must be greater than or equal to min",
    path: ["max"],
  })
  .refine(timestampsInOrder, timestampIssue);
export type CustomFieldDefinition = z.infer<typeof CustomFieldDefinitionSchema>;

function fieldUsesOptions(type: CustomFieldType) {
  return type === "choice" || type === "multi_choice";
}

/** The server validates keys and values against the institution's field definitions. */
export const CustomFieldValuesSchema = z.record(
  FieldKeySchema,
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
);
export type CustomFieldValues = z.infer<typeof CustomFieldValuesSchema>;

export const FormDefinitionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    entity: ConfigEntitySchema,
    name: NameSchema,
    fieldKeys: z.array(FieldKeySchema).min(1).max(80).refine(hasUniqueValues, {
      message: "Field keys must be unique",
    }),
    public: z.boolean(),
    published: z.boolean(),
    ...timestamps,
  })
  .refine((form) => !form.public || form.entity === "enquiry" || form.entity === "application", {
    message: "Only enquiry and application forms can be public",
    path: ["public"],
  })
  .refine(timestampsInOrder, timestampIssue);
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;

export const WorkflowSubjectSchema = z.enum([
  "application",
  "leave_request",
  "document_request",
  "fee_concession",
  "record_change",
]);
export type WorkflowSubject = z.infer<typeof WorkflowSubjectSchema>;

const WorkflowStepSchema = z
  .strictObject({
    id: IdSchema,
    approverRoleId: IdSchema,
    slaHours: z.int().min(1).max(720).nullable(),
    escalateToRoleId: IdSchema.nullable(),
  })
  .refine((step) => step.escalateToRoleId !== step.approverRoleId, {
    message: "The escalation role must differ from the approver role",
    path: ["escalateToRoleId"],
  });

export const WorkflowDefinitionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    subject: WorkflowSubjectSchema,
    name: NameSchema,
    steps: z
      .array(WorkflowStepSchema)
      .min(1)
      .max(10)
      .refine((steps) => hasUniqueValues(steps.map((step) => step.id)), {
        message: "Step ids must be unique",
      }),
    active: z.boolean(),
    ...timestamps,
  })
  .refine(timestampsInOrder, timestampIssue);
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// Only literal characters and date/campus tokens may surround the single sequence token.
const NUMBERING_PATTERN =
  /^(?:[A-Za-z0-9/_-]|\{(?:YYYY|YY|CAMPUS)\})*\{SEQ:[1-9]\}(?:[A-Za-z0-9/_-]|\{(?:YYYY|YY|CAMPUS)\})*$/;

export const NumberingSubjectSchema = z.enum([
  "learner",
  "application",
  "receipt",
  "invoice",
  "certificate",
]);
export type NumberingSubject = z.infer<typeof NumberingSubjectSchema>;

export const NumberingFormatSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  subject: NumberingSubjectSchema,
  pattern: z.string().max(60).regex(NUMBERING_PATTERN, {
    message: "Use letters, digits, /, _, -, date or campus tokens, and exactly one {SEQ:1–9}",
  }),
  resetsYearly: z.boolean(),
  nextSequence: z.int().min(1),
  updatedAt: UtcDateTimeSchema,
});
export type NumberingFormat = z.infer<typeof NumberingFormatSchema>;
