import { TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("uses the learner number when directory names are unavailable and opens a card", async () => {
  server.use(
    http.get("*/api/v1/people", () =>
      HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
    ),
  );
  const card = mockDb.reportCards.find(
    (c) => c.tenantId === TENANT.riverside && c.status === "published",
  )!;
  const learner = mockDb.learners.find((l) => l.id === card.learnerId)!;
  renderApp("/report-cards", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  const list = within(await screen.findByRole("list", { name: "Report cards" }));
  const rows = await list.findAllByRole("button", { name: new RegExp(learner.learnerNumber) });
  const row = rows.find((button) => within(button).queryByText("Published"))!;
  expect(row).toHaveTextContent("Term");
  expect(row).not.toHaveTextContent(card.academicYearId);
  fireEvent.click(row);
  expect(await screen.findByRole("button", { name: "Back to report cards" })).toBeVisible();
});
