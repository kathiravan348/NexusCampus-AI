import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders default neutral tone", () => {
    render(<Badge>Inactive</Badge>);
    const badge = screen.getByText("Inactive");
    expect(badge).toHaveClass("bg-bg-raised", "text-text-secondary");
  });

  it("renders semantic tones with contrast-checked text tokens", () => {
    const { rerender } = render(<Badge tone="brand">Active</Badge>);
    expect(screen.getByText("Active")).toHaveClass(
      "bg-brand-primary-subtle",
      "text-brand-primary-text",
    );

    rerender(<Badge tone="success">Active</Badge>);
    expect(screen.getByText("Active")).toHaveClass("bg-success-subtle", "text-success-text");

    rerender(<Badge tone="danger">Error</Badge>);
    expect(screen.getByText("Error")).toHaveClass("bg-danger-subtle", "text-danger-text");
  });
});
