import { controlHandlers, STAFF } from "@nexus/mocks/control";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { AccountSchema, pageSchema } from "@nexus/contracts";
import { useControlQuery, useDemoStaff, useStaffCan, useStaffSession } from "./hooks";
import { CONTROL_STAFF_KEY, ControlServicesProvider, useControlServices } from "./provider";

const server = setupServer(...controlHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());

const wrapper = ({ children }: { children: ReactNode }) => (
  <ControlServicesProvider
    mode="mock"
    createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </ControlServicesProvider>
);

const AccountPage = pageSchema(AccountSchema);

describe("Control services", () => {
  it("lists demo staff without signing in, and stays idle until someone signs in", async () => {
    const { result } = renderHook(() => ({ demo: useDemoStaff(), me: useStaffSession() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.demo.data?.total).toBe(9));
    expect(result.current.me.fetchStatus).toBe("idle");
  });

  it("sends the staff header after sign-in and clears everything on sign-out", async () => {
    const { result } = renderHook(
      () => ({
        services: useControlServices(),
        me: useStaffSession(),
        can: useStaffCan(),
        accounts: useControlQuery("/accounts", AccountPage),
      }),
      { wrapper },
    );
    act(() => result.current.services.signIn(STAFF.partnerUser));
    await waitFor(() => expect(result.current.me.data?.staff.id).toBe(STAFF.partnerUser));
    expect(sessionStorage.getItem(CONTROL_STAFF_KEY)).toBe(STAFF.partnerUser);
    expect(result.current.can("ctl.deal.submit")).toBe(true);
    expect(result.current.can("ctl.billing.read")).toBe(false);
    await waitFor(() => expect(result.current.accounts.data?.total).toBe(2));

    act(() => result.current.services.signOut());
    expect(result.current.services.staffId).toBeNull();
    expect(sessionStorage.getItem(CONTROL_STAFF_KEY)).toBeNull();
    await waitFor(() => expect(result.current.me.data).toBeUndefined());
  });
});
