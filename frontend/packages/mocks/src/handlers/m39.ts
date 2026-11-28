import {
  CatalogueRecordSchema,
  HoldSchema,
  LibraryCopySchema,
  LibraryFineSchema,
  LoanSchema,
  ReadingRecommendationSchema,
  pageSchema,
  type Loan,
} from "@nexus/contracts";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, param } from "./route";

const LIB = { module: "M39", permission: "m39.library.read" } as const;

function isBorrowerProfile(kind: string): boolean {
  return kind === "learner" || kind === "staff";
}

function isCurrentLoan(loan: Loan): boolean {
  return loan.status === "active" || loan.status === "overdue";
}

function m39Scope(viewer: Viewer) {
  const canManage = viewer.permissions.has("m39.circulation.manage");
  const borrowerProfiles = ofTenant(mockDb.roleProfiles, viewer.tenantId).filter((row) =>
    isBorrowerProfile(row.kind),
  );
  const allBorrowerIds = new Set(borrowerProfiles.map((row) => row.id));
  const ownProfileIds = new Set(
    borrowerProfiles.filter((row) => row.personId === viewer.personId).map((row) => row.id),
  );
  const peopleById = new Map(ofTenant(mockDb.people, viewer.tenantId).map((row) => [row.id, row]));
  const minorChildPersonIds = new Set<string>();
  for (const rel of ofTenant(mockDb.guardianRelationships, viewer.tenantId)) {
    if (rel.guardianPersonId === viewer.personId && peopleById.get(rel.learnerPersonId)?.isMinor) {
      minorChildPersonIds.add(rel.learnerPersonId);
    }
  }
  const minorChildProfileIds = new Set(
    borrowerProfiles
      .filter((row) => row.kind === "learner" && minorChildPersonIds.has(row.personId))
      .map((row) => row.id),
  );

  const allowedForLoansAndFines = canManage
    ? allBorrowerIds
    : new Set([...ownProfileIds, ...minorChildProfileIds]);
  const allowedForHistory = canManage ? allBorrowerIds : ownProfileIds;

  const checkBorrower = (allowed: ReadonlySet<string>, id: string | null) => {
    if (id !== null && !allowed.has(id)) throw new ApiFailure("not_found");
  };

  return {
    canManage,
    ownProfileIds,
    minorChildProfileIds,
    allowedForLoansAndFines,
    allowedForHistory,
    checkBorrower,
  };
}

export const m39Handlers = [
  get("/catalogue-records", LIB, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.catalogueRecords, ctx.viewer.tenantId),
      pageSchema(CatalogueRecordSchema),
    ),
  ),
  get("/catalogue-records/:id", LIB, (ctx) =>
    ok(
      CatalogueRecordSchema,
      found(
        ofTenant(mockDb.catalogueRecords, ctx.viewer.tenantId).find(
          (row) => row.id === ctx.params["id"],
        ),
      ),
    ),
  ),
  get("/library-copies", LIB, (ctx) => {
    const recordId = param(ctx.url, "recordId");
    if (recordId !== null) {
      const exists = ofTenant(mockDb.catalogueRecords, ctx.viewer.tenantId).some(
        (row) => row.id === recordId,
      );
      if (!exists) throw new ApiFailure("not_found");
    }
    const rows = ofTenant(mockDb.libraryCopies, ctx.viewer.tenantId).filter(
      (row) => recordId === null || row.recordId === recordId,
    );
    return list(ctx, rows, pageSchema(LibraryCopySchema));
  }),
  get("/loans", LIB, (ctx) => {
    const {
      canManage,
      ownProfileIds,
      minorChildProfileIds,
      allowedForLoansAndFines,
      checkBorrower,
    } = m39Scope(ctx.viewer);
    const borrowerProfileId = param(ctx.url, "borrowerProfileId");
    checkBorrower(allowedForLoansAndFines, borrowerProfileId);
    const rows = ofTenant(mockDb.libraryLoans, ctx.viewer.tenantId).filter(
      (row) =>
        (borrowerProfileId === null || row.borrowerProfileId === borrowerProfileId) &&
        (canManage ||
          ownProfileIds.has(row.borrowerProfileId) ||
          (minorChildProfileIds.has(row.borrowerProfileId) && isCurrentLoan(row))),
    );
    return list(ctx, rows, pageSchema(LoanSchema));
  }),
  get("/holds", LIB, (ctx) => {
    const { allowedForHistory, checkBorrower } = m39Scope(ctx.viewer);
    const borrowerProfileId = param(ctx.url, "borrowerProfileId");
    checkBorrower(allowedForHistory, borrowerProfileId);
    const rows = ofTenant(mockDb.libraryHolds, ctx.viewer.tenantId).filter(
      (row) =>
        allowedForHistory.has(row.borrowerProfileId) &&
        (borrowerProfileId === null || row.borrowerProfileId === borrowerProfileId),
    );
    return list(ctx, rows, pageSchema(HoldSchema));
  }),
  get("/library-fines", LIB, (ctx) => {
    const { allowedForLoansAndFines, checkBorrower } = m39Scope(ctx.viewer);
    const borrowerProfileId = param(ctx.url, "borrowerProfileId");
    checkBorrower(allowedForLoansAndFines, borrowerProfileId);
    const rows = ofTenant(mockDb.libraryFines, ctx.viewer.tenantId).filter(
      (row) =>
        allowedForLoansAndFines.has(row.borrowerProfileId) &&
        (borrowerProfileId === null || row.borrowerProfileId === borrowerProfileId),
    );
    return list(ctx, rows, pageSchema(LibraryFineSchema));
  }),
  get("/reading-recommendations", LIB, (ctx) => {
    const { allowedForHistory, checkBorrower } = m39Scope(ctx.viewer);
    const borrowerProfileId = param(ctx.url, "borrowerProfileId");
    checkBorrower(allowedForHistory, borrowerProfileId);
    const rows = ofTenant(mockDb.readingRecommendations, ctx.viewer.tenantId).filter(
      (row) =>
        allowedForHistory.has(row.borrowerProfileId) &&
        (borrowerProfileId === null || row.borrowerProfileId === borrowerProfileId),
    );
    return list(ctx, rows, pageSchema(ReadingRecommendationSchema));
  }),
];
