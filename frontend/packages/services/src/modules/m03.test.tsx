import { DEMO_PERSONAS, FONT, TENANT, USER } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import { useTenant } from "./m01";
import { useFonts, useSaveTheme, useTheme } from "./m03";

startMockServer();

const NB_ADMIN = DEMO_PERSONAS.find(
  (p) => p.tenantId === TENANT.northbridge && p.userId === USER.nbRobert,
)!;

describe("m03 hooks", () => {
  it("loads the effective theme, a campus theme and the font library", async () => {
    signInAs(ADMIN);
    const db = freshDb();
    const tenant = renderHook(() => useTenant(), { wrapper: wrapper({ db }) });
    await waitFor(() => expect(tenant.result.current.isSuccess).toBe(true));
    const campusId = tenant.result.current.data?.campuses[0]?.id ?? null;

    const { result } = renderHook(
      () => ({ theme: useTheme(), campus: useTheme(campusId), fonts: useFonts() }),
      { wrapper: wrapper({ db }) },
    );
    await waitFor(() => {
      expect(result.current.theme.isSuccess).toBe(true);
      expect(result.current.campus.isSuccess).toBe(true);
      expect(result.current.fonts.isSuccess).toBe(true);
    });
    expect(result.current.theme.data?.layers.every((l) => l.tenantId === ADMIN.tenantId)).toBe(
      true,
    );
    expect(result.current.theme.data?.effective.light).toBeTypeOf("object");
    expect(result.current.fonts.data?.items.length).toBeGreaterThan(0);
  });

  it("saves the institution theme and invalidates cached theme queries", async () => {
    signInAs(NB_ADMIN);
    const db = freshDb();
    const { result } = renderHook(() => ({ theme: useTheme(), save: useSaveTheme() }), {
      wrapper: wrapper({ db }),
    });
    await waitFor(() => expect(result.current.theme.isSuccess).toBe(true));
    const beforeVersion =
      result.current.theme.data?.layers.find((l) => l.scope.kind === "institution")?.version ?? 0;

    await act(async () => {
      const outcome = await result.current.save.mutateAsync({
        light: {
          "brand-primary": "#0F5132",
          "brand-primary-text": "#0F5132",
          "on-brand": "#FFFFFF",
        },
        dark: {
          "brand-primary": "#5EEAD4",
          "brand-primary-text": "#5EEAD4",
          "on-brand": "#0B1122",
        },
        fonts: { sans: FONT.inter, mono: FONT.jetbrainsMono },
        radius: { "radius-md": "6px" },
        density: "compact",
        assets: { logoUrl: "/demo/northbridge/logo.svg", faviconUrl: null, loginImageUrl: null },
      });
      expect(outcome.queued).toBe(false);
    });

    await waitFor(() => {
      const afterVersion =
        result.current.theme.data?.layers.find((l) => l.scope.kind === "institution")?.version ?? 0;
      expect(afterVersion).toBe(beforeVersion + 1);
      expect(result.current.theme.data?.effective.light["brand-primary"]).toBe("#0F5132");
    });
  });
});
