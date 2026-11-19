import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("toggles checked state and notifies onCheckedChange", () => {
    const onCheckedChange = vi.fn();
    render(<Switch label="Enabled" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole("switch", { name: "Enabled" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("wires error state and rtl thumb mirror classes", () => {
    render(<Switch label="Active" checked error="Required" />);
    const toggle = screen.getByRole("switch", { name: "Active" });
    expect(toggle).toHaveAttribute("aria-invalid", "true");
    expect(toggle.firstElementChild).toHaveClass("rtl:data-[state=checked]:-translate-x-5");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});
