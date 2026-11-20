import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@nexus/i18n";
import { SyncStatus, type SyncStatusState } from "./SyncStatus";

function renderWithI18n(ui: React.ReactElement, locale = "en") {
  return render(<I18nProvider locale={locale}>{ui}</I18nProvider>);
}

describe("SyncStatus", () => {
  it.each<[SyncStatusState, string, { pendingCount?: number; conflictCount?: number }]>([
    ["synced", "Synced", {}],
    ["pending", "3 changes waiting to sync", { pendingCount: 3 }],
    ["pending", "Changes waiting to sync", {}],
    ["syncing", "Syncing…", {}],
    ["conflict", "2 sync conflicts", { conflictCount: 2 }],
    ["conflict", "Sync conflict", {}],
    ["offline", "Offline", {}],
    ["offline", "Offline · 1 pending", { pendingCount: 1 }],
    ["error", "Sync error", {}],
  ])("renders %s state with text %s", (state, expectedText, counts) => {
    renderWithI18n(<SyncStatus state={state} {...counts} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-state", state);
    expect(status).toHaveTextContent(expectedText);
  });

  it("displays lastSyncedAt and fires onClick as a button", () => {
    const onClick = vi.fn();
    renderWithI18n(<SyncStatus state="synced" lastSyncedAt="10:42" onClick={onClick} />);

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Synced");
    expect(button).toHaveTextContent("Last synced 10:42");

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("localizes labels in Tamil", () => {
    renderWithI18n(<SyncStatus state="synced" lastSyncedAt="10:42" />, "ta");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("ஒத்திசைக்கப்பட்டது");
    expect(status).toHaveTextContent("கடைசியாக ஒத்திசைத்தது 10:42");
  });
});
