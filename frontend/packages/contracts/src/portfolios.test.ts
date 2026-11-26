import { describe, expect, it } from "vitest";
import {
  LearnerMediaConsentSchema,
  MediaItemSchema,
  PortfolioEntrySchema,
  PortfolioExportSchema,
  PortfolioSchema,
  type MediaConsentStatus,
  type MediaItem,
  type Portfolio,
  type PortfolioEntry,
  type PortfolioEntryKind,
  type PortfolioExport,
} from "./index";

const photo: MediaItem = {
  id: "media-tower",
  tenantId: "tenant-playschool",
  institutionId: "institution-playschool",
  kind: "photo",
  fileName: "tower.jpg",
  contentType: "image/jpeg",
  sizeBytes: 2_400_000,
  sha256: "b".repeat(64),
  capturedAt: "2026-07-06T05:01:00Z",
  uploadedByProfileId: "staff-carer-anu",
  taggedLearnerIds: ["learner-kavin", "learner-meena"],
  visibility: "class_families",
  consentState: "cleared",
  caption: "Tower of six blocks.",
  aiCaption: null,
  outcomeIds: ["milestone-counting-5"],
  aiSuggestedOutcomeIds: [],
  status: "active",
  createdAt: "2026-07-06T05:02:00Z",
};
const portfolio: Portfolio = {
  id: "portfolio-kavin",
  tenantId: "tenant-playschool",
  learnerId: "learner-kavin",
  title: "Kavin — Sunflower room 2026",
  visibility: "learner_and_family",
  status: "open",
  createdAt: "2026-06-01T08:00:00Z",
  updatedAt: "2026-07-06T08:00:00Z",
};
const entry: PortfolioEntry = {
  id: "entry-1",
  tenantId: "tenant-playschool",
  portfolioId: portfolio.id,
  kind: "media",
  refId: photo.id,
  reflection: null,
  outcomeIds: ["milestone-counting-5"],
  addedByProfileId: "staff-carer-anu",
  addedByRole: "staff",
  addedAt: "2026-07-06T08:00:00Z",
};
const exportReady: PortfolioExport = {
  id: "export-1",
  tenantId: "tenant-playschool",
  portfolioId: portfolio.id,
  format: "pdf",
  status: "ready",
  requestedByProfileId: "guardian-kavin-mother",
  requestedAt: "2026-07-31T10:00:00Z",
  readyAt: "2026-07-31T10:02:00Z",
  expiresAt: "2026-08-07T10:02:00Z",
  otherLearnersExcluded: true,
};

describe("media consent and items", () => {
  it("accepts each consent status", () => {
    const base = {
      tenantId: "tenant-playschool",
      learnerId: "learner-kavin",
      updatedAt: "2026-06-01T08:00:00Z",
    };
    const statuses: MediaConsentStatus[] = ["allowed", "opted_out"];
    for (const status of statuses) {
      expect(
        LearnerMediaConsentSchema.safeParse({ ...base, status, consentId: "consent-1" }).success,
      ).toBe(true);
    }
    expect(
      LearnerMediaConsentSchema.safeParse({ ...base, status: "pending", consentId: null }).success,
    ).toBe(true);
    expect(
      LearnerMediaConsentSchema.safeParse({ ...base, status: "allowed", consentId: null }).success,
    ).toBe(false);
  });

  it("accepts a cleared class photo, a blocked staff-only photo and a video with an AI caption", () => {
    expect(MediaItemSchema.safeParse(photo).success).toBe(true);
    const blocked = { ...photo, visibility: "staff_only", consentState: "blocked" };
    expect(MediaItemSchema.safeParse(blocked).success).toBe(true);
    const video = {
      ...photo,
      id: "media-song",
      kind: "video",
      fileName: "song.mp4",
      contentType: "video/mp4",
      aiCaption: { text: "Children singing a counting song.", tier: "fast" },
      aiSuggestedOutcomeIds: ["milestone-counting-10"],
    };
    expect(MediaItemSchema.safeParse(video).success).toBe(true);
  });

  it("refuses sharing without cleared consent and face identifiers", () => {
    expect(MediaItemSchema.safeParse({ ...photo, consentState: "blocked" }).success).toBe(false);
    expect(
      MediaItemSchema.safeParse({
        ...photo,
        visibility: "tagged_families",
        consentState: "pending",
      }).success,
    ).toBe(false);
    expect(MediaItemSchema.safeParse({ ...photo, faceIds: ["f1"] }).success).toBe(false);
    const thirtyOne = Array.from({ length: 31 }, (_, index) => `learner-${index}`);
    expect(MediaItemSchema.safeParse({ ...photo, taggedLearnerIds: thirtyOne }).success).toBe(
      false,
    );
    expect(MediaItemSchema.safeParse({ ...photo, sha256: "B".repeat(64) }).success).toBe(false);
    expect(MediaItemSchema.safeParse({ ...photo, url: "https://x/tower.jpg" }).success).toBe(false);
  });
});

