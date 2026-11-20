import { TENANT } from "@nexus/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeysTab } from "./KeysTab";
import { renderAsOwner } from "./testRender";

describe("KeysTab", () => {
  it("shows key purpose, custody and status, never key material", async () => {
    renderAsOwner(TENANT.northbridge, <KeysTab />);
    const table = await screen.findByRole("table", { name: "Encryption keys" });
    expect(await within(table).findByText("ID document fields")).toBeInTheDocument();
    expect(within(table).getAllByText("Your key in our vault (BYOK)")).toHaveLength(2);
    expect(within(table).getByText("Rotating")).toBeInTheDocument();
    expect(screen.getByText(/keys are destroyed/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
