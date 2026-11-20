import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  options: null as null | { onNeedRefresh?: () => void; onOfflineReady?: () => void },
  update: vi.fn(() => Promise.resolve()),
  calls: 0,
}));

vi.mock("virtual:pwa-register", () => ({
  registerSW: (options: typeof hooks.options) => {
    hooks.options = options;
    hooks.calls += 1;
    return hooks.update;
  },
}));

import { resetPwaForTests, usePwaUpdate } from "./registerPwa";

describe("usePwaUpdate", () => {
  beforeEach(() => {
    resetPwaForTests();
    hooks.options = null;
    hooks.calls = 0;
    hooks.update.mockClear();
  });

  it("registers the service worker once and starts with nothing to show", () => {
    const a = renderHook(() => usePwaUpdate());
    renderHook(() => usePwaUpdate());
    expect(hooks.calls).toBe(1);
    expect(a.result.current.needRefresh).toBe(false);
    expect(a.result.current.offlineReady).toBe(false);
  });

  it("reports a waiting version and reloads into it on update()", () => {
    const { result } = renderHook(() => usePwaUpdate());
    act(() => hooks.options?.onNeedRefresh?.());
    expect(result.current.needRefresh).toBe(true);
    result.current.update();
    expect(hooks.update).toHaveBeenCalledWith(true);
    act(() => result.current.dismissRefresh());
    expect(result.current.needRefresh).toBe(false);
  });

  it("reports offline readiness until dismissed", () => {
    const { result } = renderHook(() => usePwaUpdate());
    act(() => hooks.options?.onOfflineReady?.());
    expect(result.current.offlineReady).toBe(true);
    act(() => result.current.dismissOfflineReady());
    expect(result.current.offlineReady).toBe(false);
  });
});
