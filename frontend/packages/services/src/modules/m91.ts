import {
  LearnerMediaConsentSchema,
  MediaItemSchema,
  PAGE_SIZE_MAX,
  PortfolioEntrySchema,
  PortfolioExportSchema,
  PortfolioSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const MediaItemPage = pageSchema(MediaItemSchema);
const LearnerMediaConsentPage = pageSchema(LearnerMediaConsentSchema);
const PortfolioPage = pageSchema(PortfolioSchema);
const PortfolioEntryPage = pageSchema(PortfolioEntrySchema);
const PortfolioExportPage = pageSchema(PortfolioExportSchema);

export function useMediaItems() {
  return useScopedQuery(
    (s) => queryKeys.m91.mediaItems(s),
    (c, signal) => c.get("/media-items", MediaItemPage, all, { signal }),
  );
}

export function useLearnerMediaConsents(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m91.learnerMediaConsents(s, learnerId),
    (c, signal) => c.get("/learner-media-consents", LearnerMediaConsentPage, query, { signal }),
  );
}

export function usePortfolios(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m91.portfolios(s, learnerId),
    (c, signal) => c.get("/portfolios", PortfolioPage, query, { signal }),
  );
}

export function usePortfolio(portfolioId: string | null) {
  const path = `/portfolios/${encodeURIComponent(portfolioId ?? "")}`;
  return useScopedQuery(
    (s) => queryKeys.m91.portfolio(s, portfolioId),
    (c, signal) => c.get(path, PortfolioSchema, undefined, { signal }),
    portfolioId !== null,
  );
}

export function usePortfolioEntries(portfolioId: string | null) {
  const path = `/portfolios/${encodeURIComponent(portfolioId ?? "")}/entries`;
  return useScopedQuery(
    (s) => queryKeys.m91.portfolioEntries(s, portfolioId),
    (c, signal) => c.get(path, PortfolioEntryPage, all, { signal }),
    portfolioId !== null,
  );
}

export function usePortfolioExports(portfolioId: string | null) {
  const path = `/portfolios/${encodeURIComponent(portfolioId ?? "")}/exports`;
  return useScopedQuery(
    (s) => queryKeys.m91.portfolioExports(s, portfolioId),
    (c, signal) => c.get(path, PortfolioExportPage, all, { signal }),
    portfolioId !== null,
  );
}
