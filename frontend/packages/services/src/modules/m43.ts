import {
  AffiliateConversionSchema,
  AffiliateSchema,
  CouponSchema,
  PAGE_SIZE_MAX,
  StoreOrderSchema,
  StoreProductSchema,
  StoreSubscriptionSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const StoreProductPage = pageSchema(StoreProductSchema);
const CouponPage = pageSchema(CouponSchema);
const StoreOrderPage = pageSchema(StoreOrderSchema);
const StoreSubscriptionPage = pageSchema(StoreSubscriptionSchema);
const AffiliatePage = pageSchema(AffiliateSchema);
const AffiliateConversionPage = pageSchema(AffiliateConversionSchema);

export function useStoreProducts() {
  return useScopedQuery(
    (s) => queryKeys.m43.storeProducts(s),
    (c, signal) => c.get("/store-products", StoreProductPage, all, { signal }),
  );
}

export function useStoreProduct(productId: string) {
  return useScopedQuery(
    (s) => queryKeys.m43.storeProduct(s, productId),
    (c, signal) =>
      c.get(`/store-products/${encodeURIComponent(productId)}`, StoreProductSchema, undefined, {
        signal,
      }),
  );
}

export function useCoupons() {
  return useScopedQuery(
    (s) => queryKeys.m43.coupons(s),
    (c, signal) => c.get("/coupons", CouponPage, all, { signal }),
  );
}

export function useStoreOrders() {
  return useScopedQuery(
    (s) => queryKeys.m43.storeOrders(s),
    (c, signal) => c.get("/store-orders", StoreOrderPage, all, { signal }),
  );
}

export function useStoreOrder(orderId: string) {
  return useScopedQuery(
    (s) => queryKeys.m43.storeOrder(s, orderId),
    (c, signal) =>
      c.get(`/store-orders/${encodeURIComponent(orderId)}`, StoreOrderSchema, undefined, {
        signal,
      }),
  );
}

export function useStoreSubscriptions() {
  return useScopedQuery(
    (s) => queryKeys.m43.storeSubscriptions(s),
    (c, signal) => c.get("/store-subscriptions", StoreSubscriptionPage, all, { signal }),
  );
}

export function useAffiliates() {
  return useScopedQuery(
    (s) => queryKeys.m43.affiliates(s),
    (c, signal) => c.get("/affiliates", AffiliatePage, all, { signal }),
  );
}

export function useAffiliateConversions() {
  return useScopedQuery(
    (s) => queryKeys.m43.affiliateConversions(s),
    (c, signal) => c.get("/affiliate-conversions", AffiliateConversionPage, all, { signal }),
  );
}
