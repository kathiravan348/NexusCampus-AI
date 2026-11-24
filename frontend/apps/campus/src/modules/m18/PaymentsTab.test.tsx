import { FEE_INVOICE, TENANT } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { createNexusQueryClient, type PendingFeePayment } from "@nexus/services";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { PaymentsTab } from "./PaymentsTab";

function renderPayments(pendingPayments: readonly PendingFeePayment[] = []) {
  signInAs(persona(TENANT.riverside, "admin"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PaymentsTab pendingPayments={pendingPayments} />
    </AppProviders>,
  );
}

describe("PaymentsTab (M18)", () => {
  it("lists receipts with amounts, methods, status badges and queued items", async () => {
    const pending: PendingFeePayment = {
      entryId: "outbox-1",
      status: "pending",
      deviceId: "device-front-desk",
      input: {
        invoiceIds: [FEE_INVOICE.rv[1]],
        currency: "GBP",
        amount: 20_000,
        method: "cash",
        receivedAt: "2026-11-24T10:15:00Z",
        deviceId: "device-front-desk",
      },
    };
    renderPayments([pending]);

    expect(await screen.findByText("RV-RCP-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("RV-RCP-2026-0002")).toBeInTheDocument();
    expect(screen.getByText("Bank transfer")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(screen.getAllByText("Succeeded")).toHaveLength(2);
    expect(screen.getByText("£1,400.00")).toBeInTheDocument();
    expect(screen.getByText("£1,200.00")).toBeInTheDocument();

    expect(screen.getByText("Pending offline receipt")).toBeInTheDocument();
    expect(screen.getByText("Waiting to sync")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("£200.00")).toBeInTheDocument();
  });

  it("shows the empty state when no receipts exist", async () => {
    server.use(
      http.get("*/api/v1/fee-payments", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
      ),
    );
    renderPayments();

    expect(await screen.findByText("No payments recorded yet")).toBeInTheDocument();
  });
});
