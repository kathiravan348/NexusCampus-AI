import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { brand } from "@nexus/brand";
import { App } from "./App";

describe("campus smoke test", () => {
  it("renders the platform name from brand.config as the only heading", () => {
    render(<App />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(brand.name);
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });
});
