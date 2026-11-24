import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("selects lines from the newest journal entry", async () => {
  const entries = mockDb.journalEntries.filter((x) => x.tenantId === TENANT.riverside);
  const newest = [...entries].sort(
    (a, b) => b.postedOn.localeCompare(a.postedOn) || b.createdAt.localeCompare(a.createdAt),
  )[0]!;
  renderApp("/accounting", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Journal" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  const detail = (await screen.findByText(newest.reference)).closest("details")!;
  expect(detail).toEqual(document.querySelector("details"));
  fireEvent.click(within(detail).getByText(newest.reference));
  const line = newest.lines[0]!;
  const acct = mockDb.ledgerAccounts.find((item) => item.id === line.accountId)!;
  expect(within(detail).getAllByText(`${acct.code} — ${acct.name}`)[0]).toBeInTheDocument();
});
