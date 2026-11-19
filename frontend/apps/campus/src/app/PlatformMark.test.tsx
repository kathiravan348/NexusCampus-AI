import { brand } from "@nexus/brand";
import { TENANT } from "@nexus/mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { persona, renderApp } from "../test/renderApp";
import { PlatformMark } from "./PlatformMark";

describe("PlatformMark", () => {
  it("renders the platform mark with the platform name as alt text", () => {
    render(<PlatformMark />);
    const img = screen.getByRole("img", { name: brand.name });
    expect(img).toHaveAttribute("src", brand.logo.mark);
    expect(img).toHaveClass("h-7", "w-7");
  });

  it("is hidden from screen readers when decorative, and uses the md size", () => {
    const { container } = render(<PlatformMark size="md" decorative />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveClass("h-10", "w-10");
  });

  it("hides itself when the file fails to load", () => {
    render(<PlatformMark />);
    const img = screen.getByRole("img", { name: brand.name });
    fireEvent.error(img);
    expect(img).not.toBeVisible();
  });

  it("shows in the app header before the institution name, from md width up", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
    const header = await screen.findByRole("banner");
    const mark = await screen.findByRole("img", { name: brand.name });
    expect(header).toContainElement(mark);
    const slot = mark.parentElement;
    expect(slot).toHaveClass("hidden", "md:inline-flex");
    expect(slot?.nextElementSibling?.textContent).toMatch(/Little Steps/);
  });
});
