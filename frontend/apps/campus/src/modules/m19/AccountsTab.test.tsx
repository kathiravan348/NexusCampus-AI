import { TENANT, mockDb } from "@nexus/mocks";
import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("shows the active account tree and distinguishes an inactive child", async () => {
  const root = mockDb.ledgerAccounts.find((a) => a.tenantId === TENANT.riverside && a.parentId === null)!;
  const child = { ...root, id: "acct-child-demo", parentId: root.id, name: "Old account", active: false };
  mockDb.ledgerAccounts.push(child);
  renderApp("/accounting", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  const parent = await screen.findByText(`${root.code} — ${root.name}`);
  const ownList = within(parent.closest("li")!).getByRole("list");
  expect(within(ownList).getByText(`${child.code} — ${child.name}`)).toBeInTheDocument();
  expect(within(ownList).getByText("Inactive")).toBeInTheDocument();
});
