import * as React from "react";
import { I18nProvider } from "@nexus/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorField } from "./ColorField";

function renderField(ui: React.ReactElement, locale = "en") {
  return render(<I18nProvider locale={locale}>{ui}</I18nProvider>);
}

describe("ColorField", () => {
  it("renders swatch, native colour picker, and hex input wired to label and ref", () => {
    const ref = React.createRef<HTMLInputElement>();
    const onChange = vi.fn();
    renderField(
      <ColorField
        ref={ref}
        id="primary"
        label="Primary colour"
        value="#1F5FD1"
        pickerAriaLabel="Pick primary colour"
        onChange={onChange}
      />,
    );

    const textInput = screen.getByRole("textbox", { name: "Primary colour" });
    expect(ref.current).toBe(textInput);
    expect(textInput).toHaveValue("#1F5FD1");
    expect(textInput).toHaveAttribute("dir", "ltr");

    const swatch = screen.getByTestId("primary-swatch");
    expect(swatch).toHaveStyle({ backgroundColor: "rgb(31, 95, 209)" });

    const picker = screen.getByLabelText("Pick primary colour");
    fireEvent.change(picker, { target: { value: "#0f766e" } });
    expect(onChange).toHaveBeenCalledWith("#0F766E");

    fireEvent.change(textInput, { target: { value: "#B42318" } });
    expect(onChange).toHaveBeenCalledWith("#B42318");
  });

  it("wires error, description, and disabled states cleanly", () => {
    renderField(
      <ColorField
        id="broken"
        label="Accent"
        value="#12"
        description="Hex format"
        error="Invalid colour"
        disabled
        onChange={vi.fn()}
      />,
    );
    const textInput = screen.getByRole("textbox", { name: "Accent" });
    expect(textInput).toBeDisabled();
    expect(textInput).toHaveAttribute("aria-invalid", "true");
    expect(textInput).toHaveAttribute("aria-describedby", "broken-description broken-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid colour");
  });
});
