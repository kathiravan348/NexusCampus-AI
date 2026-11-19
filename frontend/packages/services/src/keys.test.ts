import { queryKeys } from "./keys";

const a = { tenantId: "t-a", userId: "u-1" };
const b = { tenantId: "t-a", userId: "u-2" };

describe("queryKeys", () => {
  it("starts every scoped key with tenant and user", () => {
    const keys = [
      queryKeys.scope(a),
      queryKeys.m01.tenant(a),
      queryKeys.m01.institutionProfile(a, "i-1"),
      queryKeys.m01.calendars(a, "i-1"),
      queryKeys.m01.localeSettings(a, null),
      queryKeys.m02.me(a),
      queryKeys.m03.theme(a, "c-1"),
      queryKeys.m03.fonts(a),
      queryKeys.m04.textOverrides(a, "en"),
      queryKeys.m05.plan(a),
      queryKeys.m05.entitlements(a),
      queryKeys.m05.usage(a),
    ];
    for (const key of keys) expect(key.slice(0, 4)).toEqual(["t", "t-a", "u", "u-1"]);
  });

  it("keeps users apart and nests module keys under the scope", () => {
    expect(queryKeys.m02.me(a)).not.toEqual(queryKeys.m02.me(b));
    expect(queryKeys.m01.tenant(a)).toEqual(["t", "t-a", "u", "u-1", "m01", "tenant"]);
  });

  it("gives the demo list a public key", () => {
    expect(queryKeys.demoTenants()[0]).toBe("public");
  });
});
