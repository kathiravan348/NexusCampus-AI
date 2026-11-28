import {
  AffiliateConversionSchema,
  AffiliateSchema,
  CouponSchema,
  StoreOrderSchema,
  StoreProductSchema,
  StoreSubscriptionSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok } from "./route";

const STORE = { module: "M43", permission: "m43.store.read" } as const;
const ORDER = { module: "M43", permission: "m43.order.read" } as const;
const MANAGE = { module: "M43", permission: "m43.store.manage" } as const;

export const m43Handlers = [
  get("/store-products", STORE, (ctx) =>
    list(ctx, ofTenant(mockDb.storeProducts, ctx.viewer.tenantId), pageSchema(StoreProductSchema)),
  ),
  get("/store-products/:id", STORE, (ctx) =>
    ok(
      StoreProductSchema,
      found(
        ofTenant(mockDb.storeProducts, ctx.viewer.tenantId).find(
          (row) => row.id === ctx.params["id"],
        ),
      ),
    ),
  ),
  get("/coupons", STORE, (ctx) =>
    list(ctx, ofTenant(mockDb.coupons, ctx.viewer.tenantId), pageSchema(CouponSchema)),
  ),
  get("/store-orders", ORDER, (ctx) =>
    list(ctx, ofTenant(mockDb.storeOrders, ctx.viewer.tenantId), pageSchema(StoreOrderSchema)),
  ),
  get("/store-orders/:id", ORDER, (ctx) =>
    ok(
      StoreOrderSchema,
      found(
        ofTenant(mockDb.storeOrders, ctx.viewer.tenantId).find(
          (row) => row.id === ctx.params["id"],
        ),
      ),
    ),
  ),
  get("/store-subscriptions", ORDER, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.storeSubscriptions, ctx.viewer.tenantId),
      pageSchema(StoreSubscriptionSchema),
    ),
  ),
  get("/affiliates", MANAGE, (ctx) =>
    list(ctx, ofTenant(mockDb.affiliates, ctx.viewer.tenantId), pageSchema(AffiliateSchema)),
  ),
  get("/affiliate-conversions", MANAGE, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.affiliateConversions, ctx.viewer.tenantId),
      pageSchema(AffiliateConversionSchema),
    ),
  ),
];
