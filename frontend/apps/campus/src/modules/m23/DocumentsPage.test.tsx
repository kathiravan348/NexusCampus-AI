import { LEARNER, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("filters issued documents by learner and kind for staff", async () => {
  const base = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.riverside)!;
  const secondLearner = mockDb.learners.find(
    (row) => row.tenantId === TENANT.riverside && row.id !== base.learnerId,
  )!;
  mockDb.issuedDocuments.push(
    {
      ...base,
      id: "doc-rv-bonafide",
      learnerId: secondLearner.id,
      kind: "bonafide",
      number: "DOC-RV-2026-0002",
      verificationCode: "NXRV20260002",
    },
    {
      ...base,
      id: "doc-rv-letter",
      learnerId: null,
      kind: "letter",
      number: "DOC-RV-2026-0003",
      verificationCode: "NXRV20260003",
    },
  );
  renderApp("/documents", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  const list = () => within(screen.getByRole("list", { name: "Issued documents" }));
  await waitFor(() => expect(list().getAllByRole("button")).toHaveLength(3));
  expect(screen.getByTestId("last-synced")).toBeVisible();

  fireEvent.change(screen.getByLabelText("Document kind"), { target: { value: "bonafide" } });
  expect(list().getAllByRole("button")).toHaveLength(1);
  expect(list().getByText("Bonafide certificate")).toBeVisible();

  fireEvent.change(screen.getByLabelText("Document kind"), { target: { value: "" } });
  expect(list().getAllByRole("button")).toHaveLength(3);

  fireEvent.change(screen.getByLabelText("Learner"), { target: { value: secondLearner.id } });
  expect(list().getAllByRole("button")).toHaveLength(1);
  fireEvent.click(list().getAllByRole("button")[0]!);
  expect(await screen.findByRole("button", { name: "Back to issued documents" })).toBeVisible();
});

it("shows only family documents to guardians and omits staff filters", async () => {
  const base = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.littleSteps)!;
  base.learnerId = LEARNER.lsRohan;
  mockDb.issuedDocuments.push(
    {
      ...base,
      id: "doc-ls-second-child",
      learnerId: LEARNER.lsIshaan,
      number: "DOC-LS-2026-0002",
      verificationCode: "NXLS20260002",
    },
    {
      ...base,
      id: "doc-ls-other-family",
      learnerId: LEARNER.lsKavya,
      number: "DOC-LS-2026-0003",
      verificationCode: "NXLS20260003",
    },
    {
      ...base,
      id: "doc-ls-staff-letter",
      learnerId: null,
      kind: "letter",
      number: "DOC-LS-2026-0004",
      verificationCode: "NXLS20260004",
    },
  );
  renderApp("/documents", { as: persona(TENANT.littleSteps, "guardian"), modules: MODULES });
  const list = () => within(screen.getByRole("list", { name: "Issued documents" }));
  await waitFor(() => expect(list().getAllByRole("button")).toHaveLength(2));
  expect(screen.queryByLabelText("Document kind")).toBeNull();
  expect(list().queryByText("Staff letter")).toBeNull();
  fireEvent.change(screen.getByLabelText("Learner"), { target: { value: LEARNER.lsRohan } });
  expect(list().getAllByRole("button")).toHaveLength(1);
});

it("hides the learner filter for one child and reports unavailable links", async () => {
  server.use(
    http.get("*/api/v1/learners", () =>
      HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
    ),
  );
  const base = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.littleSteps)!;
  base.learnerId = LEARNER.lsRohan;
  renderApp("/documents?document=missing-doc", {
    as: persona(TENANT.littleSteps, "guardian"),
    modules: MODULES,
  });
  expect(await screen.findByText("Document unavailable")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back to issued documents" }));
  expect(await screen.findByRole("list", { name: "Issued documents" })).toBeVisible();
  expect(screen.queryByLabelText("Learner")).toBeNull();
});

it("shows the no-access screen when the viewer has no document access", async () => {
  renderApp("/documents", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
  expect(await screen.findByText("No access")).toBeVisible();
});
