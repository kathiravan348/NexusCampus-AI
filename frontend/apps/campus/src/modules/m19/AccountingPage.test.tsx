import { TENANT } from "@nexus/mocks";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

import { server } from "@nexus/mocks/node";
import { http, HttpResponse } from "msw";

it("provides the initial accounting view and retains the selected view offline", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  try {
    renderApp("/accounting", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "Accounting" })).toBeInTheDocument();
    expect(await screen.findByRole("note")).toBeInTheDocument();
    const tab = await screen.findByRole("tab", { name: "Journal" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const post = await screen.findByRole("button", { name: "Post entry" });
    expect(post).toBeEnabled();
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(post).toBeDisabled();
    expect(screen.getByTestId("last-synced")).toBeInTheDocument();
    expect(screen.getByText("You are offline")).toBeInTheDocument();
  } finally {
    online.mockRestore();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  }
});

it("blocks a viewer without accounting access", async () => {
  renderApp("/accounting", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
  expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Post entry" })).toBeNull();
});

it.each(["ledger-accounts", "journal-entries", "budgets"])(
  "handles a denied list and keeps the journal inaccessible",
  async (endpoint) => {
    server.use(
      http.get("*/api/v1/" + endpoint, () =>
        HttpResponse.json(
          { error: { code: "forbidden", message: "Access denied" } },
          { status: 403 },
        ),
      ),
    );
    renderApp("/accounting", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(screen.queryByText("Post entry")).toBeNull();
  },
);
