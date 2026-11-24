import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("shows approval step counts and preserves the numbering pattern", async () => {
  const tenant = TENANT.littleSteps;
  renderApp("/forms", { modules: MODULES, as: persona(tenant, "admin") });
  const tab = await screen.findByRole("tab", { name: "Workflows & numbering" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  const workflow = mockDb.workflowDefinitions.find((row) => row.tenantId === tenant)!;
  const format = mockDb.numberingFormats.find((row) => row.tenantId === tenant)!;
  expect(await screen.findByText(workflow.name)).toBeVisible();
  expect(
    screen.getByText(`${workflow.steps.length} ${workflow.steps.length === 1 ? "step" : "steps"}`),
  ).toBeVisible();
  expect(await screen.findByText(format.pattern)).toBeVisible();
});
