import {
  LearnerMediaConsentSchema,
  MediaItemSchema,
  PortfolioEntrySchema,
  PortfolioExportSchema,
  PortfolioSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import {
  LEARNER,
  MEDIA_ITEM,
  MEDIA_SHARING_CONSENTS,
  PERSON,
  PORTFOLIO,
  PORTFOLIO_ENTRY,
  TENANT,
  USER,
} from "../fixtures";
import { roleId, type SystemRoleKey } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";

const ls = TENANT.littleSteps;

function get(path: string, userId: string = USER.lsPriya, tenantId: string = ls) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function signInAs(tenantId: string, userId: string, personId: string, role: SystemRoleKey) {
  const user = mockDb.users.find((row) => row.id === userId)!;
  user.personId = personId;
  const assignment = mockDb.roleAssignments.find((row) => row.userId === user.id)!;
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== user.id);
  mockDb.roleAssignments.push({ ...assignment, roleId: roleId(tenantId, role) });
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

describe("M91 read handlers", () => {
  it("merges media-sharing consents and serves all M91 endpoints to an admin", async () => {
    for (const consent of MEDIA_SHARING_CONSENTS) {
      expect(mockDb.consents.some((row) => row.id === consent.id)).toBe(true);
    }

    const lsMedia = mockDb.mediaItems.filter((row) => row.tenantId === ls);
    const deletedMedia = { ...lsMedia[0]!, id: "mdi-ls-deleted", status: "deleted" as const };
    mockDb.mediaItems.push(deletedMedia);

    const media = await parse(await get("/media-items"), pageSchema(MediaItemSchema));
    expect(media.items).toEqual(lsMedia);
    expect(media.items.some((row) => row.id === deletedMedia.id)).toBe(false);

    const consents = await parse(
      await get("/learner-media-consents"),
      pageSchema(LearnerMediaConsentSchema),
    );
    expect(consents.items).toEqual(
      mockDb.learnerMediaConsents.filter((row) => row.tenantId === ls),
    );
    const byLearner = await parse(
      await get(`/learner-media-consents?learnerId=${LEARNER.lsIshaan}`),
      pageSchema(LearnerMediaConsentSchema),
    );
    expect(byLearner.items).toEqual(
      mockDb.learnerMediaConsents.filter(
        (row) => row.tenantId === ls && row.learnerId === LEARNER.lsIshaan,
      ),
    );

    const portfolios = await parse(await get("/portfolios"), pageSchema(PortfolioSchema));
    expect(portfolios.items).toEqual(mockDb.portfolios.filter((row) => row.tenantId === ls));

    const portfolio = await parse(await get(`/portfolios/${PORTFOLIO.lsIshaan}`), PortfolioSchema);
    expect(portfolio.id).toBe(PORTFOLIO.lsIshaan);

    const entries = await parse(
      await get(`/portfolios/${PORTFOLIO.lsIshaan}/entries`),
      pageSchema(PortfolioEntrySchema),
    );
    expect(entries.items).toEqual(
      mockDb.portfolioEntries.filter((row) => row.portfolioId === PORTFOLIO.lsIshaan),
    );

    const exportsPage = await parse(
      await get(`/portfolios/${PORTFOLIO.lsIshaan}/exports`),
      pageSchema(PortfolioExportSchema),
    );
    expect(exportsPage.items).toEqual(
      mockDb.portfolioExports.filter((row) => row.portfolioId === PORTFOLIO.lsIshaan),
    );
  });

  it("hides staff-only portfolios, uncleared media and withdrawn consent", async () => {
    const ishaan = mockDb.learners.find((row) => row.id === LEARNER.lsIshaan)!;
    const rel = mockDb.guardianRelationships.find(
      (row) => row.tenantId === ls && row.learnerPersonId === ishaan.personId,
    )!;
    const basePortfolio = mockDb.portfolios.find((row) => row.id === PORTFOLIO.lsIshaan)!;
    const staffOnly = {
      ...basePortfolio,
      id: "pfl-ls-staff-only",
      visibility: "staff_only" as const,
    };
    const kavyaPortfolio = {
      ...basePortfolio,
      id: "pfl-ls-kavya",
      learnerId: LEARNER.lsKavya,
    };
    mockDb.portfolios.push(staffOnly, kavyaPortfolio);

    const baseEntry = mockDb.portfolioEntries.find((row) => row.id === PORTFOLIO_ENTRY.media)!;
    const blockedEntry = {
      ...baseEntry,
      id: "pfe-ls-blocked-media",
      refId: MEDIA_ITEM.lsGroup,
    };
    mockDb.portfolioEntries.push(blockedEntry);

    signInAs(ls, USER.lsPriya, rel.guardianPersonId, "guardian");

    for (const route of ["/media-items", "/learner-media-consents"]) {
      const res = await get(route);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
    }

    const portfolios = await parse(await get("/portfolios"), pageSchema(PortfolioSchema));
    expect(portfolios.items.map((row) => row.id)).toEqual([PORTFOLIO.lsIshaan]);
    expect((await get(`/portfolios?learnerId=${LEARNER.lsKavya}`)).status).toBe(404);
    expect((await get(`/portfolios/${staffOnly.id}`)).status).toBe(404);
    expect((await get(`/portfolios/${staffOnly.id}/entries`)).status).toBe(404);
    expect((await get(`/portfolios/${staffOnly.id}/exports`)).status).toBe(404);
    expect((await get(`/portfolios/${kavyaPortfolio.id}`)).status).toBe(404);

    const entries = await parse(
      await get(`/portfolios/${PORTFOLIO.lsIshaan}/entries`),
      pageSchema(PortfolioEntrySchema),
    );
    expect(entries.items.map((row) => row.id)).toEqual([
      PORTFOLIO_ENTRY.media,
      PORTFOLIO_ENTRY.observation,
    ]);
    expect(entries.items.some((row) => row.id === blockedEntry.id)).toBe(false);

    // Withdrawing media consent hides the previously cleared media entry at once.
    const ishaanMediaConsent = mockDb.learnerMediaConsents.find(
      (row) => row.tenantId === ls && row.learnerId === LEARNER.lsIshaan,
    )!;
    const sourceConsent = mockDb.consents.find((row) => row.id === ishaanMediaConsent.consentId)!;
    sourceConsent.status = "withdrawn";

    const afterWithdrawal = await parse(
      await get(`/portfolios/${PORTFOLIO.lsIshaan}/entries`),
      pageSchema(PortfolioEntrySchema),
    );
    expect(afterWithdrawal.items.map((row) => row.id)).toEqual([PORTFOLIO_ENTRY.observation]);
  });

  it("denies learners on media endpoints and limits them to own shared portfolios", async () => {
    const basePortfolio = mockDb.portfolios.find((row) => row.id === PORTFOLIO.lsIshaan)!;
    const staffOnly = {
      ...basePortfolio,
      id: "pfl-ls-staff-only",
      visibility: "staff_only" as const,
    };
    const kavyaPortfolio = {
      ...basePortfolio,
      id: "pfl-ls-kavya",
      learnerId: LEARNER.lsKavya,
    };
    mockDb.portfolios.push(staffOnly, kavyaPortfolio);

    signInAs(ls, USER.lsPriya, PERSON.lsIshaan, "learner");

    for (const route of ["/media-items", "/learner-media-consents"]) {
      const res = await get(route);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
    }

    const portfolios = await parse(await get("/portfolios"), pageSchema(PortfolioSchema));
    expect(portfolios.items.map((row) => row.id)).toEqual([PORTFOLIO.lsIshaan]);
    expect((await get(`/portfolios/${staffOnly.id}`)).status).toBe(404);
    expect((await get(`/portfolios/${kavyaPortfolio.id}`)).status).toBe(404);
    expect((await get(`/portfolios?learnerId=${LEARNER.lsKavya}`)).status).toBe(404);

    const entries = await parse(
      await get(`/portfolios/${PORTFOLIO.lsIshaan}/entries`),
      pageSchema(PortfolioEntrySchema),
    );
    expect(entries.items.map((row) => row.id)).toEqual([
      PORTFOLIO_ENTRY.media,
      PORTFOLIO_ENTRY.observation,
    ]);
  });

  it("returns 404 for another tenant's learner and portfolio IDs", async () => {
    for (const route of [
      `/learner-media-consents?learnerId=${LEARNER.rvMia}`,
      `/portfolios?learnerId=${LEARNER.rvMia}`,
      `/portfolios/${PORTFOLIO.rvMia}`,
      `/portfolios/${PORTFOLIO.rvMia}/entries`,
      `/portfolios/${PORTFOLIO.rvMia}/exports`,
    ]) {
      expect((await get(route)).status).toBe(404);
    }
  });

  it("requires M91 permissions and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    const forbidden = await get("/portfolios");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== ls || row.moduleId !== "M91",
    );
    const disabled = await get("/portfolios");
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
