import {
  LearnerMediaConsentSchema,
  MediaItemSchema,
  PortfolioEntrySchema,
  PortfolioExportSchema,
  PortfolioSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { ownLearnerIds } from "./m37";
import { found, get, list, ok, param } from "./route";

const MEDIA = { module: "M91", permission: "m91.media.read" } as const;
const PORTFOLIO = { module: "M91", permission: "m91.portfolio.read" } as const;

function isMediaClearedForFamily(tenantId: string, mediaItemId: string): boolean {
  const item = ofTenant(mockDb.mediaItems, tenantId).find((row) => row.id === mediaItemId);
  if (!item || item.status === "deleted" || item.consentState !== "cleared") return false;
  const mediaConsents = new Map(
    ofTenant(mockDb.learnerMediaConsents, tenantId).map((row) => [row.learnerId, row]),
  );
  const consents = new Map(ofTenant(mockDb.consents, tenantId).map((row) => [row.id, row]));
  for (const learnerId of item.taggedLearnerIds) {
    const learnerConsent = mediaConsents.get(learnerId);
    // Deny by default: no consent row for a tagged learner means not cleared.
    if (!learnerConsent || learnerConsent.status !== "allowed") return false;
    if (learnerConsent.consentId !== null) {
      const sourceConsent = consents.get(learnerConsent.consentId);
      if (!sourceConsent || sourceConsent.status !== "granted") return false;
    }
  }
  return true;
}

function portfolioAccess(viewer: Viewer) {
  const isStaff =
    viewer.permissions.has("m91.media.read") || viewer.permissions.has("m91.media.manage");
  const learnerIds = isStaff
    ? new Set(ofTenant(mockDb.learners, viewer.tenantId).map((row) => row.id))
    : ownLearnerIds(viewer);
  const checkLearner = (id: string) => {
    if (!learnerIds.has(id)) throw new ApiFailure("not_found");
  };
  const portfolios = ofTenant(mockDb.portfolios, viewer.tenantId).filter(
    (row) => learnerIds.has(row.learnerId) && (isStaff || row.visibility === "learner_and_family"),
  );
  const portfolioById = (id: string | undefined) => found(portfolios.find((p) => p.id === id));
  return { isStaff, portfolios, checkLearner, portfolioById };
}

export const m91Handlers = [
  get("/media-items", MEDIA, (ctx) => {
    const rows = ofTenant(mockDb.mediaItems, ctx.viewer.tenantId).filter(
      (row) => row.status !== "deleted",
    );
    return list(ctx, rows, pageSchema(MediaItemSchema));
  }),
  get("/learner-media-consents", MEDIA, (ctx) => {
    const tenantLearnerIds = new Set(
      ofTenant(mockDb.learners, ctx.viewer.tenantId).map((row) => row.id),
    );
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null && !tenantLearnerIds.has(learnerId)) {
      throw new ApiFailure("not_found");
    }
    const rows = ofTenant(mockDb.learnerMediaConsents, ctx.viewer.tenantId).filter(
      (row) => learnerId === null || row.learnerId === learnerId,
    );
    return list(ctx, rows, pageSchema(LearnerMediaConsentSchema));
  }),
  get("/portfolios", PORTFOLIO, (ctx) => {
    const { portfolios, checkLearner } = portfolioAccess(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const rows = portfolios.filter((row) => learnerId === null || row.learnerId === learnerId);
    return list(ctx, rows, pageSchema(PortfolioSchema));
  }),
  get("/portfolios/:id", PORTFOLIO, (ctx) =>
    ok(PortfolioSchema, portfolioAccess(ctx.viewer).portfolioById(ctx.params["id"])),
  ),
  get("/portfolios/:id/entries", PORTFOLIO, (ctx) => {
    const { isStaff, portfolioById } = portfolioAccess(ctx.viewer);
    const portfolio = portfolioById(ctx.params["id"]);
    const rows = ofTenant(mockDb.portfolioEntries, ctx.viewer.tenantId).filter(
      (row) =>
        row.portfolioId === portfolio.id &&
        (isStaff ||
          row.kind !== "media" ||
          (row.refId !== null && isMediaClearedForFamily(ctx.viewer.tenantId, row.refId))),
    );
    return list(ctx, rows, pageSchema(PortfolioEntrySchema));
  }),
  get("/portfolios/:id/exports", PORTFOLIO, (ctx) => {
    const portfolio = portfolioAccess(ctx.viewer).portfolioById(ctx.params["id"]);
    const rows = ofTenant(mockDb.portfolioExports, ctx.viewer.tenantId).filter(
      (row) => row.portfolioId === portfolio.id,
    );
    return list(ctx, rows, pageSchema(PortfolioExportSchema));
  }),
];
