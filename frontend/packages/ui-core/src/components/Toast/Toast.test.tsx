import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@nexus/i18n";
import { ToastProvider } from "./ToastProvider";
import { useToast } from "./useToast";
import type { ToastTone } from "./toastContext";

function ToastTrigger({
  title,
  description,
  tone,
}: {
  title: string;
  description?: string;
  tone?: ToastTone;
}) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show({ title, description, tone })}>
      Trigger {tone ?? "default"}
    </button>
  );
}

function OutsideConsumer() {
  useToast();
  return null;
}

describe("Toast", () => {
  it("shows toasts for all four tones and dismisses on close", () => {
    render(
      <I18nProvider locale="en">
        <ToastProvider>
          <ToastTrigger title="Info toast" description="Details" tone="info" />
          <ToastTrigger title="Success toast" tone="success" />
          <ToastTrigger title="Warning toast" tone="warning" />
          <ToastTrigger title="Danger toast" tone="danger" />
        </ToastProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Trigger info" }));
    expect(screen.getByText("Info toast")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close notification" }));
    expect(screen.queryByText("Info toast")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Trigger success" }));
    fireEvent.click(screen.getByRole("button", { name: "Trigger warning" }));
    fireEvent.click(screen.getByRole("button", { name: "Trigger danger" }));

    expect(screen.getByText("Success toast")).toBeInTheDocument();
    expect(screen.getByText("Warning toast")).toBeInTheDocument();
    expect(screen.getByText("Danger toast")).toBeInTheDocument();
  });

  it("localizes close label in Arabic", () => {
    render(
      <I18nProvider locale="ar">
        <ToastProvider>
          <ToastTrigger title="Saved" tone="success" />
        </ToastProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Trigger success" }));
    expect(screen.getByRole("button", { name: "إغلاق الإشعار" })).toBeInTheDocument();
  });

  it("throws when useToast is called outside ToastProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<OutsideConsumer />)).toThrow(
      "useToast must be used within a ToastProvider",
    );
    spy.mockRestore();
  });
});
