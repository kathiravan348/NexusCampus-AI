import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("orders fields, falls back to the first available label, and separates archived fields", async () => {
  const base = mockDb.customFieldDefinitions.find((row) => row.tenantId === TENANT.riverside)!;
  const examples = [
    { id: "staff-later", order: 2, label: { "en-GB": "Later field" } },
    { id: "staff-first", order: 1, label: { fr: "Premier champ" } },
    { id: "staff-old", order: 0, label: { "en-GB": "Old field" } },
  ] as const;
  for (const example of examples) {
    mockDb.customFieldDefinitions.push({
      ...base,
      ...example,
      entity: "staff",
      key: `staff${example.order}`,
      sensitive: true,
      required: true,
      archived: example.order === 0,
    });
  }
  renderApp("/forms", { modules: MODULES, as: persona(TENANT.riverside, "teacher") });
  fireEvent.change(await screen.findByLabelText("Record type"), { target: { value: "staff" } });
  const first = await screen.findByText("Premier champ");
  const later = screen.getByText("Later field");
  expect(first.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const card = within(first.closest("li")!);
  expect(card.getByText("Required")).toBeVisible();
  expect(card.getByText("Sensitive")).toBeVisible();
  const archived = screen.getByRole("heading", { name: "Archived" }).closest("section")!;
  expect(within(archived).getByText("Old field")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Add custom field" })).toBeNull();
});
