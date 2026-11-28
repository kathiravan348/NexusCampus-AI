import type {
  AccessibilityCheck,
  ContentAsset,
  ContentAssetKind,
  ContentAttempt,
  ContentAttemptStatus,
  ContentBlock,
  ContentItem,
  ContentKind,
  ContentPackage,
  ContentStatus,
} from "@nexus/contracts";
import { INSTITUTION as I, PERSON, TENANT as T } from "./ids";
import { LEARNER as L } from "./ids-stage3";
import {
  CONTENT_ASSET as A,
  CONTENT_ATTEMPT as ATT,
  CONTENT_ITEM as CI,
  OUTCOME as O,
} from "./ids-stage4-learning";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const ts = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };
const CLEAN_A11Y: AccessibilityCheck = { checkedAt: UPDATED_AT, issues: [] };
const sha256 = (seed: number): string => seed.toString(16).padStart(64, "0");
const regUuid = (n: number): string => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;

function staffId(personId: string): string {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === "staff");
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
}

type AssetRow = readonly [string, string, ContentAssetKind, string, string, number];

export const CONTENT_ASSETS: readonly ContentAsset[] = (
  [
    [A.lsStoryPdf, T.littleSteps, "document", "story-guide.pdf", "application/pdf", 184_320],
    [A.rvFractionChart, T.riverside, "image", "fraction-wall.png", "image/png", 92_400],
    [A.rvFractionClip, T.riverside, "video", "fraction-clip.mp4", "video/mp4", 14_200_000],
    [A.rvFractionCaptions, T.riverside, "captions", "fraction-en.vtt", "text/vtt", 4_820],
    [A.rvEssayDiagram, T.riverside, "image", "essay-outline.png", "image/png", 64_100],
    [A.rvWaterVideo, T.riverside, "video", "water-cycle.mp4", "video/mp4", 22_500_000],
    [A.rvWaterCaptions, T.riverside, "captions", "water-cycle-en.vtt", "text/vtt", 6_340],
    [A.nbScormPkg, T.northbridge, "package", "cs101-scorm2004.zip", "application/zip", 8_420_000],
    [A.axCmi5Pkg, T.apex, "package", "algebra-cmi5.zip", "application/zip", 6_150_000],
    [A.hmIntervalAudio, T.harmony, "audio", "intervals.mp3", "audio/mpeg", 3_840_000],
    [A.hmIntervalTranscript, T.harmony, "captions", "intervals-en.vtt", "text/vtt", 3_120],
  ] as readonly AssetRow[]
).map(([id, tenantId, kind, fileName, contentType, sizeBytes], idx) => ({
  id,
  tenantId,
  kind,
  fileName,
  contentType,
  sizeBytes,
  sha256: sha256(idx + 1),
  createdAt: CREATED_AT,
}));

interface ItemOpts {
  status?: ContentStatus;
  version?: number;
  blocks?: readonly ContentBlock[];
  assetId?: string;
  textTrackAssetIds?: readonly string[];
  package?: ContentPackage;
  durationSeconds?: number;
  aiAssisted?: boolean;
  accessibility?: AccessibilityCheck;
}

function item(
  id: string,
  tenantId: string,
  institutionId: string,
  kind: ContentKind,
  title: string,
  language: string,
  outcomeId: string,
  authorPersonId: string,
  opts: ItemOpts,
): ContentItem {
  return {
    id,
    tenantId,
    institutionId,
    kind,
    title,
    language,
    outcomeIds: [outcomeId],
    status: opts.status ?? "published",
    version: opts.version ?? 1,
    blocks: opts.blocks ? [...opts.blocks] : null,
    assetId: opts.assetId ?? null,
    textTrackAssetIds: [...(opts.textTrackAssetIds ?? [])],
    package: opts.package ?? null,
    durationSeconds: opts.durationSeconds ?? null,
    aiAssisted: opts.aiAssisted ?? false,
    accessibility: opts.accessibility ?? CLEAN_A11Y,
    createdByProfileId: staffId(authorPersonId),
    ...ts,
  };
}

