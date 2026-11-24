import { describe, expect, it } from "vitest";
import { IssuedDocumentSchema, ReportCardSchema } from "./index";

const tenantId = "tenant-school";
const learnerId = "learner-01";

const report = {
  id: "report-01",
  tenantId,
  learnerId,
  academicYearId: "year-2026",
  periodId: "period-term-1",
  templateId: "template-report",
  lines: [{ subjectId: "subject-maths", grade: "A2", marksPercent: 89.5, remark: null }],
  overallRemark: "Explains mathematical reasoning clearly.",
  status: "published",
  publishedAt: "2026-10-01T10:00:00Z",
  createdAt: "2026-09-28T09:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
};

const certificate = {
  id: "document-transfer-01",
  tenantId,
  learnerId,
  kind: "transfer",
  number: "TC-2026-001",
  templateId: "template-transfer",
  issuedOn: "2026-10-05",
  signatures: [
    {
      staffProfileId: "staff-principal",
      signedAt: "2026-10-05T09:00:00Z",
      method: "digital_certificate",
    },
  ],
  verificationCode: "TC2026AB01",
  revoked: false,
  revokedReason: null,
};

describe("report cards", () => {
  it("accepts a published report card", () => {
    expect(ReportCardSchema.parse(report)).toEqual(report);
  });

  it("requires a publication time exactly when published", () => {
    expect(ReportCardSchema.safeParse({ ...report, publishedAt: null }).success).toBe(false);
    expect(ReportCardSchema.safeParse({ ...report, status: "approved" }).success).toBe(false);
  });

  it("rejects updates before creation and unknown line fields", () => {
    const updatedAt = "2026-09-27T09:00:00Z";
    expect(ReportCardSchema.safeParse({ ...report, updatedAt }).success).toBe(false);
    const lines = [{ ...report.lines[0], extra: true }];
    expect(ReportCardSchema.safeParse({ ...report, lines }).success).toBe(false);
  });
});

describe("issued documents", () => {
  it("accepts a signed transfer certificate and an unsigned staff letter", () => {
    const letter = {
      ...certificate,
      id: "document-letter-01",
      kind: "letter",
      learnerId: null,
      number: "LET-2026-001",
      templateId: "template-letter",
      signatures: [],
      verificationCode: "LET2026AB01",
    };
    expect(IssuedDocumentSchema.parse(certificate)).toEqual(certificate);
    expect(IssuedDocumentSchema.parse(letter)).toEqual(letter);
  });

  it("rejects lower-case verification codes and extra signature fields", () => {
    const verificationCode = certificate.verificationCode.toLowerCase();
    const lowerCaseCode = { ...certificate, verificationCode };
    expect(IssuedDocumentSchema.safeParse(lowerCaseCode).success).toBe(false);
    const signatures = [{ ...certificate.signatures[0], extra: true }];
    expect(IssuedDocumentSchema.safeParse({ ...certificate, signatures }).success).toBe(false);
  });

  it("requires a reason exactly when revoked", () => {
    const revokedReason = "Replaced by a corrected copy";
    const revoked = { ...certificate, revoked: true, revokedReason };
    expect(IssuedDocumentSchema.parse(revoked)).toEqual(revoked);
    expect(IssuedDocumentSchema.safeParse({ ...certificate, revoked: true }).success).toBe(false);
    expect(IssuedDocumentSchema.safeParse({ ...revoked, revoked: false }).success).toBe(false);
  });
});
