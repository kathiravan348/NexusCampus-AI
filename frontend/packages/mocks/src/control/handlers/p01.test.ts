import {
  AccountNoteSchema,
  ApiErrorSchema,
  StaffDirectoryEntrySchema,
  pageSchema,
} from "@nexus/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONTROL_HEADER } from "../context";
import { controlDb, resetControlDb } from "../db";
import { ACCOUNT, STAFF } from "../fixtures";
import { CONTROL_API_BASE } from "../route";
import { controlHandlers } from "./index";

const server = setupServer(...controlHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetControlDb();
});
afterAll(() => server.close());

const BASE = `http://localhost${CONTROL_API_BASE}`;

function post(staff: string, body: unknown) {
  return fetch(`${BASE}/notes`, {
    method: "POST",
    headers: { [CONTROL_HEADER.staff]: staff, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const code = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;

describe("P01 mock writes", () => {
  it("adds a note for staff with ctl.account.manage", async () => {
    const res = await post(STAFF.sales, { accountId: ACCOUNT.harmony, body: "Call booked." });
    expect(res.status).toBe(201);
    const note = AccountNoteSchema.parse(await res.json());
    expect(note.authorStaffId).toBe(STAFF.sales);
    expect(controlDb.notes[0]?.id).toBe(note.id);
  });

  it("refuses partners (no manage permission), bad bodies and unknown accounts", async () => {
    expect(await code(await post(STAFF.partnerUser, { accountId: ACCOUNT.apex, body: "x" }))).toBe(
      "forbidden",
    );
    expect(await code(await post(STAFF.sales, { accountId: ACCOUNT.apex, body: "  " }))).toBe(
      "invalid_request",
    );
    expect(await code(await post(STAFF.sales, { accountId: "acc-none", body: "x" }))).toBe(
      "not_found",
    );
  });

  it("serves the staff directory with names only", async () => {
    const res = await fetch(`${BASE}/staff-directory?pageSize=200`, {
      headers: { [CONTROL_HEADER.staff]: STAFF.partnerUser },
    });
    const page = pageSchema(StaffDirectoryEntrySchema).parse(await res.json());
    expect(page.total).toBe(9);
    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual(["displayName", "id"]);
  });
});
