import { describe, expect, it } from "vitest";
import {
  AffiliateConversionSchema,
  AffiliateSchema,
  CouponSchema,
  StoreOrderSchema,
  StoreProductSchema,
  StoreSubscriptionSchema,
  type Coupon,
  type StoreOrder,
  type StoreOrderStatus,
  type StoreProduct,
  type StoreSubscription,
} from "./index";

const product: StoreProduct = {
  id: "product-python",
  tenantId: "tenant-academy",
  institutionId: "institution-academy",
  kind: "course",
  refIds: ["space-python-basics"],
  slug: "python-basics",
  title: "Python basics",
  description: "Learn Python from zero in six weeks.",
  copySource: "ai_draft",
  price: 199900,
  currency: "INR",
  compareAtPrice: 299900,
  billingInterval: null,
  trialDays: null,
  status: "published",
  publishedByStaffProfileId: "staff-academy-lead",
  createdAt: "2026-06-01T08:00:00Z",
  updatedAt: "2026-06-02T08:00:00Z",
};
const coupon: Coupon = {
  id: "coupon-launch",
  tenantId: "tenant-academy",
  code: "LAUNCH-20",
  kind: "percent",
  percentBps: 2000,
  amount: null,
  currency: null,
  productIds: [],
  validFrom: "2026-06-01T00:00:00Z",
  validUntil: "2026-07-01T00:00:00Z",
  maxRedemptions: 100,
  redemptions: 12,
  active: true,
};
const order: StoreOrder = {
  id: "order-1",
  tenantId: "tenant-academy",
  buyerProfileId: null,
  buyerEmail: "buyer@example.org",
  learnerProfileId: "learner-sam",
  lines: [{ productId: product.id, unitPrice: 199900, quantity: 1, discount: 39980 }],
  couponId: coupon.id,
  subtotal: 199900,
  discountTotal: 39980,
  taxTotal: 28786,
  total: 188706,
  currency: "INR",
  status: "fulfilled",
  provider: "demo",
  gatewayReference: "demo-pay-7781",
  affiliateId: null,
  paidAt: "2026-06-10T09:00:00Z",
  createdAt: "2026-06-10T08:58:00Z",
};
const subscription: StoreSubscription = {
  id: "subscription-1",
  tenantId: "tenant-academy",
  productId: "product-all-access",
  learnerProfileId: "learner-sam",
  status: "active",
  currentPeriodStart: "2026-06-10T00:00:00Z",
  currentPeriodEnd: "2026-07-10T00:00:00Z",
  cancelAtPeriodEnd: false,
  provider: "demo",
  externalSubscriptionId: "demo-sub-1",
};

describe("products and coupons", () => {
  it("accepts one product of each kind and both coupon kinds", () => {
    expect(StoreProductSchema.safeParse(product).success).toBe(true);
    expect(
      StoreProductSchema.safeParse({
        ...product,
        id: "product-pack",
        kind: "session_pack",
        refIds: ["pack-10"],
      }).success,
    ).toBe(true);
    expect(
      StoreProductSchema.safeParse({
        ...product,
        id: "product-bundle",
        kind: "bundle",
        refIds: [product.id, "product-pack"],
      }).success,
    ).toBe(true);
    const sub = {
      ...product,
      id: "product-all-access",
      kind: "subscription",
      billingInterval: "month",
      trialDays: 7,
      compareAtPrice: null,
    };
    expect(StoreProductSchema.safeParse(sub).success).toBe(true);
    expect(CouponSchema.safeParse(coupon).success).toBe(true);
    const amountOff = {
      ...coupon,
      kind: "amount",
      percentBps: null,
      amount: 50000,
      currency: "INR",
    };
    expect(CouponSchema.safeParse(amountOff).success).toBe(true);
  });

  it("rejects bad products and coupons", () => {
    expect(
      StoreProductSchema.safeParse({ ...product, kind: "bundle", refIds: [product.id] }).success,
    ).toBe(false);
    expect(
      StoreProductSchema.safeParse({ ...product, compareAtPrice: product.price }).success,
    ).toBe(false);
    expect(StoreProductSchema.safeParse({ ...product, kind: "subscription" }).success).toBe(false);
    expect(
      StoreProductSchema.safeParse({ ...product, publishedByStaffProfileId: null }).success,
    ).toBe(false);
    expect(StoreProductSchema.safeParse({ ...product, slug: "Python Basics" }).success).toBe(false);
    expect(
      CouponSchema.safeParse({ ...coupon, kind: "amount", percentBps: null, amount: 50000 })
        .success,
    ).toBe(false);
    expect(CouponSchema.safeParse({ ...coupon, redemptions: 101 }).success).toBe(false);
    expect(CouponSchema.safeParse({ ...coupon, validUntil: coupon.validFrom }).success).toBe(false);
  });
});

describe("orders", () => {
  it("accepts an order in each status", () => {
    const unpaid = { paidAt: null, gatewayReference: null, learnerProfileId: null };
    const byStatus: Record<StoreOrderStatus, StoreOrder> = {
      pending: { ...order, ...unpaid, status: "pending" },
      paid: { ...order, status: "paid", learnerProfileId: null },
      fulfilled: order,
      refunded: { ...order, status: "refunded" },
      cancelled: { ...order, ...unpaid, status: "cancelled" },
      failed: { ...order, ...unpaid, status: "failed" },
    };
    for (const value of Object.values(byStatus)) {
      expect(StoreOrderSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects totals that do not add up, card data and early payment times", () => {
    expect(StoreOrderSchema.safeParse({ ...order, subtotal: 199901 }).success).toBe(false);
    expect(StoreOrderSchema.safeParse({ ...order, total: 188707 }).success).toBe(false);
    expect(StoreOrderSchema.safeParse({ ...order, discountTotal: 0 }).success).toBe(false);
    const overDiscount = [{ productId: product.id, unitPrice: 100, quantity: 1, discount: 101 }];
    expect(StoreOrderSchema.safeParse({ ...order, lines: overDiscount }).success).toBe(false);
    expect(StoreOrderSchema.safeParse({ ...order, status: "pending" }).success).toBe(false);
    expect(StoreOrderSchema.safeParse({ ...order, cardNumber: "4111111111111111" }).success).toBe(
      false,
    );
  });
});

describe("subscriptions and affiliates", () => {
  it("accepts each subscription status and an affiliate with a conversion", () => {
    for (const status of ["trialing", "active", "past_due", "cancelled", "expired"] as const) {
      expect(StoreSubscriptionSchema.safeParse({ ...subscription, status }).success).toBe(true);
    }
    const affiliate = {
      id: "affiliate-1",
      tenantId: "tenant-academy",
      name: "Code Club blog",
      code: "CODECLUB",
      commissionBps: 1000,
      payoutEmail: "payouts@example.org",
      status: "active",
    };
    expect(AffiliateSchema.safeParse(affiliate).success).toBe(true);
    expect(AffiliateSchema.safeParse({ ...affiliate, commissionBps: 6000 }).success).toBe(false);
    const conversion = {
      id: "conversion-1",
      tenantId: "tenant-academy",
      affiliateId: affiliate.id,
      orderId: order.id,
      commission: 15990,
      currency: "INR",
      status: "approved",
    };
    expect(AffiliateConversionSchema.safeParse(conversion).success).toBe(true);
  });

  it("rejects a period that does not move forward", () => {
    expect(
      StoreSubscriptionSchema.safeParse({
        ...subscription,
        currentPeriodEnd: subscription.currentPeriodStart,
      }).success,
    ).toBe(false);
  });
});
