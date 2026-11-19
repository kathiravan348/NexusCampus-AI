import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a button with default type and handles clicks", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows spinner, sets aria-busy, and disables while loading", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("button-spinner")).toHaveAttribute("aria-hidden", "true");
  });

  it("supports asChild and forwards ref", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <>
        <Button ref={ref} variant="danger" size="sm">
          Delete
        </Button>
        <Button asChild variant="secondary">
          <a href="#details">Details</a>
        </Button>
      </>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("href", "#details");
  });
});
