import { STAFF, STAFF_USERS } from "@nexus/mocks/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ControlProviders } from "../App";
import { CONTROL_MODULES } from "../app/modules";
import { controlRoutes } from "../app/router";

const NISHA = STAFF_USERS.find((s) => s.id === STAFF.admin)!;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const unauthorized = () =>
  json(401, {
    error: { code: "unauthorized", message: "Sign in to Nexus Control.", requestId: "req-1" },
  });

/** A fake control backend: `/me` answers with `me()`, logout returns the sign-in service's sign-out address. */
function backend(me: () => Response) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/control/api/v1/me") return me();
    if (url.pathname === "/control/api/v1/auth/logout")
      return json(200, { redirect: "https://sso.test/logout" });
    return json(200, { items: [], page: 1, pageSize: 100, total: 0 });
  });
  return { calls, fetchImpl };
}

function renderReal(path: string, fetchImpl: typeof fetch, navigate: (url: string) => void) {
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), { initialEntries: [path] });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      services={{ mode: "real", fetch: fetchImpl, navigate }}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("Control sign-in in real mode (NEX-100)", () => {
  it("without a session, shows only the work-account sign-in link", async () => {
    const { fetchImpl } = backend(unauthorized);
    renderReal("/", fetchImpl, vi.fn());
    const link = await screen.findByRole("link", { name: "Sign in with your work account" });
    expect(link).toHaveAttribute("href", "/control/api/v1/auth/login?returnTo=%2F");
    expect(screen.getByText(/6-digit code from your authenticator app/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in as/ })).not.toBeInTheDocument();
  });

  it("with a session, opens Control; sign-out ends it on the server and in the sign-in service", async () => {
    const session = {
      staff: NISHA,
      permissions: ["ctl.account.read"],
      mfaVerified: true,
      expiresAt: "2026-11-22T13:00:00Z",
    };
    const { calls, fetchImpl } = backend(() => json(200, session));
    const navigate = vi.fn();
    renderReal("/", fetchImpl, navigate);
    expect(await screen.findByText(NISHA.displayName)).toBeInTheDocument();
    expect(
      screen.queryByText("Demo data. Nothing on this screen is real."),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://sso.test/logout"));
    expect(calls).toContain("POST /control/api/v1/auth/logout");
  });
});
