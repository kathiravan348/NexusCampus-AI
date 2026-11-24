import { z } from "zod";
import { IdSchema, UtcDateTimeSchema } from "./common";
import { CustomFieldKeySchema } from "./forms";

export const ImportEntitySchema = z.enum([
  "learner",
  "guardian",
  "staff",
  "enrolment",
  "fee_balance",
  "mark",
]);
export type ImportEntity = z.infer<typeof ImportEntitySchema>;

export const ImportSourceFormatSchema = z.enum(["csv", "xlsx"]);
export type ImportSourceFormat = z.infer<typeof ImportSourceFormatSchema>;

export const ImportJobStatusSchema = z.enum([
  "uploaded",
  "mapped",
  "dry_run_ready",
  "importing",
  "completed",
  "failed",
  "rolled_back",
]);
export type ImportJobStatus = z.infer<typeof ImportJobStatusSchema>;

export const ImportJobSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    entity: ImportEntitySchema,
    fileName: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (name) => {
          const trimmed = name.trim();
          return (
            trimmed.length > 0 &&
            trimmed !== "." &&
            trimmed !== ".." &&
            !/[/:\\]/.test(name) &&
            [...name].every((character) => character.charCodeAt(0) >= 32)
          );
        },
        { message: "fileName must be a plain file name" },
      ),
    sourceFormat: ImportSourceFormatSchema,
    templateVersion: z.int().min(1),
    status: ImportJobStatusSchema,
    totalRows: z.int().nonnegative(),
    validRows: z.int().nonnegative(),
    errorRows: z.int().nonnegative(),
    createdByStaffProfileId: IdSchema,
    rollbackUntil: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((job) => job.validRows + job.errorRows <= job.totalRows, {
    message: "Valid and error rows cannot exceed total rows",
    path: ["totalRows"],
  })
  .refine((job) => (job.rollbackUntil !== null) === (job.status === "completed"), {
    message: "rollbackUntil is set exactly when the import is completed",
    path: ["rollbackUntil"],
  })
  .refine((job) => Date.parse(job.updatedAt) >= Date.parse(job.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type ImportJob = z.infer<typeof ImportJobSchema>;

export const ImportTransformSchema = z.enum([
  "none",
  "trim",
  "upper",
  "lower",
  "date_dmy",
  "date_mdy",
  "phone_in",
  "split_name",
]);
export type ImportTransform = z.infer<typeof ImportTransformSchema>;

const FIELD_PATH = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)?$/;
const CUSTOM_PREFIX = "custom:";
const MappingTargetSchema = z
  .string()
  .refine(
    (value) =>
      FIELD_PATH.test(value) ||
      (value.startsWith(CUSTOM_PREFIX) &&
        CustomFieldKeySchema.safeParse(value.slice(CUSTOM_PREFIX.length)).success),
    { message: "Target must be a field path or a custom field key prefixed with custom:" },
  );

const MappedColumnSchema = z.strictObject({
  sourceHeader: z.string().min(1).max(120),
  /** Null skips the source column. */
  target: MappingTargetSchema.nullable(),
  transform: ImportTransformSchema,
});

export const ColumnMappingSchema = z
  .strictObject({
    jobId: IdSchema,
    columns: z.array(MappedColumnSchema).min(1).max(200),
  })
  .refine(
    ({ columns }) => {
      const targets = columns.map(({ target }) => target).filter((target) => target !== null);
      return new Set(targets).size === targets.length;
    },
    { message: "Mapping targets must be unique", path: ["columns"] },
  );
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export const ImportRowIssueSeveritySchema = z.enum(["error", "warning"]);
export type ImportRowIssueSeverity = z.infer<typeof ImportRowIssueSeveritySchema>;

export const ImportRowIssueSchema = z.strictObject({
  rowNumber: z.int().min(1),
  column: z.string().min(1).max(120).nullable(),
  severity: ImportRowIssueSeveritySchema,
  code: z.string().regex(/^[a-z_]{3,40}$/),
  /** Localized message key. Keep imported cell values out of issues (V-7). */
  messageKey: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/),
});
export type ImportRowIssue = z.infer<typeof ImportRowIssueSchema>;

export const DryRunReportSchema = z.strictObject({
  jobId: IdSchema,
  issues: z.array(ImportRowIssueSchema).max(1000),
  truncated: z.boolean(),
  wouldCreate: z.int().nonnegative(),
  wouldUpdate: z.int().nonnegative(),
});
export type DryRunReport = z.infer<typeof DryRunReportSchema>;
