import { TENANT, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
});

it("disables withdrawal offline and requires confirmation after reconnecting", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  const card = mockDb.reportCards.find(
    (row) => row.tenantId === TENANT.riverside && row.status === "published",
  )!;
  renderApp(`/report-cards?card=${card.id}`, {
    as: persona(TENANT.riverside, "admin"),
    modules: MODULES,
  });
  const withdraw = await screen.findByRole("button", { name: "Withdraw" });
  online.mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
  expect(withdraw).toBeDisabled();
  expect(screen.getByTestId("last-synced")).toBeVisible();
  expect(screen.getByRole("article")).toBeVisible();

  online.mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
  fireEvent.click(withdraw);
  const dialog = within(await screen.findByRole("dialog", { name: "Withdraw" }));
  expect(card.status).toBe("published");
  fireEvent.click(dialog.getByRole("button", { name: "Withdraw" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(card.status).toBe("withdrawn");
  expect(within(screen.getByRole("article")).getByText("Withdrawn")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
});
