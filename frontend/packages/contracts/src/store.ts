import { z } from "zod";
import {
  CurrencyCodeSchema,
  EmailSchema,
  IdSchema,
  MinorUnitsSchema,
  UtcDateTimeSchema,
} from "./common";

/**
 * M43 online academy store (NEX-255, D87 rules 1–2). Checkout is the payment provider's hosted page — card numbers never
 * reach NexusCampus, and `gatewayReference` never holds card data; provider keys live in settings / OpenBao; with no
 * provider configured the store is hidden (D19–D20). A minor cannot buy (a guardian does). Refund rights and tax display
 * follow the region pack. AI-drafted page copy is published only by a person (A-4). Money is integer minor units plus
 * a currency (D9).
 */

const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const ProviderKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/);
const CodeSchema = z.string().regex(/^[A-Z0-9-]{4,32}$/);

export const StoreProductKindSchema = z.enum(["course", "session_pack", "bundle", "subscription"]);
export type StoreProductKind = z.infer<typeof StoreProductKindSchema>;

export const StoreProductSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    kind: StoreProductKindSchema,
    /** Course spaces, session packs, or — for a bundle — other product ids. */
    refIds: z.array(IdSchema).min(1).max(20).refine(isUnique, { message: "ids must be unique" }),
    slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10000),
    copySource: z.enum(["manual", "ai_draft"]),
    price: MinorUnitsSchema.min(0),
    currency: CurrencyCodeSchema,
    compareAtPrice: MinorUnitsSchema.nullable(),
    billingInterval: z.enum(["month", "year"]).nullable(),
    trialDays: z.int().min(0).max(90).nullable(),
    status: z.enum(["draft", "published", "archived"]),
    publishedByStaffProfileId: IdSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((product) => Date.parse(product.updatedAt) >= Date.parse(product.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  })
  .refine((product) => product.kind !== "bundle" || !product.refIds.includes(product.id), {
    message: "a bundle cannot contain itself",
    path: ["refIds"],
  })
  .refine((product) => product.compareAtPrice === null || product.compareAtPrice > product.price, {
    message: "compareAtPrice must be above price",
    path: ["compareAtPrice"],
  })
  .refine(
    (product) =>
      (product.kind === "subscription") === (product.billingInterval !== null) &&
      (product.kind === "subscription") === (product.trialDays !== null),
    {
      message: "billingInterval and trialDays are set exactly for subscriptions",
      path: ["billingInterval"],
    },
  )
  .refine(
    (product) => (product.status === "published") === (product.publishedByStaffProfileId !== null),
    {
      message: "a person publishes a product",
      path: ["publishedByStaffProfileId"],
    },
  );
export type StoreProduct = z.infer<typeof StoreProductSchema>;

export const CouponSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    code: CodeSchema,
    kind: z.enum(["percent", "amount"]),
    percentBps: z.int().min(1).max(10000).nullable(),
    amount: MinorUnitsSchema.min(1).nullable(),
    currency: CurrencyCodeSchema.nullable(),
    /** Empty = every product. */
    productIds: z.array(IdSchema).max(50).refine(isUnique, { message: "ids must be unique" }),
    validFrom: UtcDateTimeSchema,
    validUntil: UtcDateTimeSchema.nullable(),
    maxRedemptions: z.int().min(1).nullable(),
    redemptions: z.int().min(0),
    active: z.boolean(),
  })
  .refine((coupon) => (coupon.kind === "percent") === (coupon.percentBps !== null), {
    message: "percentBps is set exactly for percent coupons",
    path: ["percentBps"],
  })
  .refine(
    (coupon) =>
      (coupon.kind === "amount") === (coupon.amount !== null) &&
      (coupon.kind === "amount") === (coupon.currency !== null),
    { message: "amount and currency are set exactly for amount coupons", path: ["amount"] },
  )
  .refine(
    (coupon) =>
      coupon.validUntil === null || Date.parse(coupon.validUntil) > Date.parse(coupon.validFrom),
    {
      message: "validUntil must be after validFrom",
      path: ["validUntil"],
    },
  )
  .refine(
    (coupon) => coupon.maxRedemptions === null || coupon.redemptions <= coupon.maxRedemptions,
    {
      message: "redemptions are above maxRedemptions",
      path: ["redemptions"],
    },
  );
