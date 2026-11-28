import { STORE_ORDER, STORE_PRODUCT, TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useAffiliateConversions,
  useAffiliates,
  useCoupons,
  useStoreOrder,
  useStoreOrders,
  useStoreProduct,
  useStoreProducts,
  useStoreSubscriptions,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M43 hooks", () => {
  it("loads and parses store lists and details", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.harmony, userId: USER.hmWeiLing });
    const { result } = renderHook(
      () => ({
        products: useStoreProducts(),
        product: useStoreProduct(STORE_PRODUCT.hmCourse),
        coupons: useCoupons(),
        orders: useStoreOrders(),
        order: useStoreOrder(STORE_ORDER.hmRefunded),
        subscriptions: useStoreSubscriptions(),
        affiliates: useAffiliates(),
        conversions: useAffiliateConversions(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { products, product, coupons, orders, order } = result.current;
      const { subscriptions, affiliates, conversions } = result.current;
      expect(products.data?.total).toBe(4);
      expect(product.data?.id).toBe(STORE_PRODUCT.hmCourse);
      expect(coupons.data?.total).toBe(1);
      expect(orders.data?.total).toBe(3);
      expect(order.data?.id).toBe(STORE_ORDER.hmRefunded);
      expect(subscriptions.data?.total).toBe(2);
      expect(affiliates.data?.total).toBe(1);
      expect(conversions.data?.total).toBe(1);
    });
  });
});
