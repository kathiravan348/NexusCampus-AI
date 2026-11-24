import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("renders the account, currency and total for a budget", async () => {
  const budget = mockDb.budgets.find((b) => b.tenantId === TENANT.riverside)!;
  const line = budget.lines[0]!;
  const acc = mockDb.ledgerAccounts.find((a) => a.id === line.accountId)!;
  renderApp("/accounting", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Budgets" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  expect((await screen.findAllByText(`${acc.code} — ${acc.name}`)).length).toBeGreaterThan(0);
  const message = await screen.findAllByText(new RegExp(budget.currency));
  expect(message.length).toBeGreaterThan(0);
  expect(screen.getAllByText("Total", { exact: false }).length).toBeGreaterThan(0);
});
