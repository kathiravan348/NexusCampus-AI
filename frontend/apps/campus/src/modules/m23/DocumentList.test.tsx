import { TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("shows learner numbers, staff letters, revoked badges and opens details", async () => {
  server.use(
    http.get("*/api/v1/people", () =>
      HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
    ),
  );
  const doc = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.riverside)!;
  doc.revoked = true;
  doc.revokedReason = "Superseded";
  const learner = mockDb.learners.find((row) => row.id === doc.learnerId)!;
  mockDb.issuedDocuments.push({
    ...doc,
    id: "doc-rv-staff-letter",
    learnerId: null,
    kind: "letter",
    number: "DOC-RV-2026-0099",
    verificationCode: "NXRV20260099",
    revoked: false,
    revokedReason: null,
  });

  renderApp("/documents", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  const list = within(await screen.findByRole("list", { name: "Issued documents" }));
  expect(await list.findByText(learner.learnerNumber)).toBeVisible();
  const learnerRow = list.getByRole("button", { name: new RegExp(doc.number) });
  expect(within(learnerRow).getByText("Transfer certificate")).toBeVisible();
  expect(within(learnerRow).getByText(learner.learnerNumber)).toBeVisible();
  expect(within(learnerRow).getByText("Revoked")).toBeVisible();

  const letterRow = list.getByRole("button", { name: /Staff letter/ });
  expect(within(letterRow).getByText("Letter")).toBeVisible();
  expect(within(letterRow).queryByText("Revoked")).toBeNull();
  fireEvent.click(letterRow);
  expect(await screen.findByRole("button", { name: "Back to issued documents" })).toBeVisible();
});

it("shows an empty state when there are no documents", async () => {
  mockDb.issuedDocuments = mockDb.issuedDocuments.filter(
    (row) => row.tenantId !== TENANT.riverside,
  );
  renderApp("/documents", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  expect(await screen.findByText("No issued documents to show")).toBeVisible();
});
