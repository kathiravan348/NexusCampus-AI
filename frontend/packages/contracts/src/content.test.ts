import { describe, expect, it } from "vitest";
import {
  ContentAssetSchema,
  ContentAttemptSchema,
  ContentBlockSchema,
  ContentItemSchema,
  type ContentAsset,
  type ContentAttempt,
  type ContentAttemptStatus,
  type ContentBlock,
  type ContentItem,
} from "./index";

const timestamps = { createdAt: "2026-06-01T08:00:00Z", updatedAt: "2026-06-02T08:00:00Z" };
const cleanCheck = { checkedAt: "2026-06-02T07:00:00Z", issues: [] };

const asset: ContentAsset = {
  id: "asset-strips-video",
  tenantId: "tenant-school",
  kind: "video",
  fileName: "fraction-strips.mp4",
  contentType: "video/mp4",
  sizeBytes: 48_000_000,
  sha256: "a".repeat(64),
  createdAt: timestamps.createdAt,
};
const blocks: ContentBlock[] = [
  { type: "text", markdown: "## Equivalent fractions\nFold the strip in half." },
  {
    type: "image",
    assetId: "asset-strip-photo",
    altText: "A paper strip folded into two equal parts.",
  },
  { type: "video", assetId: asset.id, captionAssetIds: ["asset-strips-captions-en"] },
  { type: "question", questionId: "question-half" },
  { type: "embed", url: "https://www.example.org/fraction-wall" },
];
const lesson: ContentItem = {
  ...timestamps,
  id: "content-fraction-strips",
  tenantId: "tenant-school",
  institutionId: "institution-school",
  kind: "lesson",
  title: "Fraction strips",
  language: "en-IN",
  outcomeIds: ["outcome-number-a1"],
  status: "published",
  version: 2,
  blocks,
  assetId: null,
  textTrackAssetIds: [],
  package: null,
  durationSeconds: 1200,
  aiAssisted: false,
  accessibility: cleanCheck,
  createdByProfileId: "staff-maths",
};
const video: ContentItem = {
  ...lesson,
  id: "content-video",
  kind: "video",
  blocks: null,
  assetId: asset.id,
  textTrackAssetIds: ["asset-strips-captions-en", "asset-strips-captions-hi"],
};
const scorm: ContentItem = {
  ...lesson,
  id: "content-safety-scorm",
  kind: "scorm2004",
  blocks: null,
  package: {
    assetId: "asset-safety-zip",
    launchPath: "res/index.html",
    manifestIdentifier: "com.example.safety",
  },
};
const cmi5: ContentItem = {
  ...scorm,
  id: "content-cmi5",
  kind: "cmi5",
  package: {
    assetId: "asset-cmi5-zip",
    launchPath: "au1/start.html?lang=en",
    manifestIdentifier: "https://example.org/course/1",
  },
};
const attempt: ContentAttempt = {
  id: "attempt-1",
  tenantId: "tenant-school",
  contentItemId: scorm.id,
  learnerId: "learner-aarav",
  registration: "0f8fad5b-d9cb-469f-a165-70867728950e",
  status: "passed",
  scoreBps: 8500,
  timeSpentSeconds: 900,
  startedAt: "2026-07-01T09:00:00Z",
  finishedAt: "2026-07-01T09:15:00Z",
};

describe("content assets and blocks", () => {
  it("accepts an asset and every block type", () => {
    expect(ContentAssetSchema.safeParse(asset).success).toBe(true);
    for (const block of blocks) {
      expect(ContentBlockSchema.safeParse(block).success).toBe(true);
    }
  });

  it("rejects bad assets and blocks", () => {
    expect(ContentAssetSchema.safeParse({ ...asset, sha256: "A".repeat(64) }).success).toBe(false);
    expect(ContentAssetSchema.safeParse({ ...asset, fileName: "../video.mp4" }).success).toBe(
      false,
    );
    expect(ContentAssetSchema.safeParse({ ...asset, sizeBytes: 0 }).success).toBe(false);
    expect(ContentAssetSchema.safeParse({ ...asset, storageKey: "s3://bucket/key" }).success).toBe(
      false,
    );
    expect(
      ContentBlockSchema.safeParse({ type: "image", assetId: "asset-1", altText: " " }).success,
    ).toBe(false);
    expect(ContentBlockSchema.safeParse({ type: "image", assetId: "asset-1" }).success).toBe(false);
    expect(
      ContentBlockSchema.safeParse({ type: "embed", url: "http://www.example.org/" }).success,
    ).toBe(false);
    expect(
      ContentBlockSchema.safeParse({ type: "video", assetId: "v", captionAssetIds: ["c", "c"] })
        .success,
    ).toBe(false);
    expect(ContentBlockSchema.safeParse({ type: "audio", assetId: "a" }).success).toBe(false);
  });
});

