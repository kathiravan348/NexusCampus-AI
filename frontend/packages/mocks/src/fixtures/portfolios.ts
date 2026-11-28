import type {
  Consent,
  LearnerMediaConsent,
  MediaItem,
  Portfolio,
  PortfolioEntry,
  PortfolioExport,
} from "@nexus/contracts";
import { CONSENTS } from "./compliance";
import { GUARDIAN_RELATIONSHIPS } from "./families";
import { INSTITUTION, PERSON, TENANT } from "./ids";
import { GUARDIAN_RELATIONSHIP, LEARNER } from "./ids-stage3";
import {
  MEDIA_ITEM,
  MEDIA_SHARING_CONSENT,
  OBSERVATION,
  PORTFOLIO,
  PORTFOLIO_ENTRY,
  PORTFOLIO_EXPORT,
} from "./ids-stage4-care";
import { OUTCOME } from "./ids-stage4-learning";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const ls = TENANT.littleSteps;
const rv = TENANT.riverside;
const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

function profileId(tenantId: string, personId: string, kind: "staff" | "guardian" | "learner") {
  const profile = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === personId && p.kind === kind,
  );
  if (!profile) throw new Error("Missing portfolio role profile");
  return profile.id;
}

const lsStaff = profileId(ls, PERSON.lsArjun, "staff");
const rvStaff = profileId(rv, PERSON.rvAmira, "staff");
const lsGuardian = profileId(ls, PERSON.lsSunita, "guardian");
const rvLearner = profileId(rv, PERSON.rvMia, "learner");

function mediaGrant(id: string, relationshipId: string, recordedAt: string): Consent {
  const relationship = GUARDIAN_RELATIONSHIPS.find((row) => row.id === relationshipId);
  if (!relationship) throw new Error("Missing guardian for media grant");
  return {
    id,
    tenantId: relationship.tenantId,
    personId: relationship.learnerPersonId,
    givenByPersonId: relationship.guardianPersonId,
    purpose: "media_sharing",
    status: "granted",
    method: "digital_signature",
    recordedAt,
    withdrawnAt: null,
  };
}

/** Standalone grants for M91. NEX-224 joins them into the mock consents collection. */
export const MEDIA_SHARING_CONSENTS: readonly Consent[] = [
  mediaGrant(
    MEDIA_SHARING_CONSENT.lsIshaan,
    GUARDIAN_RELATIONSHIP.lsIshaan,
    "2026-06-04T06:00:00Z",
  ),
  mediaGrant(MEDIA_SHARING_CONSENT.rvMia, GUARDIAN_RELATIONSHIP.rvMia, "2026-09-02T16:00:00Z"),
  mediaGrant(MEDIA_SHARING_CONSENT.rvElla, GUARDIAN_RELATIONSHIP.rvElla, "2026-09-03T16:00:00Z"),
];

const allConsents = [...CONSENTS, ...MEDIA_SHARING_CONSENTS];

function mediaConsent(key: keyof typeof LEARNER, tenantId: string): LearnerMediaConsent {
  const consent = allConsents.find(
    (row) =>
      row.tenantId === tenantId && row.personId === PERSON[key] && row.purpose === "media_sharing",
  );
  if (!consent) throw new Error("Missing source consent for media fixture");
  const statusByConsent = {
    granted: "allowed",
    withdrawn: "opted_out",
    pending: "pending",
  } as const;
  return {
    tenantId,
    learnerId: LEARNER[key],
    status: statusByConsent[consent.status],
    consentId: consent.status === "pending" ? null : consent.id,
    updatedAt: consent.withdrawnAt ?? consent.recordedAt,
  };
}

export const LEARNER_MEDIA_CONSENTS: readonly LearnerMediaConsent[] = [
  mediaConsent("lsIshaan", ls),
  mediaConsent("lsKavya", ls),
  mediaConsent("rvMia", rv),
  mediaConsent("rvElla", rv),
  mediaConsent("rvLeo", rv),
];

function consentState(
  tenantId: string,
  taggedLearnerIds: readonly string[],
): MediaItem["consentState"] {
  const statuses = taggedLearnerIds.map(
    (id) =>
      LEARNER_MEDIA_CONSENTS.find((row) => row.tenantId === tenantId && row.learnerId === id)
        ?.status,
  );
  if (statuses.includes("opted_out")) return "blocked";
  if (statuses.length > 0 && statuses.every((status) => status === "allowed")) return "cleared";
  return "pending";
}

