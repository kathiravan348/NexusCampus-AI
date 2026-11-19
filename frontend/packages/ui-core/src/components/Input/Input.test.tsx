import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./Input";

describe("Input", () => {
  it("associates label, description, error, and forwards ref", () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    render(
      <Input
        ref={ref}
        label="Name"
        description="Optional"
        error="Required"
        required
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", `${input.id}-description ${input.id}-error`);
    fireEvent.change(input, { target: { value: "Amina" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("applies logical spacing for leading/trailing adornments and numeric mode", () => {
    render(<Input label="Amount" leading="#" trailing="%" numeric />);
    const input = screen.getByLabelText("Amount");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveClass("ps-9", "pe-9", "font-mono", "text-end");
  });
});