export type Coupon = z.infer<typeof CouponSchema>;

export const OrderLineSchema = z
  .strictObject({
    productId: IdSchema,
    unitPrice: MinorUnitsSchema.min(0),
    quantity: z.int().min(1).max(10),
    discount: MinorUnitsSchema.min(0),
  })
  .refine((line) => line.discount <= line.unitPrice * line.quantity, {
    message: "discount is above the line value",
    path: ["discount"],
  });
export type OrderLine = z.infer<typeof OrderLineSchema>;

export const StoreOrderStatusSchema = z.enum([
  "pending",
  "paid",
  "fulfilled",
  "refunded",
  "cancelled",
  "failed",
]);
export type StoreOrderStatus = z.infer<typeof StoreOrderStatusSchema>;

export const StoreOrderSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    /** Null for a guest checkout. */
    buyerProfileId: IdSchema.nullable(),
    /** Personal data (V-7). */
    buyerEmail: EmailSchema,
    learnerProfileId: IdSchema.nullable(),
    lines: z.array(OrderLineSchema).min(1).max(20),
    couponId: IdSchema.nullable(),
    subtotal: MinorUnitsSchema.min(0),
    discountTotal: MinorUnitsSchema.min(0),
    taxTotal: MinorUnitsSchema.min(0),
    total: MinorUnitsSchema.min(0),
    currency: CurrencyCodeSchema,
    status: StoreOrderStatusSchema,
    provider: ProviderKeySchema,
    /** The provider's payment reference; never card data. */
    gatewayReference: z.string().trim().min(1).max(200).nullable(),
    affiliateId: IdSchema.nullable(),
    paidAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
  })
  .refine(
    (order) =>
      order.subtotal === order.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    {
      message: "subtotal does not match the lines",
      path: ["subtotal"],
    },
  )
  .refine(
    (order) => order.discountTotal === order.lines.reduce((sum, line) => sum + line.discount, 0),
    {
      message: "discountTotal does not match the lines",
      path: ["discountTotal"],
    },
  )
  .refine((order) => order.total === order.subtotal - order.discountTotal + order.taxTotal, {
    message: "total is not subtotal − discounts + tax",
    path: ["total"],
  })
  .refine(
    (order) =>
      (order.status === "paid" || order.status === "fulfilled" || order.status === "refunded") ===
      (order.paidAt !== null),
    { message: "paidAt is set exactly for paid, fulfilled and refunded orders", path: ["paidAt"] },
  );
export type StoreOrder = z.infer<typeof StoreOrderSchema>;

export const StoreSubscriptionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    productId: IdSchema,
    learnerProfileId: IdSchema,
    status: z.enum(["trialing", "active", "past_due", "cancelled", "expired"]),
    currentPeriodStart: UtcDateTimeSchema,
    currentPeriodEnd: UtcDateTimeSchema,
    cancelAtPeriodEnd: z.boolean(),
    provider: ProviderKeySchema,
    externalSubscriptionId: z.string().trim().min(1).max(200).nullable(),
  })
  .refine(
    (subscription) =>
      Date.parse(subscription.currentPeriodEnd) > Date.parse(subscription.currentPeriodStart),
    {
      message: "currentPeriodEnd must be after currentPeriodStart",
      path: ["currentPeriodEnd"],
    },
  );
export type StoreSubscription = z.infer<typeof StoreSubscriptionSchema>;

export const AffiliateSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  name: z.string().trim().min(1).max(200),
  code: CodeSchema,
  commissionBps: z.int().min(1).max(5000),
  /** Personal data (V-7). */
  payoutEmail: EmailSchema,
  status: z.enum(["active", "paused"]),
});
export type Affiliate = z.infer<typeof AffiliateSchema>;

export const AffiliateConversionSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  affiliateId: IdSchema,
  orderId: IdSchema,
  commission: MinorUnitsSchema.min(0),
  currency: CurrencyCodeSchema,
  status: z.enum(["pending", "approved", "paid", "reversed"]),
});
export type AffiliateConversion = z.infer<typeof AffiliateConversionSchema>;
