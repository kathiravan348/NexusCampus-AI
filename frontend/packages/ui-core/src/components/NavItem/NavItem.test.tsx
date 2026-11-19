import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShellContext } from "../AppShell/appShellContext";
import { NavItem } from "./NavItem";

describe("NavItem", () => {
  it("renders button with text, icon, and active aria-current state", () => {
    render(
      <NavItem icon={<span data-testid="nav-icon" />} active>
        Learners
      </NavItem>,
    );

    const button = screen.getByRole("button", { name: "Learners" });
    expect(button).toHaveAttribute("aria-current", "page");
    expect(button).toHaveClass("text-start", "bg-brand-primary-subtle", "text-brand-primary-text");
    expect(screen.getByTestId("nav-icon")).toBeInTheDocument();
  });

  it("supports asChild anchor rendering", () => {
    render(
      <NavItem asChild active>
        <a href="/learners">Learners</a>
      </NavItem>,
    );

    const link = screen.getByRole("link", { name: "Learners" });
    expect(link).toHaveAttribute("href", "/learners");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("invokes onClick and closes AppShell menu when inside AppShellContext", () => {
    const onClick = vi.fn();
    const closeMenu = vi.fn();

    render(
      <AppShellContext.Provider value={{ closeMenu }}>
        <NavItem onClick={onClick}>Classes</NavItem>
      </AppShellContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Classes" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(closeMenu).toHaveBeenCalledTimes(1);
  });
});
