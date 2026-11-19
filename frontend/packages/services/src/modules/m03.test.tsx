import { renderHook, waitFor } from "@testing-library/react";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import { useTenant } from "./m01";
import { useFonts, useTheme } from "./m03";

startMockServer();

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
});
