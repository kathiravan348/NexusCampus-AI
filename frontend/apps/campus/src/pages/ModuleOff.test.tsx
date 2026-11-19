import { I18nProvider } from "@nexus/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ModuleOff } from "./ModuleOff";

describe("ModuleOff", () => {
  it("renders the not-in-plan notice and home link", () => {
    render(
      <I18nProvider locale="en">
        <MemoryRouter>
          <ModuleOff />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Not in your plan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");
  });
});
