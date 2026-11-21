import { InvoiceSchema, PaymentSchema } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { z } from "zod";
import { ApiFailure, failureResponse } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff } from "../context";
import { controlDb } from "../db";
import { CONTROL_API_BASE } from "../route";

const TransferSchema = z.strictObject({ reference: z.string().trim().min(3).max(64) });

let paymentCounter = 0;

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * P03: record a bank transfer we received. It pays the invoice in full, adds a `manual` payment (our own
 * reference only — never bank account numbers) and clears the account's dunning.
 */
export const p03Handlers: HttpHandler[] = [
  http.post(`*${CONTROL_API_BASE}/invoices/:id/record-transfer`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readStaff(request);
      if (!viewer.permissions.has("ctl.billing.manage")) throw new ApiFailure("forbidden");
      const body = TransferSchema.safeParse(await request.json().catch(() => null));
      if (!body.success) {
        throw new ApiFailure(
          "invalid_request",
          body.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      const invoice = controlDb.invoices.find((i) => i.id === params["id"]);
      if (!invoice) throw new ApiFailure("not_found");
      if (invoice.status !== "open" && invoice.status !== "overdue") {
        throw new ApiFailure("conflict");
      }
      const at = nowIso();
      paymentCounter += 1;
      const payment = PaymentSchema.parse({
        id: `pay-manual-${paymentCounter}`,
        invoiceId: invoice.id,
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
        method: "bank_transfer",
        gateway: "manual",
        gatewayRef: null,
        status: "succeeded",
        createdAt: at,
      });
      const paid = InvoiceSchema.parse({ ...invoice, status: "paid", paidAt: at });
      controlDb.payments.push(payment);
      controlDb.invoices = controlDb.invoices.map((i) => (i.id === paid.id ? paid : i));
      controlDb.dunning = controlDb.dunning.map((d) =>
        d.accountId === paid.accountId
          ? { ...d, stage: "none", overdueMinor: 0, nextStepAt: null }
          : d,
      );
      controlDb.subscriptions = controlDb.subscriptions.map((s) =>
        s.accountId === paid.accountId && s.status === "past_due" ? { ...s, status: "active" } : s,
      );
      return HttpResponse.json({ invoice: paid, payment } as JsonBodyType);
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
