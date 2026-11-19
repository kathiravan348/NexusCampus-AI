import { brand } from "@nexus/brand";
import { setMockScenario } from "@nexus/services";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../test/renderApp";

describe("SignIn", () => {
  afterEach(() => {
    setMockScenario(null);
  });

  it("lists all demo institutions and signs in as the chosen persona", async () => {
    renderApp("/sign-in");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sign in to a demo institution" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.getByText(brand.name)).toBeInTheDocument();
    expect(document.querySelector(`img[src="${brand.logo.mark}"]`)).toHaveAttribute("alt", "");

    const btn = await screen.findByRole("button", {
      name: /Sign in to Little Steps.*as Administrator/,
    });
    fireEvent.click(btn);
    expect(await screen.findByRole("heading", { level: 1, name: /Priya/ })).toBeInTheDocument();
  });

  it("shows an empty state when no demo institutions are returned", async () => {
    setMockScenario("empty");
    renderApp("/sign-in");
    expect(
      await screen.findByRole("heading", { name: "No demo institutions are available." }),
    ).toBeInTheDocument();
  });

  it("shows an error state with retry when loading fails", async () => {
    setMockScenario("error");
    renderApp("/sign-in");
    expect(
      await screen.findByRole("heading", { name: "The demo institutions could not be loaded." }),
    ).toBeInTheDocument();

    setMockScenario(null);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: /Sign in to Little Steps.*as Administrator/ }),
    ).toBeInTheDocument();
  });
});
