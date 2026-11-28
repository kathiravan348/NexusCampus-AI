import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useLearnerMediaConsents,
  useMediaItems,
  usePortfolio,
  usePortfolioEntries,
  usePortfolioExports,
  usePortfolios,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M91 hooks", () => {
  it("loads media items, learner media consents, portfolios, entries and exports", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.littleSteps, userId: USER.lsPriya });
    const { result } = renderHook(
      () => {
        const media = useMediaItems();
        const consents = useLearnerMediaConsents();
        const portfolios = usePortfolios();
        const consentLearnerId = consents.data?.items[0]?.learnerId ?? null;
        const firstPortfolio = portfolios.data?.items[0];
        const portfolioId = firstPortfolio?.id ?? null;
        const portfolioLearnerId = firstPortfolio?.learnerId ?? null;
        return {
          media,
          consents,
          consentsByLearner: useLearnerMediaConsents(consentLearnerId),
          portfolios,
          portfoliosByLearner: usePortfolios(portfolioLearnerId),
          portfolio: usePortfolio(portfolioId),
          entries: usePortfolioEntries(portfolioId),
          exportsQuery: usePortfolioExports(portfolioId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const {
        media,
        consents,
        consentsByLearner,
        portfolios,
        portfoliosByLearner,
        portfolio,
        entries,
        exportsQuery,
      } = result.current;
      expect(media.data?.total).toBe(2);
      expect(consents.data?.total).toBe(2);
      expect(consentsByLearner.data?.items).toHaveLength(1);
      expect(portfolios.data?.total).toBe(1);
      expect(portfoliosByLearner.data?.items).toHaveLength(1);
      expect(portfolio.data?.visibility).toBe("learner_and_family");
      expect(entries.data?.total).toBe(2);
      expect(exportsQuery.data?.total).toBe(2);
    });
  });
});
