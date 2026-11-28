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
import { ASSIGNMENT_SUBMISSION as AS } from "./ids-stage4-assess";
import {
  MEDIA_ITEM,
  MEDIA_SHARING_CONSENT,
  OBSERVATION,
  PORTFOLIO,
  PORTFOLIO_ENTRY as PE,
  PORTFOLIO_EXPORT as PX,
} from "./ids-stage4-care";
import { DEFERRED_PORTFOLIO_ENTRY as DPE, ISSUED_CREDENTIAL as IC } from "./ids-stage4-engage";
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

const lsScope = { tenantId: ls, portfolioId: PORTFOLIO.lsIshaan, outcomeIds: [OUTCOME.lsSocial1] };
const rvScope = { tenantId: rv, portfolioId: PORTFOLIO.rvMia, outcomeIds: [OUTCOME.rvMathFrac] };
const at = (s: string) => `2026-${s}:00Z`;
const refNote = "Drawing the fraction strips helped me see which pieces are the same size.";

const entry = (
  scope: typeof lsScope | typeof rvScope,
  id: string,
  kind: PortfolioEntry["kind"],
  refId: string | null,
  who: readonly [string, PortfolioEntry["addedByRole"]],
  addedAt: string,
  reflection: string | null = null,
): PortfolioEntry => ({
  ...scope,
  outcomeIds: [...scope.outcomeIds],
  id,
  kind,
  refId,
  reflection,
  addedByProfileId: who[0],
  addedByRole: who[1],
  addedAt: at(addedAt),
});

const byLsStaff = [lsStaff, "staff"] as const;
const byRvStaff = [rvStaff, "staff"] as const;
const byRvLearner = [rvLearner, "learner"] as const;

export const PORTFOLIO_ENTRIES: readonly PortfolioEntry[] = [
  entry(lsScope, PE.media, "media", MEDIA_ITEM.lsActivity, byLsStaff, "09-14T08:30"),
  entry(lsScope, PE.observation, "observation", OBSERVATION.turnTaking, byLsStaff, "09-14T08:35"),
  entry(rvScope, PE.reflection, "reflection", null, byRvLearner, "09-04T14:45", refNote),
  entry(
    rvScope,
    DPE.assignmentSubmission,
    "assignment_submission",
    AS.rvMiaFrac,
    byRvStaff,
    "09-17T12:30",
  ),
  entry(rvScope, DPE.credential, "credential", IC.rvMiaBadge, byRvLearner, "09-18T13:00"),
];

const lsExp = { tenantId: ls, portfolioId: PORTFOLIO.lsIshaan, requestedByProfileId: lsGuardian };
const rvExp = { tenantId: rv, portfolioId: PORTFOLIO.rvMia, requestedByProfileId: rvLearner };

const exp = (
  base: typeof lsExp | typeof rvExp,
  id: string,
  format: PortfolioExport["format"],
  status: PortfolioExport["status"],
  reqAt: string,
  done?: readonly [string, string],
): PortfolioExport => ({
  ...base,
  otherLearnersExcluded: true,
  id,
  format,
  status,
  requestedAt: at(reqAt),
  readyAt: done ? at(done[0]) : null,
  expiresAt: done ? at(done[1]) : null,
});

export const PORTFOLIO_EXPORTS: readonly PortfolioExport[] = [
  exp(lsExp, PX.queued, "zip", "queued", "09-15T11:59"),
  exp(lsExp, PX.ready, "pdf", "ready", "09-14T09:40", ["09-14T09:42", "09-20T09:42"]),
  exp(rvExp, PX.failed, "zip", "failed", "09-14T14:00"),
  exp(rvExp, PX.expired, "pdf", "expired", "09-04T15:00", ["09-04T15:02", "09-11T15:02"]),
];
