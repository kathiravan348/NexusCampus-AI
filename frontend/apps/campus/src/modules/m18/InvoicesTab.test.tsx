import { FEE_INVOICE, TENANT } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { InvoicesTab } from "./InvoicesTab";

function renderInvoices(pendingInvoiceIds?: ReadonlySet<string>) {
  signInAs(persona(TENANT.riverside, "admin"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <InvoicesTab pendingInvoiceIds={pendingInvoiceIds} />
    </AppProviders>,
  );
}

describe("InvoicesTab (M18)", () => {
  it("lists invoices with formatted money, status filter and expandable lines", async () => {
    renderInvoices(new Set([FEE_INVOICE.rv[1]]));

    expect(await screen.findByText("RV-INV-2026-0001")).toBeInTheDocument();
    const partRow = screen.getByText("RV-INV-2026-0002").closest("li")!;
    expect(within(partRow).getByText("Part paid")).toBeInTheDocument();
    expect(within(partRow).getByText("Waiting to sync")).toBeInTheDocument();
    expect(within(partRow).getByText("£1,400.00")).toBeInTheDocument();
    expect(within(partRow).getByText("£1,200.00")).toBeInTheDocument();
    expect(within(partRow).getByText("£200.00")).toBeInTheDocument();

    const toggle = within(partRow).getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(partRow).getByText("Term tuition instalment")).toBeInTheDocument();
    expect(within(partRow).getByText("Term activity fee")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "paid" } });
    await waitFor(() => {
      expect(screen.queryByText("RV-INV-2026-0002")).not.toBeInTheDocument();
      expect(screen.getByText("RV-INV-2026-0001")).toBeInTheDocument();
    });
  });

  it("shows invoice numbers only when directory names are unavailable", async () => {
    server.use(
      http.get("*/api/v1/people", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
      ),
    );
    renderInvoices();

    expect(await screen.findByText("RV-INV-2026-0001")).toBeInTheDocument();
    const row = screen.getByText("RV-INV-2026-0001").closest("li")!;
    expect(within(row).getByText("Paid", { selector: "span" })).toBeInTheDocument();
    expect(row.querySelectorAll("p")).toHaveLength(2);
  });
});
