import { I18nProvider } from "@nexus/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { NotFound } from "./NotFound";

describe("NotFound", () => {
  it("renders the not-found notice and home link", () => {
    render(
      <I18nProvider locale="en">
        <MemoryRouter>
          <NotFound />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");
  });
});
