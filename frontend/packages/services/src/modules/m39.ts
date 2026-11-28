import {
  CatalogueRecordSchema,
  HoldSchema,
  LibraryCopySchema,
  LibraryFineSchema,
  LoanSchema,
  PAGE_SIZE_MAX,
  ReadingRecommendationSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const CatalogueRecordPage = pageSchema(CatalogueRecordSchema);
const LibraryCopyPage = pageSchema(LibraryCopySchema);
const LoanPage = pageSchema(LoanSchema);
const HoldPage = pageSchema(HoldSchema);
const LibraryFinePage = pageSchema(LibraryFineSchema);
const ReadingRecommendationPage = pageSchema(ReadingRecommendationSchema);

export function useCatalogueRecords() {
  return useScopedQuery(
    (s) => queryKeys.m39.catalogueRecords(s),
    (c, signal) => c.get("/catalogue-records", CatalogueRecordPage, all, { signal }),
  );
}

export function useCatalogueRecord(recordId: string | null) {
  const path = `/catalogue-records/${encodeURIComponent(recordId ?? "")}`;
  return useScopedQuery(
    (s) => queryKeys.m39.catalogueRecord(s, recordId),
    (c, signal) => c.get(path, CatalogueRecordSchema, undefined, { signal }),
    recordId !== null,
  );
}

export function useLibraryCopies(recordId: string | null = null) {
  const query = recordId === null ? all : { ...all, recordId };
  return useScopedQuery(
    (s) => queryKeys.m39.libraryCopies(s, recordId),
    (c, signal) => c.get("/library-copies", LibraryCopyPage, query, { signal }),
  );
}

export function useLoans(borrowerProfileId: string | null = null) {
  const query = borrowerProfileId === null ? all : { ...all, borrowerProfileId };
  return useScopedQuery(
    (s) => queryKeys.m39.loans(s, borrowerProfileId),
    (c, signal) => c.get("/loans", LoanPage, query, { signal }),
  );
}

export function useHolds(borrowerProfileId: string | null = null) {
  const query = borrowerProfileId === null ? all : { ...all, borrowerProfileId };
  return useScopedQuery(
    (s) => queryKeys.m39.holds(s, borrowerProfileId),
    (c, signal) => c.get("/holds", HoldPage, query, { signal }),
  );
}

export function useLibraryFines(borrowerProfileId: string | null = null) {
  const query = borrowerProfileId === null ? all : { ...all, borrowerProfileId };
  return useScopedQuery(
    (s) => queryKeys.m39.libraryFines(s, borrowerProfileId),
    (c, signal) => c.get("/library-fines", LibraryFinePage, query, { signal }),
  );
}

export function useReadingRecommendations(borrowerProfileId: string | null = null) {
  const query = borrowerProfileId === null ? all : { ...all, borrowerProfileId };
  return useScopedQuery(
    (s) => queryKeys.m39.readingRecommendations(s, borrowerProfileId),
    (c, signal) => c.get("/reading-recommendations", ReadingRecommendationPage, query, { signal }),
  );
}
