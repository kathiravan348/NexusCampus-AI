import { I18nProvider } from "@nexus/i18n";
import { SessionProvider } from "@nexus/services";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RealSignIn } from "./RealSignIn";

describe("RealSignIn", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends the user to the backend sign-in and back to where they were going", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(
      <I18nProvider locale="en">
        <SessionProvider mode="mock">
          <MemoryRouter initialEntries={[{ pathname: "/sign-in", state: { from: "/m01" } }]}>
            <RealSignIn />
          </MemoryRouter>
        </SessionProvider>
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with your institution account" }));
    expect(assign).toHaveBeenCalledWith("/api/v1/auth/login?returnTo=%2Fm01");
    vi.unstubAllGlobals();
  });
});
