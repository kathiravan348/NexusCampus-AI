import type { PromotionDecision } from "@nexus/contracts";
import { I18nProvider } from "@nexus/i18n";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PromotionDecisions } from "./PromotionDecisions";

vi.mock("@nexus/services", () => ({
  useClassGroups: () => ({ data: { items: [{ id: "target", name: "Science" }] } }),
}));
vi.mock("../m18/InvoicesTab", () => ({
  useLearnerNames: () =>
    new Map([
      ["known", "Sample learner"],
      ["number-only", "L-001"],
    ]),
}));

function English({ children }: PropsWithChildren) {
  return <I18nProvider locale="en">{children}</I18nProvider>;
}

afterEach(cleanup);

const promotion: PromotionDecision = {
  id: "first",
  tenantId: "tenant",
  runId: "run",
  learnerId: "known",
  action: "promote",
  toClassGroupId: "target",
  reasonKey: "common.pending",
  overriddenByStaffProfileId: "private-staff",
};
const decisions: PromotionDecision[] = [
  promotion,
  {
    ...promotion,
    id: "second",
    learnerId: "number-only",
    action: "skip",
    toClassGroupId: null,
    reasonKey: "unlisted.reason",
    overriddenByStaffProfileId: null,
  },
  {
    ...promotion,
    id: "third",
    learnerId: "unknown",
    action: "graduate",
    toClassGroupId: null,
    reasonKey: null,
    overriddenByStaffProfileId: null,
  },
];

it("shows available learner and class labels, translated reasons and staff changes", () => {
  render(<PromotionDecisions decisions={decisions} action="" onAction={vi.fn()} />, {
    wrapper: English,
  });
  expect(screen.getByText("Sample learner")).toBeTruthy();
  expect(screen.getByText("L-001")).toBeTruthy();
  expect(screen.getByRole("cell", { name: "Learner" })).toBeTruthy();
  expect(screen.getByText("Science")).toBeTruthy();
  expect(screen.getByText("Pending")).toBeTruthy();
  expect(screen.getByText("Changed by staff")).toBeTruthy();
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  expect(screen.queryByText("unlisted.reason")).toBeNull();
  expect(screen.queryByText("private-staff")).toBeNull();
});

it("filters decisions and shows the empty result when the action has no matches", () => {
  const onAction = vi.fn();
  const { rerender } = render(
    <PromotionDecisions decisions={decisions} action="skip" onAction={onAction} />,
    { wrapper: English },
  );
  expect(screen.getByText("L-001")).toBeTruthy();
  expect(screen.queryByText("Sample learner")).toBeNull();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "transfer" } });
  expect(onAction).toHaveBeenCalledWith("transfer");
  rerender(<PromotionDecisions decisions={decisions} action="transfer" onAction={onAction} />);
  expect(screen.getByText("No decisions match this filter.")).toBeTruthy();
});
