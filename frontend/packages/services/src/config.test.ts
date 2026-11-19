import { API_BASE, DATA_MODE, resolveDataMode } from "./config";

describe("config", () => {
  it("defaults to mock in dev and real otherwise", () => {
    expect(resolveDataMode(undefined, true)).toBe("mock");
    expect(resolveDataMode("", false)).toBe("real");
    expect(resolveDataMode(undefined, false)).toBe("real");
  });

  it("accepts an explicit mode", () => {
    expect(resolveDataMode("real", true)).toBe("real");
    expect(resolveDataMode("mock", false)).toBe("mock");
  });

  it("throws on any other value", () => {
    expect(() => resolveDataMode("staging", true)).toThrow(/VITE_DATA_MODE/);
  });

  it("runs tests in mock mode under /api/v1", () => {
    expect(DATA_MODE).toBe("mock");
    expect(API_BASE).toBe("/api/v1");
  });
});
