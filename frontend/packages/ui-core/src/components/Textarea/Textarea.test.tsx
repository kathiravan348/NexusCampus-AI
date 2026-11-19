import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("renders with default rows, wires aria attributes, and handles input", () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    render(
      <Textarea
        ref={ref}
        label="Notes"
        description="Optional"
        error="Required"
        required
        onChange={onChange}
      />,
    );
    const field = screen.getByRole("textbox", { name: "Notes" });
    expect(ref.current).toBe(field);
    expect(field).toHaveAttribute("rows", "3");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", `${field.id}-description ${field.id}-error`);
    fireEvent.change(field, { target: { value: "Updated" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
