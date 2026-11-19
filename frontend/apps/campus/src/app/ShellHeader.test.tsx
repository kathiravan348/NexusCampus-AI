import { TENANT } from "@nexus/mocks";
import { setLastSyncedAt } from "@nexus/offline";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { freshDb, persona, renderApp } from "../test/renderApp";

describe("ShellHeader", () => {
  it("toggles between light and dark themes", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
    const toDark = await screen.findByRole("button", { name: "Switch to dark theme" });
    fireEvent.click(toDark);
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("dark"));
    const toLight = await screen.findByRole("button", { name: "Switch to light theme" });
    fireEvent.click(toLight);
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("light"));
  });

  it("formats lastSyncedAt using the tenant locale instead of raw ISO text", async () => {
    const admin = persona(TENANT.littleSteps, "admin");
    const db = freshDb();
    const iso = "2026-04-15T10:30:00.000Z";
    await setLastSyncedAt(db, admin, iso);
    renderApp("/", { as: admin, db });
    const status = await screen.findByText(/Last synced/);
    expect(status.textContent).not.toContain("2026-04-15T10:30:00.000Z");
    expect(status.textContent).toMatch(/2026/);
  });

  it("signs out cleanly when no writes are pending", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sign in to a demo institution" }),
    ).toBeInTheDocument();
  });
});
