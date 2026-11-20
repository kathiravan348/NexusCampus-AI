import { TENANT } from "@nexus/mocks";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { persona, renderApp } from "../test/renderApp";
import { resetPwaForTests } from "./registerPwa";

const hooks = vi.hoisted(() => ({
  options: null as null | { onNeedRefresh?: () => void; onOfflineReady?: () => void },
  update: vi.fn(() => Promise.resolve()),
}));

vi.mock("virtual:pwa-register", () => ({
  registerSW: (options: typeof hooks.options) => {
    hooks.options = options;
    return hooks.update;
  },
}));

async function signedIn() {
  renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
  await screen.findByRole("button", { name: "Sign out" });
}

describe("UpdateToast", () => {
  beforeEach(() => {
    resetPwaForTests();
    hooks.update.mockClear();
  });

  it("offers Reload when a new version is waiting", async () => {
    await signedIn();
    expect(screen.queryByText("A new version of NexusCampus is ready.")).not.toBeInTheDocument();
    act(() => hooks.options?.onNeedRefresh?.());
    expect(await screen.findByText("A new version of NexusCampus is ready.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(hooks.update).toHaveBeenCalledWith(true);
  });

  it("can be put off with Later", async () => {
    await signedIn();
    act(() => hooks.options?.onNeedRefresh?.());
    fireEvent.click(await screen.findByRole("button", { name: "Later" }));
    expect(screen.queryByText("A new version of NexusCampus is ready.")).not.toBeInTheDocument();
  });

  it("says once that the app is ready offline", async () => {
    await signedIn();
    act(() => hooks.options?.onOfflineReady?.());
    expect(await screen.findAllByText("Ready to work offline")).not.toHaveLength(0);
  });
});
