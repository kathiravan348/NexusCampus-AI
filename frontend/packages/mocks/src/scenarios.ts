import { HttpResponse, delay } from "msw";
import { MOCK_HEADER, apiError } from "./context";

/**
 * Switchable states for screens and tests, sent as the `X-Nexus-Scenario` header:
 * `empty` → lists come back empty, `error` → 500 `internal`, `slow` → 1.5 s delay, `offline` → network error.
 */
export const SCENARIOS = ["empty", "error", "slow", "offline"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const SLOW_DELAY_MS = 1500;

export function readScenario(request: Request): Scenario | null {
  const value = request.headers.get(MOCK_HEADER.scenario);
  return (SCENARIOS as readonly string[]).includes(value ?? "") ? (value as Scenario) : null;
}

/** Answers early for `error` / `offline`, waits for `slow`; `null` means handle the request normally. */
export async function applyScenario(scenario: Scenario | null): Promise<Response | null> {
  if (scenario === "offline") return HttpResponse.error();
  if (scenario === "error") return apiError(500, "internal");
  if (scenario === "slow") await delay(SLOW_DELAY_MS);
  return null;
}
