import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useContentAssets, useContentAttempts, useContentItem, useContentItems } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M31 hooks", () => {
  it("loads content, asset metadata and attempts for a selected item", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const items = useContentItems();
        const itemId =
          items.data?.items.find((row) => row.kind === "lesson" && row.status === "published")
            ?.id ?? null;
        return {
          items,
          item: useContentItem(itemId),
          assets: useContentAssets(),
          attempts: useContentAttempts(itemId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { items, item, assets, attempts } = result.current;
      expect(items.data?.total).toBe(3);
      expect(item.data).toMatchObject({ kind: "lesson", status: "published" });
      expect(assets.data?.total).toBe(6);
      expect(attempts.data?.total).toBe(1);
      expect(attempts.data?.items[0]?.contentItemId).toBe(item.data?.id);
    });
  });
});
