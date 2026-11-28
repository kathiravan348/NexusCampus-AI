import {
  CatalogueRecordSchema,
  HoldSchema,
  LibraryCopySchema,
  LibraryFineSchema,
  LoanSchema,
  ReadingRecommendationSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import {
  CATALOGUE_RECORD,
  LEARNER,
  LIBRARY_FINE,
  LIBRARY_HOLD,
  LIBRARY_LOAN,
  TENANT,
  USER,
} from "../fixtures";
import { server } from "../node";
import type { Parser } from "./route";

const rv = TENANT.riverside;
const nb = TENANT.northbridge;

function get(path: string, userId: string = USER.rvHelen, tenantId: string = rv) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function borrowerOf(learnerId: string): string {
  return mockDb.learners.find((row) => row.id === learnerId)!.roleProfileId;
}

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  expect(response.status).toBe(200);
  return schema.parse(await response.json());
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M39 read handlers", () => {
  it("serves all M39 endpoints and filters to a circulation manager", async () => {
    const miaProfile = borrowerOf(LEARNER.rvMia);

    const records = await parse(await get("/catalogue-records"), pageSchema(CatalogueRecordSchema));
    expect(records.items).toEqual(mockDb.catalogueRecords.filter((row) => row.tenantId === rv));

    const record = await parse(
      await get(`/catalogue-records/${CATALOGUE_RECORD.rvPonds}`),
      CatalogueRecordSchema,
    );
    expect(record.id).toBe(CATALOGUE_RECORD.rvPonds);

    const copies = await parse(
      await get(`/library-copies?recordId=${CATALOGUE_RECORD.rvPonds}`),
      pageSchema(LibraryCopySchema),
    );
    expect(copies.items).toEqual(
      mockDb.libraryCopies.filter(
        (row) => row.tenantId === rv && row.recordId === CATALOGUE_RECORD.rvPonds,
      ),
    );

    const loans = await parse(await get("/loans"), pageSchema(LoanSchema));
    expect(loans.items).toEqual(mockDb.libraryLoans.filter((row) => row.tenantId === rv));

    const miaLoans = await parse(
      await get(`/loans?borrowerProfileId=${miaProfile}`),
      pageSchema(LoanSchema),
    );
    expect(miaLoans.items.map((row) => row.id)).toEqual([LIBRARY_LOAN.rvReturned]);

    const holds = await parse(await get("/holds"), pageSchema(HoldSchema));
    expect(holds.items).toEqual(mockDb.libraryHolds.filter((row) => row.tenantId === rv));

    const fines = await parse(await get("/library-fines"), pageSchema(LibraryFineSchema));
    expect(fines.items).toEqual(mockDb.libraryFines.filter((row) => row.tenantId === rv));

    const recs = await parse(
      await get("/reading-recommendations"),
      pageSchema(ReadingRecommendationSchema),
    );
    expect(recs.items).toEqual(mockDb.readingRecommendations.filter((row) => row.tenantId === rv));
  });

  it("limits a learner to own loans (all states), holds, fines and recommendations", async () => {
    const jordanProfile = borrowerOf(LEARNER.nbJordan);
    const aidenProfile = borrowerOf(LEARNER.nbAiden);

    const loans = await parse(await get("/loans", USER.nbJordan, nb), pageSchema(LoanSchema));
    expect(loans.items.map((row) => row.id)).toEqual([LIBRARY_LOAN.nbReturned]);

    const holds = await parse(await get("/holds", USER.nbJordan, nb), pageSchema(HoldSchema));
    expect(holds.items.map((row) => row.id)).toEqual([
      LIBRARY_HOLD.nbCancelled,
      LIBRARY_HOLD.nbExpired,
    ]);

    const fines = await parse(
      await get("/library-fines", USER.nbJordan, nb),
      pageSchema(LibraryFineSchema),
    );
    expect(fines.items.map((row) => row.id)).toEqual([LIBRARY_FINE.nbPaid]);

    const recs = await parse(
      await get("/reading-recommendations", USER.nbJordan, nb),
      pageSchema(ReadingRecommendationSchema),
    );
    expect(recs.items).toHaveLength(1);
    expect(recs.items[0]?.borrowerProfileId).toBe(jordanProfile);

    for (const path of ["/loans", "/holds", "/library-fines", "/reading-recommendations"]) {
      const res = await get(`${path}?borrowerProfileId=${aidenProfile}`, USER.nbJordan, nb);
      expect(res.status).toBe(404);
    }
  });

  it("limits guardians to own minor children's current loans and fines only (G-6)", async () => {
    const miaProfile = borrowerOf(LEARNER.rvMia);
    const oliverProfile = borrowerOf(LEARNER.rvOliver);
    const leoProfile = borrowerOf(LEARNER.rvLeo);

    const baseActive = mockDb.libraryLoans.find((row) => row.id === LIBRARY_LOAN.rvActive)!;
    const miaActive = {
      ...baseActive,
      id: "lln-rv-mia-active",
      borrowerProfileId: miaProfile,
      status: "active" as const,
      returnedAt: null,
    };
    const oliverOverdue = {
      ...baseActive,
      id: "lln-rv-oliver-overdue",
      borrowerProfileId: oliverProfile,
      status: "overdue" as const,
      returnedAt: null,
    };
    const miaLost = {
      ...baseActive,
      id: "lln-rv-mia-lost",
      borrowerProfileId: miaProfile,
      status: "lost" as const,
      returnedAt: null,
    };
    mockDb.libraryLoans.push(miaActive, oliverOverdue, miaLost);

    const baseFine = mockDb.libraryFines.find((row) => row.id === LIBRARY_FINE.rvWaived)!;
    const miaFine = {
      ...baseFine,
      id: "lfn-rv-mia-open",
      loanId: miaActive.id,
      borrowerProfileId: miaProfile,
      status: "open" as const,
      waivedByStaffProfileId: null,
      waiveReason: null,
    };
    mockDb.libraryFines.push(miaFine);

    // Catalogue remains readable.
    expect((await get("/catalogue-records", USER.rvGrace)).status).toBe(200);

    // Current loans only (active + overdue) for own minor children; never returned or lost.
    const loans = await parse(await get("/loans", USER.rvGrace), pageSchema(LoanSchema));
    expect(loans.items.map((row) => row.id)).toEqual([miaActive.id, oliverOverdue.id]);

    const miaOnly = await parse(
      await get(`/loans?borrowerProfileId=${miaProfile}`, USER.rvGrace),
      pageSchema(LoanSchema),
    );
    expect(miaOnly.items.map((row) => row.id)).toEqual([miaActive.id]);
    expect((await get(`/loans?borrowerProfileId=${leoProfile}`, USER.rvGrace)).status).toBe(404);

    // Fines for own minor children only; another child's borrowerProfileId -> 404.
    const fines = await parse(
      await get("/library-fines", USER.rvGrace),
      pageSchema(LibraryFineSchema),
    );
    expect(fines.items.map((row) => row.id)).toEqual([miaFine.id]);
    const otherFines = await get(`/library-fines?borrowerProfileId=${leoProfile}`, USER.rvGrace);
    expect(otherFines.status).toBe(404);

    // Never holds or reading recommendations for minor children.
    const holds = await parse(await get("/holds", USER.rvGrace), pageSchema(HoldSchema));
    expect(holds.items).toEqual([]);
    expect((await get(`/holds?borrowerProfileId=${miaProfile}`, USER.rvGrace)).status).toBe(404);
    expect((await get(`/holds?borrowerProfileId=${leoProfile}`, USER.rvGrace)).status).toBe(404);

    const recs = await parse(
      await get("/reading-recommendations", USER.rvGrace),
      pageSchema(ReadingRecommendationSchema),
    );
    expect(recs.items).toEqual([]);
    const miaRecs = await get(
      `/reading-recommendations?borrowerProfileId=${miaProfile}`,
      USER.rvGrace,
    );
    expect(miaRecs.status).toBe(404);
    const leoRecs = await get(
      `/reading-recommendations?borrowerProfileId=${leoProfile}`,
      USER.rvGrace,
    );
    expect(leoRecs.status).toBe(404);

    // Guardian of an adult learner (Northbridge Marcus -> Jordan) cannot see adult child's loans.
    const jordanProfile = borrowerOf(LEARNER.nbJordan);
    const marcusLoans = await parse(await get("/loans", USER.nbMarcus, nb), pageSchema(LoanSchema));
    expect(marcusLoans.items.map((row) => row.id)).toEqual([LIBRARY_LOAN.nbOverdue]);
    const adultLoans = await get(`/loans?borrowerProfileId=${jordanProfile}`, USER.nbMarcus, nb);
    expect(adultLoans.status).toBe(404);
  });

  it("limits a teacher without circulation.manage to own rows only", async () => {
    const leoProfile = borrowerOf(LEARNER.rvLeo);

    const loans = await parse(await get("/loans", USER.rvTom), pageSchema(LoanSchema));
    expect(loans.items.map((row) => row.id)).toEqual([LIBRARY_LOAN.rvDamaged]);

    const holds = await parse(await get("/holds", USER.rvTom), pageSchema(HoldSchema));
    expect(holds.items.map((row) => row.id)).toEqual([LIBRARY_HOLD.rvReady]);

    const fines = await parse(
      await get("/library-fines", USER.rvTom),
      pageSchema(LibraryFineSchema),
    );
    expect(fines.items.map((row) => row.id)).toEqual([LIBRARY_FINE.rvWaived]);

    const recs = await parse(
      await get("/reading-recommendations", USER.rvTom),
      pageSchema(ReadingRecommendationSchema),
    );
    expect(recs.items).toEqual([]);

    for (const path of ["/loans", "/holds", "/library-fines", "/reading-recommendations"]) {
      const res = await get(`${path}?borrowerProfileId=${leoProfile}`, USER.rvTom);
      expect(res.status).toBe(404);
    }
  });

  it("returns 404 for another tenant's IDs", async () => {
    const jordanProfile = borrowerOf(LEARNER.nbJordan);
    for (const route of [
      `/catalogue-records/${CATALOGUE_RECORD.nbAlgorithms}`,
      `/library-copies?recordId=${CATALOGUE_RECORD.nbAlgorithms}`,
      `/loans?borrowerProfileId=${jordanProfile}`,
      `/holds?borrowerProfileId=${jordanProfile}`,
      `/library-fines?borrowerProfileId=${jordanProfile}`,
      `/reading-recommendations?borrowerProfileId=${jordanProfile}`,
    ]) {
      expect((await get(route)).status).toBe(404);
    }
  });

  it("requires M39 permission and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    const forbidden = await get("/catalogue-records");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== rv || row.moduleId !== "M39",
    );
    const disabled = await get("/catalogue-records");
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
