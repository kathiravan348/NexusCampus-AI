import { TENANT } from "@nexus/mocks";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { persona, renderApp } from "../test/renderApp";

function offerInstall(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("InstallPrompt", () => {
  it("shows no install button until the browser offers installation", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
    await screen.findByRole("button", { name: "Sign out" });
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("opens the browser prompt and hides after a choice", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
    await screen.findByRole("button", { name: "Sign out" });
    const event = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: "Install app" }));
    expect(event.prompt).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument(),
    );
  });

  it("hides once the app is installed", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
    await screen.findByRole("button", { name: "Sign out" });
    offerInstall();
    await screen.findByRole("button", { name: "Install app" });
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });
});
