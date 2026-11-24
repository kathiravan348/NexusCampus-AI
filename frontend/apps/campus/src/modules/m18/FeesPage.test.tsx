import { FEE_INVOICE, TENANT, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openFees(role: "admin" | "teacher" | "guardian" | "learner" = "admin") {
  return renderApp("/fees", {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

describe("FeesPage (M18)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("filters invoices and records a cash receipt on an open invoice for an admin", async () => {
    openFees("admin");

    expect(await screen.findByRole("heading", { level: 1, name: "Fees" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.getByRole("tab", { name: "Invoices" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Plans & refunds" })).toBeInTheDocument();

    expect(await screen.findByText("RV-INV-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("RV-INV-2026-0002")).toBeInTheDocument();
    expect(screen.getByText("RV-INV-2026-0003")).toBeInTheDocument();

    const filter = screen.getByLabelText("Filter by status");
    fireEvent.change(filter, { target: { value: "issued" } });
    await waitFor(() => {
      expect(screen.queryByText("RV-INV-2026-0001")).not.toBeInTheDocument();
      expect(screen.getByText("RV-INV-2026-0003")).toBeInTheDocument();
    });

    fireEvent.change(filter, { target: { value: "" } });
    expect(await screen.findByText("RV-INV-2026-0002")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Ask Assist" }));
    const assistDialog = await screen.findByRole("dialog", { name: "Nexus Assist" });
    fireEvent.click(within(assistDialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    const dialog = await screen.findByRole("dialog", { name: "Record payment" });
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: "200" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record receipt" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Record payment" })).not.toBeInTheDocument(),
    );
    const settled = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.rv[1])!;
    expect(settled.status).toBe("paid");
    expect(settled.paid).toBe(settled.total);
    expect(await screen.findByText("RV-INV-2026-0002")).toBeInTheDocument();
    await waitFor(() => {
      const row = screen.getByText("RV-INV-2026-0002").closest("li")!;
      expect(within(row).getByText("Paid", { selector: "span" })).toBeInTheDocument();
      expect(within(row).getByText("£0.00")).toBeInTheDocument();
    });
  });

  it("queues a receipt offline and replays it once when returning online", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    openFees("admin");

    expect(await screen.findByText("RV-INV-2026-0002")).toBeInTheDocument();
    const initialPayments = mockDb.feePayments.length;

    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    const dialog = await screen.findByRole("dialog", { name: "Record payment" });
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: "200" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record receipt" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Record payment" })).not.toBeInTheDocument(),
    );
    const invoiceRow = screen.getByText("RV-INV-2026-0002").closest("li")!;
    expect(await within(invoiceRow).findByText("Waiting to sync")).toBeVisible();
    expect(mockDb.feePayments).toHaveLength(initialPayments);

    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(mockDb.feePayments).toHaveLength(initialPayments + 1));
    await waitFor(() =>
      expect(within(invoiceRow).queryByText("Waiting to sync")).not.toBeInTheDocument(),
    );
    const settled = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.rv[1])!;
    expect(settled.status).toBe("paid");
    expect(settled.paid).toBe(settled.total);
    expect(mockDb.feePayments.at(-1)?.deviceId).toBeTruthy();
  });

  it("limits a guardian to family invoices and hides staff controls", async () => {
    openFees("guardian");

    expect(await screen.findByRole("heading", { level: 1, name: "Fees" })).toBeInTheDocument();
    expect(await screen.findByText("RV-INV-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("RV-INV-2026-0002")).toBeInTheDocument();
    expect(screen.queryByText("RV-INV-2026-0003")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Plans & refunds" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });

  it("shows No access when a teacher opens the Fees screen", async () => {
    openFees("teacher");

    expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Fees" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });

  it("renders cleanly in pseudo-locale (en-XA)", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openFees("admin");

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByText("RV-INV-2026-0001")).toBeInTheDocument();
  });
});
