import { describe, expect, it, vi } from "vitest";
import { bootMark, reportBoot } from "./bootTiming";

describe("boot timing (dev only)", () => {
  it("logs one [timing] boot:campus line with the steps", () => {
    performance.clearMarks();
    bootMark("entry");
    bootMark("msw-ready");
    const log = vi.fn();
    reportBoot(log);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toMatch(
      /^\[timing\] boot:campus: \d+\.\d\ds \(budget 3\.0s — (OK|WARN: over budget)\) \[entry .* → msw-ready .* → mounted .*\]$/,
    );
  });
});
