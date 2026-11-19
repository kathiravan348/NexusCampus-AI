import { fireEvent, render, screen } from "@testing-library/react";
import { X } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("exposes accessible label and hides decorative icon", () => {
    const onClick = vi.fn();
    render(
      <IconButton
        aria-label="Close"
        icon={<X data-testid="close-icon" className="h-4 w-4" />}
        onClick={onClick}
      />,
    );
    const button = screen.getByRole("button", { name: "Close" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("close-icon").parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("replaces icon with spinner while loading", () => {
    render(
      <IconButton
        aria-label="Close"
        icon={<X data-testid="close-icon" className="h-4 w-4" />}
        loading
      />,
    );
    expect(screen.queryByTestId("close-icon")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
  });
});
