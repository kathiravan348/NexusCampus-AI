import { TENANT } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequestsTab } from "./RequestsTab";
import { renderAsOwner } from "./testRender";

describe("RequestsTab", () => {
  it("lists the pending request first and denies it only with a reason", async () => {
    renderAsOwner(TENANT.riverside, <RequestsTab canDecide />);
    expect(await screen.findByText(/North campus theme/)).toBeInTheDocument();
    expect(screen.getByText("Waiting for you")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    const confirm = screen.getByRole("button", { name: "Deny request" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason for denying/), {
      target: { value: "Fixed already" },
    });
    fireEvent.click(confirm);
    expect(await screen.findByText("Request denied.")).toBeInTheDocument();
    expect(await screen.findByText("Denied")).toBeInTheDocument();
  });

  it("hides decisions from someone who may not approve", async () => {
    renderAsOwner(TENANT.riverside, <RequestsTab canDecide={false} />);
    await screen.findByText(/North campus theme/);
    expect(screen.queryByRole("button", { name: "Approve…" })).not.toBeInTheDocument();
  });
});
