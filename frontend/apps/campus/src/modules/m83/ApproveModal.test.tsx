import type { AccessGrant } from "@nexus/contracts";
import { ACCESS_REQUEST, TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequestsTab } from "./RequestsTab";
import { renderAsOwner } from "./testRender";

describe("ApproveModal", () => {
  it("approves a narrowed scope only after the owner acknowledges the end time", async () => {
    renderAsOwner(TENANT.riverside, <RequestsTab canDecide />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve…" }));
    const dialog = await screen.findByRole("dialog", { name: /Approve access for/ });

    const mode = within(dialog).getByLabelText("Access");
    expect(
      within(mode)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Read only"]);
    fireEvent.change(within(dialog).getByLabelText(/Hours/), { target: { value: "6" } });

    const approve = within(dialog).getByRole("button", { name: "Approve access" });
    expect(approve).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /will see this data until/ }));
    expect(approve).toBeEnabled();
    fireEvent.click(approve);

    expect(await screen.findByText("Access approved.")).toBeInTheDocument();
    await waitFor(() => {
      const grant = (mockDb.accessGrants as readonly AccessGrant[]).find(
        (g) => g.requestId === ACCESS_REQUEST.riversidePending,
      )!;
      expect(Date.parse(grant.endsAt) - Date.parse(grant.startsAt)).toBe(6 * 3_600_000);
    });
  });

  it("cannot raise the hours above the request", async () => {
    renderAsOwner(TENANT.riverside, <RequestsTab canDecide />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve…" }));
    const dialog = await screen.findByRole("dialog", { name: /Approve access for/ });
    fireEvent.change(within(dialog).getByLabelText(/Hours/), { target: { value: "48" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /will see this data until/ }));
    expect(within(dialog).getByRole("button", { name: "Approve access" })).toBeDisabled();
  });
});
