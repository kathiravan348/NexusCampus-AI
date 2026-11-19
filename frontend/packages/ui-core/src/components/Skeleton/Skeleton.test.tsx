import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders decorative loading placeholder respecting reduced motion", () => {
    render(<Skeleton className="h-4 w-32" />);
    const el = screen.getByTestId("skeleton");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveClass("motion-reduce:animate-none", "h-4", "w-32");
  });
});
