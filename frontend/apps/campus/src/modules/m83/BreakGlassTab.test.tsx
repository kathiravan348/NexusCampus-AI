import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BreakGlassTab } from "./BreakGlassTab";
import { renderAsOwner } from "./testRender";

describe("BreakGlassTab", () => {
  it("shows emergency access with two approvers and times", async () => {
    renderAsOwner(TENANT.northbridge, <BreakGlassTab />);
    expect(await screen.findByText(/approved by two people/)).toBeInTheDocument();
    expect(screen.getByText("Approved by")).toBeInTheDocument();
    expect(screen.getByText("You were told")).toBeInTheDocument();
  });

  it("says when there has been none", async () => {
    renderAsOwner(TENANT.littleSteps, <BreakGlassTab />);
    expect(await screen.findByText("No emergency access has happened.")).toBeInTheDocument();
  });
});