describe("portfolios and entries", () => {
  it("accepts an open and an archived portfolio and each entry kind", () => {
    expect(PortfolioSchema.safeParse(portfolio).success).toBe(true);
    expect(
      PortfolioSchema.safeParse({ ...portfolio, status: "archived", visibility: "staff_only" })
        .success,
    ).toBe(true);
    const kinds: PortfolioEntryKind[] = [
      "media",
      "observation",
      "assignment_submission",
      "credential",
    ];
    for (const kind of kinds) {
      expect(PortfolioEntrySchema.safeParse({ ...entry, kind }).success).toBe(true);
    }
    const reflection = {
      ...entry,
      kind: "reflection",
      refId: null,
      reflection: "I liked counting the blocks.",
      addedByRole: "learner",
    };
    expect(PortfolioEntrySchema.safeParse(reflection).success).toBe(true);
  });

  it("rejects mismatched references and reflections", () => {
    const reflection = { ...entry, kind: "reflection", refId: null, reflection: "Text." };
    expect(PortfolioEntrySchema.safeParse({ ...reflection, refId: "media-1" }).success).toBe(false);
    expect(PortfolioEntrySchema.safeParse({ ...reflection, reflection: null }).success).toBe(false);
    expect(PortfolioEntrySchema.safeParse({ ...entry, refId: null }).success).toBe(false);
    expect(PortfolioEntrySchema.safeParse({ ...entry, reflection: "Text." }).success).toBe(false);
  });
});

describe("portfolio exports", () => {
  it("accepts each status", () => {
    const pending = { readyAt: null, expiresAt: null };
    expect(
      PortfolioExportSchema.safeParse({ ...exportReady, ...pending, status: "queued" }).success,
    ).toBe(true);
    expect(
      PortfolioExportSchema.safeParse({ ...exportReady, ...pending, status: "failed" }).success,
    ).toBe(true);
    expect(PortfolioExportSchema.safeParse(exportReady).success).toBe(true);
    expect(PortfolioExportSchema.safeParse({ ...exportReady, status: "expired" }).success).toBe(
      true,
    );
  });

  it("rejects missing or long expiry and included learners", () => {
    expect(PortfolioExportSchema.safeParse({ ...exportReady, expiresAt: null }).success).toBe(
      false,
    );
    expect(
      PortfolioExportSchema.safeParse({ ...exportReady, expiresAt: "2026-08-08T10:02:01Z" })
        .success,
    ).toBe(false);
    expect(
      PortfolioExportSchema.safeParse({ ...exportReady, expiresAt: exportReady.readyAt }).success,
    ).toBe(false);
    expect(
      PortfolioExportSchema.safeParse({ ...exportReady, otherLearnersExcluded: false }).success,
    ).toBe(false);
    expect(
      PortfolioExportSchema.safeParse({ ...exportReady, downloadUrl: "https://x/e.pdf" }).success,
    ).toBe(false);
  });
});
