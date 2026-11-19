import { useIsRestoring } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiRequestError } from "../client";
import { setMockScenario } from "../session";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import {
  useCalendars,
  useDemoTenants,
  useInstitutionProfile,
  useLocaleSettings,
  useSaveCalendar,
  useSaveCampus,
  useTenant,
  useUpdateLocaleSettings,
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

  it("saves locale settings, campuses and calendars and invalidates queries", async () => {
    signInAs(ADMIN);
    const db = freshDb();
    const wrap = wrapper({ db });
    const { result } = renderHook(
      () => {
        const tenant = useTenant();
        const instId = tenant.data?.institutions[0]?.id ?? "";
        const calendars = useCalendars(instId || null);
        const locale = useLocaleSettings(instId || null);
        return {
          tenant,
          calendars,
          locale,
          updateLocale: useUpdateLocaleSettings(instId || null),
          saveCampus: useSaveCampus(),
          saveCalendar: useSaveCalendar(instId),
        };
      },
      { wrapper: wrap },
    );

    await waitFor(() => {
      expect(result.current.tenant.isSuccess).toBe(true);
      expect(result.current.calendars.isSuccess).toBe(true);
      expect(result.current.locale.isSuccess).toBe(true);
    });

    const inst = result.current.tenant.data!.institutions[0]!;
    const cal = result.current.calendars.data!.items[0]!;

    await act(async () => {
      await result.current.updateLocale.mutateAsync({
        ...inst.locale,
        timeZone: "UTC",
      });
    });
    await waitFor(() => expect(result.current.locale.data?.timeZone).toBe("UTC"));

    const beforeCampuses = result.current.tenant.data!.campuses.length;
    const created = await act(async () =>
      result.current.saveCampus.mutateAsync({
        data: {
          institutionId: inst.id,
          code: "RV-EAST",
          name: "East Campus",
          timeZone: null,
          address: { line1: "22 River St", city: "Bristol", countryCode: "GB" },
        },
      }),
    );
    await waitFor(() =>
      expect(result.current.tenant.data?.campuses.length).toBe(beforeCampuses + 1),
    );

    await act(async () => {
      await result.current.saveCampus.mutateAsync({
        id: created.id,
        data: {
          institutionId: inst.id,
          code: "RV-EAST",
          name: "East Wing",
          timeZone: "Europe/London",
          address: { line1: "22 River St", city: "Bristol", countryCode: "GB" },
        },
      });
    });
    await waitFor(() =>
      expect(result.current.tenant.data?.campuses.find((c) => c.id === created.id)?.name).toBe(
        "East Wing",
      ),
    );

    await act(async () => {
      await result.current.saveCalendar.mutateAsync({
        calendarId: cal.id,
        data: {
          academicYear: "2026-27",
          startsOn: cal.startsOn,
          endsOn: cal.endsOn,
          periods: cal.periods,
          holidays: [...cal.holidays, { date: "2026-12-25", name: "Winter Holiday" }],
          displayCalendar: cal.displayCalendar,
        },
      });
    });
    await waitFor(() =>
      expect(
        result.current.calendars.data?.items[0]?.holidays.some((h) => h.name === "Winter Holiday"),
      ).toBe(true),
    );

    await expect(
      result.current.saveCalendar.mutateAsync({
        calendarId: cal.id,
        data: {
          academicYear: "2026-27",
          startsOn: "2026-09-01",
          endsOn: "2027-07-21",
          periods: [
            { id: "p1", kind: "term", name: "A", startsOn: "2026-09-01", endsOn: "2026-12-20" },
            { id: "p2", kind: "term", name: "B", startsOn: "2026-12-01", endsOn: "2027-03-01" },
          ],
          holidays: [],
          displayCalendar: "gregory",
        },
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });
});
