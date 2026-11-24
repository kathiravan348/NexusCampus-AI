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

it("disables revocation offline from cache and revokes online with a reason", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  const doc = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.riverside)!;
  renderApp("/documents", { as: persona(TENANT.riverside, "admin"), modules: MODULES });

  const list = within(await screen.findByRole("list", { name: "Issued documents" }));
  fireEvent.click(list.getAllByRole("button")[0]!);
  const revoke = await screen.findByRole("button", { name: "Revoke" });

  online.mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
  expect(revoke).toBeDisabled();
  expect(screen.getByTestId("last-synced")).toBeVisible();
  expect(within(screen.getByRole("article")).getByText("You are offline")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Back to issued documents" }));
  const cachedList = within(await screen.findByRole("list", { name: "Issued documents" }));
  expect(cachedList.getAllByRole("button")).toHaveLength(1);
  fireEvent.click(cachedList.getAllByRole("button")[0]!);
  expect(await screen.findByRole("button", { name: "Revoke" })).toBeDisabled();

  online.mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
  fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Revoke document" }));
  expect(dialog.getByText(/Public verification will show this document as invalid/)).toBeVisible();
  expect(dialog.getByText("0 / 300")).toBeVisible();

  fireEvent.click(dialog.getByRole("button", { name: "Revoke document" }));
  expect(dialog.getByText("This field is required")).toBeVisible();
  expect(doc.revoked).toBe(false);

  const reason = "Replaced by a corrected certificate";
  fireEvent.change(dialog.getByRole("textbox", { name: /Revocation reason/ }), {
    target: { value: reason },
  });
  expect(dialog.getByText(`${reason.length} / 300`)).toBeVisible();

  fireEvent.click(dialog.getByRole("button", { name: "Revoke document" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(doc.revoked).toBe(true);
  expect(doc.revokedReason).toBe(reason);
  const view = within(screen.getByRole("article"));
  expect(await view.findByText("Revoked")).toBeVisible();
  expect(view.getByText(reason)).toBeVisible();
  expect(view.queryByRole("button", { name: "Revoke" })).toBeNull();
});

it("shows the conflict notice when the document was revoked in another session", async () => {
  const doc = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.riverside)!;
  renderApp(`/documents?document=${doc.id}`, {
    as: persona(TENANT.riverside, "admin"),
    modules: MODULES,
  });

  fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Revoke document" }));
  doc.revoked = true;
  doc.revokedReason = "Revoked elsewhere";

  fireEvent.change(dialog.getByRole("textbox", { name: /Revocation reason/ }), {
    target: { value: "Second attempt" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Revoke document" }));

  const alert = await dialog.findByRole("alert");
  expect(alert).toHaveTextContent(/Already revoked/);
  expect(doc.revokedReason).toBe("Revoked elsewhere");
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull());
});
