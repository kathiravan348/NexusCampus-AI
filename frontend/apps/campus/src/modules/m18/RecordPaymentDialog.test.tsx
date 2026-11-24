import type { FeeInvoice } from "@nexus/contracts";
import { FEE_INVOICE, TENANT, mockDb } from "@nexus/mocks";
import { createNexusQueryClient, useRecordFeePayment } from "@nexus/services";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { RecordPaymentDialog, majorToMinor } from "./RecordPaymentDialog";

function DialogHarness({
  online,
  invoices,
  onOpenChange,
}: {
  readonly online: boolean;
  readonly invoices: readonly FeeInvoice[];
  readonly onOpenChange: (open: boolean) => void;
}) {
  const recordPayment = useRecordFeePayment();
  return (
    <RecordPaymentDialog
      open
      onOpenChange={onOpenChange}
      online={online}
      invoices={invoices}
      recordPayment={recordPayment}
    />
  );
}

function renderDialog(options?: { readonly online?: boolean; readonly invoices?: FeeInvoice[] }) {
  const onOpenChange = vi.fn();
  const invoices =
    options?.invoices ??
    structuredClone(mockDb.feeInvoices.filter((row) => row.tenantId === TENANT.riverside));
  signInAs(persona(TENANT.riverside, "admin"));
  const view = render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DialogHarness
        online={options?.online ?? true}
        invoices={invoices}
        onOpenChange={onOpenChange}
      />
    </AppProviders>,
  );
  return { ...view, onOpenChange };
}

describe("RecordPaymentDialog (M18)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts major currency strings to integer minor units", () => {
    expect(majorToMinor("200", "GBP")).toBe(20_000);
    expect(majorToMinor("19.99", "GBP")).toBe(1_999);
    expect(majorToMinor("500", "JPY")).toBe(500);
    expect(Number.isNaN(majorToMinor("19.999", "GBP"))).toBe(true);
    expect(Number.isNaN(majorToMinor("-5", "GBP"))).toBe(true);
  });

  it("shows field errors for missing, over-balance and server-rejected amounts", async () => {
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Record payment" });

    // Only manual offline-capable methods are offered (no card, UPI or gateway).
    const methodSelect = within(dialog).getByLabelText(/Payment method/) as HTMLSelectElement;
    expect([...methodSelect.options].map((o) => o.value)).toEqual([
      "cash",
      "cheque",
      "bank_transfer",
    ]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Record receipt" }));
    expect(await within(dialog).findByText("This field is required")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: "250" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record receipt" }));
    expect(
      await within(dialog).findByText(
        "Amount exceeds the remaining balance of the selected invoices.",
      ),
    ).toBeInTheDocument();

    // Lower live mockDb balance while the dialog still holds the original snapshot, so client
    // validation passes and the server 400 detail on `amount` is mapped back to the field.
    const liveInvoice = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.rv[1])!;
    liveInvoice.paid = liveInvoice.total - 5_000;
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: "100" } });
    await waitFor(() =>
      expect(
        within(dialog).queryByText(
          "Amount exceeds the remaining balance of the selected invoices.",
        ),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Record receipt" }));
    expect(
      await within(dialog).findByText(
        "Amount exceeds the remaining balance of the selected invoices.",
      ),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("supports multi-select of one learner's open invoices and offline queueing", async () => {
    const base = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.rv[1])!;
    const secondOpen: FeeInvoice = {
      ...base,
      id: "inv-rv-extra",
      invoiceNumber: "RV-INV-2026-0099",
      dueOn: "2026-12-15",
      paid: 0,
      status: "issued",
    };
    mockDb.feeInvoices.push(secondOpen);

    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { onOpenChange } = renderDialog({ online: false });
    const dialog = await screen.findByRole("dialog", { name: "Record payment" });

    expect(
      within(dialog).getByText(
        "Offline — receipt will queue as Waiting to sync until you reconnect.",
      ),
    ).toBeInTheDocument();

    const checkboxes = within(dialog).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[1]!);
    expect(within(dialog).getByText("Selected balance: £1,600.00")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: "300" } });
    fireEvent.change(within(dialog).getByLabelText(/Payment method/), {
      target: { value: "cheque" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record receipt" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    online.mockRestore();
  });
});
