import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("AiSettingsPage (M11)", () => {
  it("never lets health or the data vault be switched on", async () => {
    renderApp("/ai", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "AI settings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Health records" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Data vault & access" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Safeguarding" })).toBeDisabled();
    expect(screen.getAllByText("AI never reads this data.")).toHaveLength(2);
    expect(screen.getByRole("meter", { name: "Used" })).toBeInTheDocument();
  });

  it("saves the tier and module switches", async () => {
    renderApp("/ai", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const tier = await screen.findByLabelText("Default answer quality");
    fireEvent.change(tier, { target: { value: "reasoning" } });
    fireEvent.click(screen.getByRole("switch", { name: "Users & access" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("AI settings saved.")).toBeInTheDocument();
    await waitFor(() => {
      const saved = mockDb.aiSettings.find((s) => s.tenantId === TENANT.riverside)!;
      expect(saved.defaultTier).toBe("reasoning");
      expect(saved.modules["M02"]).toBe(false);
    });
  });
});
