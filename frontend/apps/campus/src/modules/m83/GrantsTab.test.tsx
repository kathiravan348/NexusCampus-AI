import { DEMO_NOW, TENANT } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrantsTab } from "./GrantsTab";
import { RequestsTab } from "./RequestsTab";
import { renderAsOwner } from "./testRender";

describe("GrantsTab", () => {
  it("shows time left on an active grant and lists what it did", async () => {
    const now = () => Date.parse(DEMO_NOW);
    renderAsOwner(TENANT.apex, <GrantsTab canRevoke now={now} />);
    expect(await screen.findByRole("timer")).toHaveTextContent("Ends in 44 h 0 min");
    fireEvent.click(screen.getAllByRole("button", { name: "What they did" })[0]!);
    const history = await screen.findByRole("list", { name: "What they did" });
    expect(history.textContent).toMatch(/m\d{2}\./);
  });

  it("revokes an active grant early", { timeout: 20000 }, async () => {
    renderAsOwner(
      TENANT.riverside,
      <>
        <RequestsTab canDecide />
        <GrantsTab canRevoke />
      </>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Approve…" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /will see this data until/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve access" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revoke now" }));
    expect(await screen.findByText("Access revoked.")).toBeInTheDocument();
    expect(await screen.findAllByText("Revoked", { selector: "span" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Revoke now" })).not.toBeInTheDocument();
  });
});
