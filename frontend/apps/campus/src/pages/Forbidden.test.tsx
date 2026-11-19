import { I18nProvider } from "@nexus/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Forbidden } from "./Forbidden";

describe("Forbidden", () => {
  it("renders the no-access notice and home link", () => {
    render(
      <I18nProvider locale="en">
        <MemoryRouter>
          <Forbidden />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");
  });
});
