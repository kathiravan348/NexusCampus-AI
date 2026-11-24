import type { RolloverRun } from "@nexus/contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RolloverRunList } from "./RolloverRunList";

vi.mock("@nexus/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nexus/i18n")>()),
  useText: () => (key: string, values?: { date: string }) =>
    values ? `${key} ${values.date}` : key,
}));
vi.mock("../../app/TenantRuntime", () => ({
  useRuntime: () => ({ locale: "en-IN", timeZone: "Asia/Kolkata" }),
}));

afterEach(cleanup);

const draft: RolloverRun = {
  id: "draft-run",
  tenantId: "tenant",
  institutionId: "institution",
  fromAcademicYearId: "previous",
  toAcademicYearId: "next",
  status: "draft",
  counts: { promote: 1234, detain: 0, graduate: 0, transfer: 0, skip: 0 },
  carryForwardFees: false,
  rollbackUntil: null,
  createdByStaffProfileId: "private-staff",
  createdAt: "2026-05-12T00:00:00Z",
  updatedAt: "2026-05-12T00:00:00Z",
};

it("shows the run status, formatted totals, fee choice and applicable rollback window", () => {
  const completed: RolloverRun = {
    ...draft,
    id: "finished-run",
    status: "completed",
    carryForwardFees: true,
    rollbackUntil: "2026-05-18T18:00:00Z",
  };
  const onSelect = vi.fn();
  render(<RolloverRunList runs={[draft, completed]} selectedId={draft.id} onSelect={onSelect} />);

  const selected = screen.getByRole("button", { pressed: true });
  expect(within(selected).getByText("m86.status.draft")).toBeTruthy();
  expect(within(selected).getByText("1,234")).toBeTruthy();
  expect(within(selected).getByText("m86.run.no")).toBeTruthy();
  expect(within(selected).queryByText(/m86.run.rollback/)).toBeNull();

  const other = screen.getByRole("button", { pressed: false });
  expect(within(other).getByText("m86.status.completed")).toBeTruthy();
  expect(within(other).getByText("m86.run.yes")).toBeTruthy();
  expect(within(other).getByText(/m86.run.rollback/)).toBeTruthy();
  fireEvent.click(other);
  expect(onSelect).toHaveBeenCalledWith(completed.id);
  expect(screen.queryByText(draft.fromAcademicYearId)).toBeNull();
});
