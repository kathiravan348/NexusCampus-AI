import { TENANT } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { useServices } from "@nexus/services";
import { act, screen, waitFor, within } from "@testing-library/react";
import { Users } from "lucide-react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { persona, renderApp } from "../test/renderApp";
import type { ModuleEntry } from "./modules";

describe("Shell", () => {
  it("hides menu items the persona lacks permission for and hides unentitled modules", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "guardian") });
    expect(await screen.findByRole("heading", { level: 1, name: /Welcome/ })).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation")[0]!;
    await waitFor(() => {
      expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
    expect(within(nav).queryByRole("link", { name: "User" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Details" })).not.toBeInTheDocument();
  });

  it("shows DemoBanner and marks the active module link", async () => {
    renderApp("/people", { as: persona(TENANT.littleSteps, "admin") });
    expect(await screen.findByText("people screen")).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation")[0]!;
    expect(within(nav).getByRole("link", { name: "User" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.queryByText("This institution is frozen")).not.toBeInTheDocument();
  });

  it("shows the frozen-institution banner only after a 423 tenant_frozen response", async () => {
    server.use(
      http.post("*/api/v1/shell-freeze-test", () =>
        HttpResponse.json(
          { error: { code: "tenant_frozen", message: "Institution is frozen." } },
          { status: 423 },
        ),
      ),
    );
    function TriggerFreezeScreen() {
      const { client } = useServices();
      return (
        <button
          type="button"
          onClick={() => {
            void client
              .send("POST", "/shell-freeze-test", {}, { parse: (v: unknown) => v })
              .catch(() => undefined);
          }}
        >
          Trigger save
        </button>
      );
    }
    const modules: readonly ModuleEntry[] = [
      {
        moduleId: "M02",
        path: "people",
        navKey: "m02.persona.user",
        summaryKey: "m02.nav.summary",
        icon: Users,
        permission: "m02.user.read",
        offlineLevel: "L1",
        load: () => Promise.resolve({ default: TriggerFreezeScreen }),
      },
    ];
    renderApp("/people", { as: persona(TENANT.littleSteps, "admin"), modules });
    const button = await screen.findByRole("button", { name: "Trigger save" });
    expect(screen.queryByText("This institution is frozen")).not.toBeInTheDocument();

    act(() => {
      button.click();
    });
    expect(await screen.findByText("This institution is frozen")).toBeInTheDocument();
    expect(
      screen.getByText(
        "It is being moved or is leaving NexusCampus. You can still sign in and read everything, but changes are not saved.",
      ),
    ).toBeInTheDocument();
  });
});
