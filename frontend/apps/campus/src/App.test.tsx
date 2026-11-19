import { TENANT } from "@nexus/mocks";
import { enqueueWrite } from "@nexus/offline";
import { TENANT_THEME_STYLE_ID } from "@nexus/ui-core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { ADMINS, persona, renderApp } from "./test/renderApp";

describe("campus app", () => {
  it("starts on the demo sign-in page", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sign in to a demo institution" }),
    ).toBeInTheDocument();
  });

  it.each(ADMINS.map((a) => [a.tenantId, a] as const))(
    "signs in as the %s admin and shows the menu and home",
    async (_tenant, admin) => {
      renderApp("/", { as: admin });
      expect(await screen.findByRole("heading", { level: 1, name: /[,،]/ })).toBeInTheDocument();
      const nav = screen.getAllByRole("navigation")[0]!;
      expect(await within(nav).findByRole("link", { name: /^(User|مستخدم)$/ })).toBeInTheDocument();
      expect(screen.getByRole("note")).toBeInTheDocument();
    },
  );

  it("renders Apex right to left in Arabic", async () => {
    renderApp("/", { as: persona(TENANT.apex, "admin") });
    expect(await screen.findByRole("heading", { level: 1, name: /مرحبًا/ })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang.startsWith("ar")).toBe(true);
  });

  it("applies Riverside's locked brand colour", async () => {
    renderApp("/", { as: persona(TENANT.riverside, "admin") });
    await waitFor(() =>
      expect(document.getElementById(TENANT_THEME_STYLE_ID)?.textContent).toContain(
        "--brand-primary: #1D4ED8",
      ),
    );
  });

  it("shows not found for an unknown route", async () => {
    renderApp("/no-such-page", { as: ADMINS[0] });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("refuses sign-out while a write waits to sync", async () => {
    const admin = persona(TENANT.littleSteps, "admin");
    const { db } = renderApp("/", { as: admin });
    await enqueueWrite(db, admin, {
      moduleId: "M04",
      operation: "text.save",
      mergeRule: "lww-audited",
      payload: { key: "common.save" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByText(/1 change is still waiting to sync/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /Welcome/ })).toBeInTheDocument();
  });
});
