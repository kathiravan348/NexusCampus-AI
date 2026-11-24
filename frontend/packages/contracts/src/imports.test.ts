import { describe, expect, it } from "vitest";
import {
  ColumnMappingSchema,
  DryRunReportSchema,
  ImportJobInputSchema,
  ImportJobSchema,
  ImportRowIssueSchema,
  type ColumnMapping,
  type DryRunReport,
  type ImportJob,
  type ImportJobInput,
  type ImportRowIssue,
} from "./imports";

const job: ImportJob = {
  id: "import-01",
  tenantId: "tenant-demo",
  entity: "learner",
  fileName: "Learners 2026.xlsx",
  sourceFormat: "xlsx",
  templateVersion: 1,
  status: "completed",
  totalRows: 3,
  validRows: 2,
  errorRows: 1,
  createdByStaffProfileId: "staff-01",
  rollbackUntil: "2026-11-28T09:00:00Z",
  createdAt: "2026-11-20T09:00:00Z",
  updatedAt: "2026-11-21T09:00:00Z",
};

const mapping: ColumnMapping = {
  jobId: job.id,
  columns: [
    { sourceHeader: "First name", target: "person.givenName", transform: "trim" },
    { sourceHeader: "Bus route", target: "custom:busRoute", transform: "upper" },
    { sourceHeader: "Legacy comments", target: null, transform: "none" },
    { sourceHeader: "Legacy reference", target: null, transform: "none" },
  ],
};

const issue: ImportRowIssue = {
  rowNumber: 2,
  column: "First name",
  severity: "error",
  code: "required",
  messageKey: "m09.import.required",
};

const report: DryRunReport = {
  jobId: job.id,
  issues: [issue],
  truncated: false,
  wouldCreate: 1,
  wouldUpdate: 1,
};

describe("ImportJobInputSchema", () => {
  const input: ImportJobInput = {
    entity: "learner",
    fileName: "learners.csv",
    sourceFormat: "csv",
  };

  it("accepts CSV and Excel import job inputs", () => {
    expect(ImportJobInputSchema.parse(input)).toEqual(input);
    const workbook: ImportJobInput = {
      entity: "guardian",
      fileName: "guardians-intake.xlsx",
      sourceFormat: "xlsx",
    };
    expect(ImportJobInputSchema.parse(workbook)).toEqual(workbook);
  });

  it.each([
    ["empty file name", { fileName: "" }],
    ["blank file name", { fileName: "   " }],
    ["current directory marker", { fileName: "." }],
    ["parent directory marker", { fileName: ".." }],
    ["path traversal", { fileName: "../learners.csv" }],
    ["windows path separator", { fileName: "C:\\imports\\learners.csv" }],
    ["control character", { fileName: "bad\nname.csv" }],
    ["overlong file name", { fileName: `${"a".repeat(197)}.csv` }],
    ["unknown format", { sourceFormat: "txt" }],
    ["unknown entity", { entity: "invoice" }],
    ["server-owned id", { id: "imp-1" }],
    ["server-owned tenantId", { tenantId: "ten-demo" }],
    ["server-owned status", { status: "uploaded" }],
    ["raw file contents", { fileContents: "a,b" }],
  ] as const)("rejects invalid input: %s", (_label, patch) => {
    expect(ImportJobInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
});

describe("ImportJobSchema", () => {
  it("accepts a completed learner import with a rollback window", () => {
    expect(ImportJobSchema.parse(job)).toEqual(job);
  });

  it.each([
    { validRows: 3 },
    { totalRows: -1 },
    { fileName: "../learners.xlsx" },
    { fileName: "C:\\imports\\learners.xlsx" },
    { rollbackUntil: null },
    { status: "rolled_back" },
    { updatedAt: "2026-11-19T09:00:00Z" },
    { fileContents: "raw values" },
  ])("rejects invalid import job fields %j", (fields) => {
    expect(ImportJobSchema.safeParse({ ...job, ...fields }).success).toBe(false);
  });
});

describe("ColumnMappingSchema", () => {
  it("accepts field paths, custom keys and multiple skipped columns", () => {
    expect(ColumnMappingSchema.parse(mapping)).toEqual(mapping);
  });

  it.each([
    { target: "custom:busRoute" },
    { target: "person.givenName.first" },
    { target: "custom:BusRoute" },
    { target: "custom:x" },
    { extra: true },
  ])("rejects invalid mapped column fields %j", (fields) => {
    const column = { sourceHeader: "Extra column", target: null, transform: "none", ...fields };
    const columns = [...mapping.columns, column];
    expect(ColumnMappingSchema.safeParse({ ...mapping, columns }).success).toBe(false);
  });

  it("rejects extra mapping fields", () => {
    expect(ColumnMappingSchema.safeParse({ ...mapping, extra: true }).success).toBe(false);
  });
});

describe("DryRunReportSchema", () => {
  it("accepts a report with a localized issue key", () => {
    expect(ImportRowIssueSchema.parse(issue)).toEqual(issue);
    expect(DryRunReportSchema.parse(report)).toEqual(report);
  });

  it.each([
    { messageKey: "Devi Example" },
    { messageKey: "imports.badDate" },
    { value: "Devi Example" },
    { rowNumber: 0 },
    { code: "Missing name" },
  ])("rejects invalid row issue fields %j", (fields) => {
    const issues = [{ ...issue, ...fields }];
    expect(DryRunReportSchema.safeParse({ ...report, issues }).success).toBe(false);
  });

  it("rejects reports with more than 1000 issues or extra fields", () => {
    const issues = Array.from({ length: 1001 }, () => issue);
    expect(DryRunReportSchema.safeParse({ ...report, issues }).success).toBe(false);
    expect(DryRunReportSchema.safeParse({ ...report, extra: true }).success).toBe(false);
  });
});
