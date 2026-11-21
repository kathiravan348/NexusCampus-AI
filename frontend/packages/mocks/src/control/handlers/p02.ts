import { QuoteSchema } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { z } from "zod";
import { ApiFailure, failureResponse } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff, visibleTo } from "../context";
import { controlDb } from "../db";
import { CONTROL_API_BASE } from "../route";

const SendSchema = z.strictObject({ checkedByHuman: z.boolean().optional() });

/** P02: send a draft quote. An AI-drafted quote needs a person to confirm they checked it (A-1, D14). */
export const p02Handlers: HttpHandler[] = [
  http.post(`*${CONTROL_API_BASE}/quotes/:id/send`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readStaff(request);
      if (!viewer.permissions.has("ctl.quote.manage")) throw new ApiFailure("forbidden");
      const body = SendSchema.safeParse(await request.json().catch(() => ({})));
      if (!body.success) throw new ApiFailure("invalid_request");
      const quote = visibleTo(viewer, controlDb.quotes).find((q) => q.id === params["id"]);
      if (!quote) throw new ApiFailure("not_found");
      if (quote.status !== "draft") throw new ApiFailure("conflict");
      if (quote.aiDrafted && body.data.checkedByHuman !== true) {
        throw new ApiFailure("invalid_request", [
          { path: "checkedByHuman", message: "An AI-drafted quote must be checked by a person." },
        ]);
      }
      const sent = QuoteSchema.parse({ ...quote, status: "sent" });
      controlDb.quotes = controlDb.quotes.map((q) => (q.id === sent.id ? sent : q));
      return HttpResponse.json(sent as JsonBodyType);
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
