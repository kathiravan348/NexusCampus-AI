import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openAudit() {
  renderApp("/privacy", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
  const table = await screen.findByRole("table", { name: "Audit events" });
  await within(table).findAllByRole("button");
  return table;
}

describe("AuditTab", () => {
  it("narrows rows with the action filter", async () => {
    const table = await openAudit();
    const before = within(table).getAllByRole("button").length;
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "m02.person.updated" } });
    await waitFor(() => {
      const actions = within(table)
        .getAllByRole("button")
        .map((b) => b.textContent);
      expect(actions.every((a) => a === "m02.person.updated")).toBe(true);
    });
    const after = within(table).getAllByRole("button").length;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it("shows changed field names with a sensitive badge, never values", async () => {
    const table = await openAudit();
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "m02.person.updated" } });
    await waitFor(() =>
      expect(
        within(table)
          .getAllByRole("button")
          .every((b) => b.textContent === "m02.person.updated"),
      ).toBe(true),
    );
    fireEvent.click(within(table).getAllByRole("button")[0]!);
    const dialog = await screen.findByRole("dialog", { name: "m02.person.updated" });
    expect(within(dialog).getByText("person.dateOfBirth")).toBeInTheDocument();
    expect(within(dialog).getByText("Sensitive")).toBeInTheDocument();
    expect(within(dialog).getByText(/never the values/)).toBeInTheDocument();
  });
});
