import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("AssistButton", () => {
  it("shows in the header where AI is on", async () => {
    renderApp("/", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(await screen.findByRole("button", { name: "Open Nexus Assist" })).toBeInTheDocument();
  });

  it("is hidden at Little Steps (AI switched off) and Harmony (not in plan)", async () => {
    for (const tenant of [TENANT.littleSteps, TENANT.harmony]) {
      const view = renderApp("/", { as: persona(tenant, "admin"), modules: MODULES });
      await screen.findByRole("heading", { level: 1 });
      expect(screen.queryByRole("button", { name: "Open Nexus Assist" })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
