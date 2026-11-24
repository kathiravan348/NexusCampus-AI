import { TENANT, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openPage(role = "admin") {
  return renderApp("/forms", { modules: MODULES, as: persona(TENANT.riverside, role) });
}

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
});

describe("Forms & fields", () => {
  it("shows cached fields and Last synced, and disables writes when the connection drops", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    openPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Forms & fields" })).toBeVisible();
    expect(screen.getByRole("note")).toBeVisible();
    const add = await screen.findByRole("button", { name: "Add custom field" });
    const field = mockDb.customFieldDefinitions.find(
      (row) => row.tenantId === TENANT.riverside && row.entity === "learner",
    )!;
    const label = field.label["en-GB"] ?? Object.values(field.label)[0]!;
    expect(await screen.findByText(label)).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Ask Assist" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription("You are offline");
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.queryByRole("button", { name: "Ask Assist" })).toBeNull();
  });

  it("hides the menu entry and guards the direct route without read permission", async () => {
    openPage("guardian");
    expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Forms & fields" })).toBeNull();
  });

  it("shows the translated page header in the pseudo-locale", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openPage();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/^⟦.*⟧$/);
  });
});