const photos = [
  [
    ls,
    {
      id: MEDIA_ITEM.lsActivity,
      fileName: "block-tower.jpg",
      capturedAt: "2026-09-14T08:20:00Z",
      taggedLearnerIds: [LEARNER.lsIshaan],
      visibility: "tagged_families",
      caption: "A tower built during block play.",
      aiCaption: null,
      outcomeIds: [OUTCOME.lsSocial1],
    },
  ],
  [
    ls,
    {
      id: MEDIA_ITEM.lsGroup,
      fileName: "group-block-play.jpg",
      capturedAt: "2026-09-14T08:21:00Z",
      taggedLearnerIds: [LEARNER.lsIshaan, LEARNER.lsKavya],
      visibility: "staff_only",
      caption: "Group block play.",
      aiCaption: null,
      outcomeIds: [OUTCOME.lsSocial1],
    },
  ],
  [
    rv,
    {
      id: MEDIA_ITEM.rvWork,
      fileName: "fraction-wall.jpg",
      capturedAt: "2026-09-11T10:20:00Z",
      taggedLearnerIds: [LEARNER.rvMia],
      visibility: "class_families",
      caption: null,
      aiCaption: { text: "Coloured strips show equivalent fractions.", tier: "multimodal" },
      outcomeIds: [OUTCOME.rvMathFrac],
    },
  ],
  [
    rv,
    {
      id: MEDIA_ITEM.rvPending,
      fileName: "display-boards.jpg",
      capturedAt: "2026-09-11T13:40:00Z",
      taggedLearnerIds: [LEARNER.rvElla, LEARNER.rvLeo],
      visibility: "staff_only",
      caption: "Work on display boards.",
      aiCaption: null,
      outcomeIds: [],
    },
  ],
] as const;

export const MEDIA_ITEMS: readonly MediaItem[] = photos.map(([tenantId, photo], index) => ({
  ...photo,
  taggedLearnerIds: [...photo.taggedLearnerIds],
  outcomeIds: [...photo.outcomeIds],
  tenantId,
  institutionId: tenantId === ls ? INSTITUTION.littleSteps : INSTITUTION.riversideSchool,
  uploadedByProfileId: tenantId === ls ? lsStaff : rvStaff,
  kind: "photo",
  contentType: "image/jpeg",
  sizeBytes: 80_000 + 3_000 * index,
  sha256: (index + 1).toString(16).padStart(64, "0"),
  consentState: consentState(tenantId, photo.taggedLearnerIds),
  aiSuggestedOutcomeIds: [],
  status: "active",
  createdAt: CREATED_AT,
}));

export const PORTFOLIOS: readonly Portfolio[] = [
  {
    id: PORTFOLIO.lsIshaan,
    tenantId: ls,
    learnerId: LEARNER.lsIshaan,
    title: "Learning through play",
    visibility: "learner_and_family",
    status: "open",
    ...timestamps,
  },
  {
    id: PORTFOLIO.rvMia,
    tenantId: rv,
    learnerId: LEARNER.rvMia,
    title: "Learning reflections",
    visibility: "learner_and_family",
    status: "open",
    ...timestamps,
  },
];

export const PORTFOLIO_ENTRIES: readonly PortfolioEntry[] = [
  {
    id: PORTFOLIO_ENTRY.media,
    tenantId: ls,
    portfolioId: PORTFOLIO.lsIshaan,
    kind: "media",
    refId: MEDIA_ITEM.lsActivity,
    reflection: null,
    outcomeIds: [OUTCOME.lsSocial1],
    addedByProfileId: lsStaff,
    addedByRole: "staff",
    addedAt: "2026-09-14T08:30:00Z",
  },
  {
    id: PORTFOLIO_ENTRY.observation,
    tenantId: ls,
    portfolioId: PORTFOLIO.lsIshaan,
    kind: "observation",
    refId: OBSERVATION.turnTaking,
    reflection: null,
    outcomeIds: [OUTCOME.lsSocial1],
    addedByProfileId: lsStaff,
    addedByRole: "staff",
    addedAt: "2026-09-14T08:35:00Z",
  },
  {
    id: PORTFOLIO_ENTRY.reflection,
    tenantId: rv,
    portfolioId: PORTFOLIO.rvMia,
    kind: "reflection",
    refId: null,
    reflection: "Drawing the fraction strips helped me see which pieces are the same size.",
    outcomeIds: [OUTCOME.rvMathFrac],
    addedByProfileId: rvLearner,
    addedByRole: "learner",
    addedAt: "2026-09-04T14:45:00Z",
  },
];

const lsExport = {
  tenantId: ls,
  portfolioId: PORTFOLIO.lsIshaan,
  requestedByProfileId: lsGuardian,
  otherLearnersExcluded: true,
} as const;
const rvExport = {
  tenantId: rv,
  portfolioId: PORTFOLIO.rvMia,
  requestedByProfileId: rvLearner,
  otherLearnersExcluded: true,
} as const;

export const PORTFOLIO_EXPORTS: readonly PortfolioExport[] = [
  {
    ...lsExport,
    id: PORTFOLIO_EXPORT.queued,
    format: "zip",
    status: "queued",
    requestedAt: "2026-09-15T11:59:00Z",
    readyAt: null,
    expiresAt: null,
  },
  {
    ...lsExport,
    id: PORTFOLIO_EXPORT.ready,
    format: "pdf",
    status: "ready",
    requestedAt: "2026-09-14T09:40:00Z",
    readyAt: "2026-09-14T09:42:00Z",
    expiresAt: "2026-09-20T09:42:00Z",
  },
  {
    ...rvExport,
    id: PORTFOLIO_EXPORT.failed,
    format: "zip",
    status: "failed",
    requestedAt: "2026-09-14T14:00:00Z",
    readyAt: null,
    expiresAt: null,
  },
  {
    ...rvExport,
    id: PORTFOLIO_EXPORT.expired,
    format: "pdf",
    status: "expired",
    requestedAt: "2026-09-04T15:00:00Z",
    readyAt: "2026-09-04T15:02:00Z",
    expiresAt: "2026-09-11T15:02:00Z",
  },
];
