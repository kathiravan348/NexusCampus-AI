import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@nexus/i18n";
import { Modal } from "./Modal";

function renderWithI18n(ui: React.ReactElement, locale = "en") {
  return render(<I18nProvider locale={locale}>{ui}</I18nProvider>);
}

describe("Modal", () => {
  it("opens from trigger and closes via close button", () => {
    renderWithI18n(
      <Modal
        trigger={<button type="button">Open modal</button>}
        title="Details"
        description="More information"
        footer={<button type="button">Save</button>}
      >
        <p>Modal body</p>
      </Modal>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open modal" }));
    const dialog = screen.getByRole("dialog", { name: "Details" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("More information")).toBeInTheDocument();
    expect(screen.getByText("Modal body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("supports controlled open state, size variants, and Tamil close label", () => {
    const onOpenChange = vi.fn();

    renderWithI18n(
      <Modal open onOpenChange={onOpenChange} size="xl" title="Details">
        <p>Body</p>
      </Modal>,
      "ta",
    );

    const dialog = screen.getByRole("dialog", { name: "Details" });
    expect(dialog).toHaveClass("max-w-6xl", "start-1/2");
    expect(dialog).not.toHaveAttribute("aria-describedby");

    fireEvent.click(screen.getByRole("button", { name: "மூடு" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
