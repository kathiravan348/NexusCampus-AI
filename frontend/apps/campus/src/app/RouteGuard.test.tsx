import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { Wifi } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleEntry } from "./modules";
import { persona, renderApp, TEST_MODULES } from "../test/renderApp";

const ONLINE_ONLY_MODULE: ModuleEntry = {
  moduleId: "M01",
  path: "online-only",
  navKey: "common.details",
  icon: Wifi,
  permission: null,
  offlineLevel: "L0",
  load: () => Promise.resolve({ default: () => <p>online-only screen</p> }),
};

describe("RouteGuard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated visitors to sign-in", async () => {
    renderApp("/people");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sign in to a demo institution" }),
    ).toBeInTheDocument();
  });

  it("shows ModuleOff when the tenant plan does not include the module", async () => {
    renderApp("/unplanned", { as: persona(TENANT.littleSteps, "admin") });
    expect(await screen.findByRole("heading", { name: "Not in your plan" })).toBeInTheDocument();
  });

  it("shows Forbidden when the signed-in persona lacks the module permission", async () => {
    renderApp("/people", { as: persona(TENANT.littleSteps, "guardian") });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("renders the module screen when entitled and permitted", async () => {
    renderApp("/people", { as: persona(TENANT.littleSteps, "admin") });
    expect(await screen.findByText("people screen")).toBeInTheDocument();
  });

  it("shows an offline notice for L0 modules when the device is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderApp("/online-only", {
      as: persona(TENANT.littleSteps, "admin"),
      modules: [...TEST_MODULES, ONLINE_ONLY_MODULE],
    });
    expect(await screen.findByRole("heading", { name: "Needs a connection" })).toBeInTheDocument();
  });
});
