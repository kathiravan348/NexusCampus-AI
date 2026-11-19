import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("toggles checked state and calls onCheckedChange", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Enabled" onCheckedChange={onCheckedChange} />);
    const checkbox = screen.getByRole("checkbox", { name: "Enabled" });
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("supports indeterminate and error states", () => {
    render(<Checkbox label="Select all" checked="indeterminate" error="Required" />);
    const checkbox = screen.getByRole("checkbox", { name: "Select all" });
    expect(checkbox).toHaveAttribute("data-state", "indeterminate");
    expect(checkbox).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});