export const CONTENT_ITEMS: readonly ContentItem[] = [
  item(
    CI.lsStoryGuide,
    T.littleSteps,
    I.littleSteps,
    "document",
    "Story Circle Picture Prompts",
    "en-IN",
    O.lsLang1,
    PERSON.lsArjun,
    { assetId: A.lsStoryPdf },
  ),
  item(
    CI.rvFractionsLesson,
    T.riverside,
    I.riversideSchool,
    "lesson",
    "Equivalent Fractions Interactive Lesson",
    "en-GB",
    O.rvMathFrac,
    PERSON.rvAmira,
    {
      version: 2,
      durationSeconds: 900,
      blocks: [
        { type: "text", markdown: "# Equivalent Fractions\n\nCompare halves and quarters." },
        {
          type: "image",
          assetId: A.rvFractionChart,
          altText: "Fraction wall aligning one half, two quarters, and four eighths",
        },
        { type: "video", assetId: A.rvFractionClip, captionAssetIds: [A.rvFractionCaptions] },
        { type: "embed", url: "https://interactive.example.edu/fractions-wall" },
      ],
    },
  ),
  item(
    CI.rvDraftLesson,
    T.riverside,
    I.riversideSchool,
    "lesson",
    "Analytical Essay Structure (Draft)",
    "en-GB",
    O.rvEngWrite,
    PERSON.rvTom,
    {
      status: "draft",
      durationSeconds: 600,
      aiAssisted: true,
      blocks: [
        { type: "text", markdown: "# Essay Outline Draft\n\nAwaiting alt-text review." },
        { type: "image", assetId: A.rvEssayDiagram, altText: "Diagram placeholder" },
      ],
      accessibility: {
        checkedAt: UPDATED_AT,
        issues: [{ code: "missing_alt_text", blockIndex: 1, severity: "error" }],
      },
    },
  ),
  item(
    CI.rvWaterVideo,
    T.riverside,
    I.riversideSchool,
    "video",
    "The Water Cycle Explained",
    "en-GB",
    O.rvEngRead,
    PERSON.rvTom,
    { assetId: A.rvWaterVideo, textTrackAssetIds: [A.rvWaterCaptions], durationSeconds: 420 },
  ),
  item(
    CI.nbScormLab,
    T.northbridge,
    I.northbridge,
    "scorm2004",
    "Control Flow and Loops Lab (SCORM 2004)",
    "en-US",
    O.nbCo1,
    PERSON.nbElena,
    {
      durationSeconds: 1800,
      package: {
        assetId: A.nbScormPkg,
        launchPath: "content/index.html",
        manifestIdentifier: "nb-cs101-loops-scorm2004",
      },
    },
  ),
  item(
    CI.axCmi5Drill,
    T.apex,
    I.apex,
    "cmi5",
    "Quadratic Discriminant Timed Drill (cmi5)",
    "en-IN",
    O.axAlgQuad,
    PERSON.axMeena,
    {
      durationSeconds: 1200,
      package: {
        assetId: A.axCmi5Pkg,
        launchPath: "launch/index.html",
        manifestIdentifier: "ax-alg-quadratics-cmi5",
      },
    },
  ),
  item(
    CI.hmEarAudio,
    T.harmony,
    I.harmony,
    "audio",
    "Major and Minor Interval Listening Track",
    "en-SG",
    O.hmGrade2,
    PERSON.hmDaniel,
    {
      assetId: A.hmIntervalAudio,
      textTrackAssetIds: [A.hmIntervalTranscript],
      durationSeconds: 240,
    },
  ),
];

type AttRow = readonly [
  string,
  string,
  string,
  ContentAttemptStatus,
  number | null,
  string,
  number,
];

export const CONTENT_ATTEMPTS: readonly ContentAttempt[] = (
  [
    [ATT.rvMiaLesson, CI.rvFractionsLesson, L.rvMia, "completed", null, "2026-09-15", 10],
    [ATT.nbJordanScorm, CI.nbScormLab, L.nbJordan, "passed", 8800, "2026-09-10", 25],
    [ATT.nbSofiaScorm, CI.nbScormLab, L.nbSofia, "incomplete", null, "2026-09-11", 7],
    [ATT.axVijayCmi5, CI.axCmi5Drill, L.axVijay, "failed", 4500, "2026-09-18", 16],
    [ATT.hmEthanAudio, CI.hmEarAudio, L.hmEthan, "completed", null, "2026-06-12", 4],
  ] as readonly AttRow[]
).map(([id, contentItemId, learnerId, status, scoreBps, day, mins], idx) => {
  const target = CONTENT_ITEMS.find((entry) => entry.id === contentItemId);
  if (!target) throw new Error(`Missing content item ${contentItemId}`);
  const mm = String(mins).padStart(2, "0");
  return {
    id,
    tenantId: target.tenantId,
    contentItemId,
    learnerId,
    registration: regUuid(idx + 1),
    status,
    scoreBps,
    timeSpentSeconds: mins * 60,
    startedAt: `${day}T10:00:00Z`,
    finishedAt: status === "incomplete" ? null : `${day}T10:${mm}:00Z`,
  };
});
