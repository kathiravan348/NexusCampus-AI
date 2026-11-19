import { useIsRestoring } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { setMockScenario } from "../session";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import {
  useCalendars,
  useDemoTenants,
  useInstitutionProfile,
  useLocaleSettings,
  useTenant,
} from "./m01";

startMockServer();

describe("m01 hooks", () => {
  it("lists demo tenants without a session", async () => {
    const { result } = renderHook(() => useDemoTenants(), { wrapper: wrapper({ db: freshDb() }) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.some((t) => t.tenantId === ADMIN.tenantId)).toBe(true);
    expect(result.current.data?.[0]?.personas.length).toBeGreaterThan(0);
  });

  it("returns the empty demo list in the empty scenario", async () => {
    setMockScenario("empty");
    const { result } = renderHook(() => useDemoTenants(), { wrapper: wrapper({ db: freshDb() }) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("loads the tenant, then the institution's profile, calendars and locale", async () => {
    signInAs(ADMIN);
    const db = freshDb();
    const tenant = renderHook(() => useTenant(), { wrapper: wrapper({ db }) });
    await waitFor(() => expect(tenant.result.current.isSuccess).toBe(true));
    const institution = tenant.result.current.data?.institutions[0];
    expect(institution?.tenantId).toBe(ADMIN.tenantId);
    const id = institution?.id ?? null;

    const { result } = renderHook(
      () => ({
        profile: useInstitutionProfile(id),
        calendars: useCalendars(id),
        locale: useLocaleSettings(id),
        firstLocale: useLocaleSettings(),
      }),
      { wrapper: wrapper({ db }) },
    );
    await waitFor(() => {
      expect(result.current.profile.isSuccess).toBe(true);
      expect(result.current.calendars.isSuccess).toBe(true);
      expect(result.current.locale.isSuccess).toBe(true);
      expect(result.current.firstLocale.isSuccess).toBe(true);
    });
    expect(result.current.profile.data?.type).toBe(institution?.type);
    expect(result.current.calendars.data?.items.every((c) => c.institutionId === id)).toBe(true);
    expect(result.current.locale.data).toEqual(institution?.locale);
    expect(result.current.firstLocale.data).toEqual(institution?.locale);
  });

  it("stays idle without an institution id", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({ profile: useInstitutionProfile(null), restoring: useIsRestoring() }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(result.current.profile.fetchStatus).toBe("idle");
  });
});
