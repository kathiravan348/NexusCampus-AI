import { TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openForms() {
  renderApp("/forms", { modules: MODULES, as: persona(TENANT.littleSteps, "admin") });
  const tab = await screen.findByRole("tab", { name: "Forms" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

it("retries a failed list and shows the number of fields in each form", async () => {
  server.use(http.get("*/api/v1/forms", () => new HttpResponse(null, { status: 500 })));
  await openForms();
  const retry = await screen.findByRole("button", { name: "Try again" });
  server.resetHandlers();
  fireEvent.click(retry);
  const form = mockDb.formDefinitions.find((row) => row.tenantId === TENANT.littleSteps)!;
  expect(await screen.findByText(form.name)).toBeVisible();
  expect(
    screen.getByText(
      `${form.fieldKeys.length} ${form.fieldKeys.length === 1 ? "field" : "fields"}`,
    ),
  ).toBeVisible();
});

it("shows the empty list state", async () => {
  mockDb.formDefinitions.splice(0);
  await openForms();
  expect(await screen.findByText("No forms")).toBeVisible();
});
