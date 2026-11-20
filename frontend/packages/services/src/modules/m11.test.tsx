import { DEMO_PERSONAS, TENANT } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiRequestError } from "../client";
import { freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import { assistReason, useAiCredits, useAiSettings, useAskAssist, useSaveAiSettings } from "./m11";

startMockServer();

const RV_ADMIN = DEMO_PERSONAS.find(
  (p) => p.tenantId === TENANT.riverside && p.labelKey === "m02.persona.admin",
)!;

describe("m11 hooks", () => {
  it("asks Assist, gets a sourced answer and refreshed credits", async () => {
    signInAs(RV_ADMIN);
    const { result } = renderHook(() => ({ credits: useAiCredits(), ask: useAskAssist() }), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(result.current.credits.isSuccess).toBe(true));
    const before = result.current.credits.data!.items[0]!.used;
    const res = await act(() =>
      result.current.ask.mutateAsync({
        question: "When does the autumn term end?",
        locale: "en-GB",
      }),
    );
    expect(res.answer?.sources.length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(result.current.credits.data!.items[0]!.used).toBe(before + res.answer!.creditsUsed),
    );
  });

  it("saves settings", async () => {
    signInAs(RV_ADMIN);
    const { result } = renderHook(() => ({ s: useAiSettings(), save: useSaveAiSettings() }), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(result.current.s.isSuccess).toBe(true));
    const saved = await act(() =>
      result.current.save.mutateAsync({
        enabled: true,
        modules: { M01: true },
        safeguardingEnabled: false,
        defaultTier: "reasoning",
      }),
    );
    expect(saved.defaultTier).toBe("reasoning");
  });

  it("maps refusals to reasons", () => {
    const err = (status: number, code: string, path?: string) =>
      new ApiRequestError(status, {
        code: code as never,
        message: "x",
        ...(path ? { details: [{ path, message: "x" }] } : {}),
      });
    expect(assistReason(err(403, "module_disabled"))).toBe("not_entitled");
    expect(assistReason(err(403, "forbidden", "ai_off"))).toBe("ai_off");
    expect(assistReason(err(403, "forbidden", "consent"))).toBe("minor_consent_missing");
    expect(assistReason(err(429, "rate_limited", "credits"))).toBe("no_credits");
    expect(assistReason(err(0, "internal"))).toBe("offline");
    expect(assistReason(new Error("x"))).toBeNull();
  });
});
