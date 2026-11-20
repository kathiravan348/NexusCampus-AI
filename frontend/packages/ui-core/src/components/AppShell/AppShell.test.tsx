import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@nexus/i18n";
import { AppShell } from "./AppShell";
import { NavItem } from "../NavItem/NavItem";

function renderWithI18n(ui: React.ReactElement, locale = "en") {
  return render(<I18nProvider locale={locale}>{ui}</I18nProvider>);
}

describe("AppShell", () => {
  it("renders skip link, brand, navigation, title, actions, banner, and main content", () => {
    renderWithI18n(
      <AppShell
        brand={<span>Nexus</span>}
        nav={<NavItem active>Learners</NavItem>}
        navFooter={<span>Footer</span>}
        title="Overview"
        actions={<button type="button">Add</button>}
        banner={<div role="note">Banner</div>}
      >
        <p>Main body</p>
      </AppShell>,
    );

    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(skipLink).toHaveClass("focus:start-3");

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Banner");
    expect(screen.getByText("Main body")).toBeInTheDocument();
  });

  it("opens mobile drawer and closes it when a NavItem is clicked", () => {
    renderWithI18n(
      <AppShell brand={<span>Nexus</span>} nav={<NavItem>Classes</NavItem>} title="Home">
        <p>Body</p>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();

    const drawerNavButtons = screen.getAllByRole("button", { name: "Classes" });
    fireEvent.click(drawerNavButtons[drawerNavButtons.length - 1]!);

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
  });

  it("localizes shell chrome in Tamil", () => {
    renderWithI18n(
      <AppShell brand={<span>Nexus</span>} nav={<NavItem>Item</NavItem>}>
        <p>Body</p>
      </AppShell>,
      "ta",
    );

    expect(screen.getByRole("link", { name: "உள்ளடக்கத்திற்குச் செல்" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "பட்டியைத் திற" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "முதன்மை வழிசெலுத்தல்" })).toBeInTheDocument();
  });
});
