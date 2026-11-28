import { CATALOGUE_RECORD, TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useCatalogueRecord,
  useCatalogueRecords,
  useHolds,
  useLibraryCopies,
  useLibraryFines,
  useLoans,
  useReadingRecommendations,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M39 hooks", () => {
  it("loads catalogue records, copies, loans, holds, fines and recommendations", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const records = useCatalogueRecords();
        const recordId = records.data?.items[0]?.id ?? null;
        const loans = useLoans();
        const borrowerProfileId = loans.data?.items[0]?.borrowerProfileId ?? null;
        return {
          records,
          record: useCatalogueRecord(recordId),
          copies: useLibraryCopies(recordId),
          loans,
          loansByBorrower: useLoans(borrowerProfileId),
          holds: useHolds(),
          fines: useLibraryFines(),
          recommendations: useReadingRecommendations(),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const r = result.current;
      expect(r.records.data?.total).toBe(2);
      expect(r.record.data?.id).toBe(CATALOGUE_RECORD.rvPonds);
      expect(r.copies.data?.total).toBe(4);
      expect(r.loans.data?.total).toBe(3);
      expect(r.loansByBorrower.data?.items).toHaveLength(1);
      expect(r.holds.data?.total).toBe(3);
      expect(r.fines.data?.total).toBe(1);
      expect(r.recommendations.data?.total).toBe(1);
    });
  });
});