describe("content items", () => {
  it("accepts a lesson, a captioned video, a SCORM 2004 and a cmi5 package", () => {
    for (const item of [lesson, video, scorm, cmi5]) {
      expect(ContentItemSchema.safeParse(item).success).toBe(true);
    }
    const draftWithErrors = {
      ...lesson,
      status: "draft",
      aiAssisted: true,
      accessibility: {
        ...cleanCheck,
        issues: [{ code: "missing_alt_text", blockIndex: 1, severity: "error" }],
      },
    };
    expect(ContentItemSchema.safeParse(draftWithErrors).success).toBe(true);
  });

  it("rejects payloads that do not match the kind", () => {
    expect(ContentItemSchema.safeParse({ ...lesson, blocks: null }).success).toBe(false);
    expect(ContentItemSchema.safeParse({ ...lesson, blocks: [] }).success).toBe(false);
    expect(ContentItemSchema.safeParse({ ...video, blocks }).success).toBe(false);
    expect(ContentItemSchema.safeParse({ ...video, assetId: null }).success).toBe(false);
    expect(ContentItemSchema.safeParse({ ...scorm, package: null }).success).toBe(false);
    expect(ContentItemSchema.safeParse({ ...lesson, package: scorm.package }).success).toBe(false);
    expect(ContentItemSchema.safeParse({ ...lesson, textTrackAssetIds: ["asset-x"] }).success).toBe(
      false,
    );
    expect(ContentItemSchema.safeParse({ ...video, textTrackAssetIds: ["c", "c"] }).success).toBe(
      false,
    );
    const transcribedAudio = {
      ...video,
      id: "content-audio",
      kind: "audio",
      textTrackAssetIds: ["asset-transcript"],
    };
    expect(ContentItemSchema.safeParse(transcribedAudio).success).toBe(true);
  });

  it("rejects launch paths outside the package", () => {
    for (const launchPath of [
      "../index.html",
      "res/../../index.html",
      "/index.html",
      "https://x/y",
      "a\\b",
      "javascript:alert(1)",
      "%2e%2e/index.html",
      "res/%2E%2E/%2e%2e/x.html",
      "res%5c..%5cx.html",
      "%2fetc/passwd",
      "%zz.html",
    ]) {
      const item = { ...scorm, package: { ...scorm.package, launchPath } };
      expect(ContentItemSchema.safeParse(item).success).toBe(false);
    }
  });

  it("publishes only after a clean accessibility check", () => {
    expect(ContentItemSchema.safeParse({ ...lesson, accessibility: null }).success).toBe(false);
    const withError = {
      ...cleanCheck,
      issues: [{ code: "missing_captions", blockIndex: 2, severity: "error" }],
    };
    expect(ContentItemSchema.safeParse({ ...lesson, accessibility: withError }).success).toBe(
      false,
    );
    const withWarning = {
      ...cleanCheck,
      issues: [{ code: "heading_order", blockIndex: null, severity: "warning" }],
    };
    expect(ContentItemSchema.safeParse({ ...lesson, accessibility: withWarning }).success).toBe(
      true,
    );
  });

  it("rejects other bad items", () => {
    expect(ContentItemSchema.safeParse({ ...lesson, language: "en_IN" }).success).toBe(false);
    expect(ContentItemSchema.safeParse({ ...lesson, version: 0 }).success).toBe(false);
    expect(
      ContentItemSchema.safeParse({ ...lesson, updatedAt: "2026-05-01T08:00:00Z" }).success,
    ).toBe(false);
  });
});

describe("content attempts", () => {
  it("accepts each status", () => {
    const statuses: ContentAttemptStatus[] = ["completed", "passed", "failed"];
    for (const status of statuses) {
      expect(ContentAttemptSchema.safeParse({ ...attempt, status }).success).toBe(true);
    }
    const open = { ...attempt, status: "incomplete", scoreBps: null, finishedAt: null };
    expect(ContentAttemptSchema.safeParse(open).success).toBe(true);
  });

  it("rejects bad attempts", () => {
    expect(ContentAttemptSchema.safeParse({ ...attempt, status: "incomplete" }).success).toBe(
      false,
    );
    expect(ContentAttemptSchema.safeParse({ ...attempt, finishedAt: null }).success).toBe(false);
    expect(
      ContentAttemptSchema.safeParse({ ...attempt, finishedAt: "2026-07-01T08:00:00Z" }).success,
    ).toBe(false);
    expect(ContentAttemptSchema.safeParse({ ...attempt, registration: "reg-1" }).success).toBe(
      false,
    );
    expect(ContentAttemptSchema.safeParse({ ...attempt, scoreBps: 10001 }).success).toBe(false);
  });
});
