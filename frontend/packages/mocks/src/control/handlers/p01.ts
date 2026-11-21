import { AccountNoteSchema, StaffDirectoryEntrySchema, pageSchema } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { z } from "zod";
import { ApiFailure, failureResponse, paginate } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff, visibleTo } from "../context";
import { controlDb } from "../db";
import { CONTROL_API_BASE, controlGet, controlOk } from "../route";

const NewNoteSchema = z.strictObject({
  accountId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

const DirectoryPage = pageSchema(StaffDirectoryEntrySchema);

let noteCounter = 0;

/** P01 writes and the staff name directory (NEX-072). */
export const p01Handlers: HttpHandler[] = [
  controlGet("/staff-directory", null, (ctx) =>
    controlOk(
      DirectoryPage,
      paginate(
        controlDb.staff.map((s) => ({ id: s.id, displayName: s.displayName })),
        ctx.url,
      ),
    ),
  ),
  http.post(`*${CONTROL_API_BASE}/notes`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readStaff(request);
      if (!viewer.permissions.has("ctl.account.manage")) throw new ApiFailure("forbidden");
      const parsed = NewNoteSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      const account = visibleTo(viewer, controlDb.accounts).find(
        (a) => a.id === parsed.data.accountId,
      );
      if (!account) throw new ApiFailure("not_found");
      noteCounter += 1;
      const note = AccountNoteSchema.parse({
        id: `note-new-${noteCounter}`,
        accountId: account.id,
        authorStaffId: viewer.staff.id,
        body: parsed.data.body,
        createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      });
      controlDb.notes.unshift(note);
      return HttpResponse.json(note as JsonBodyType, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
