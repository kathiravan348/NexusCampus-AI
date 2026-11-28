import type * as C from "@nexus/contracts";
import { INSTITUTION as I, PERSON as P, TENANT as T } from "./ids";
import { COURSE_SPACE as CS } from "./ids-stage4-learning";
import { SESSION_PACK as SP } from "./ids-stage4-more";
import {
  AFFILIATE as AFF,
  AFFILIATE_CONVERSION as AFC,
  COUPON as CPN,
  STORE_EXTERNAL_SUB as X,
  STORE_GATEWAY_REF as GW,
  STORE_ORDER as ORD,
  STORE_PRODUCT as PRD,
  STORE_SUBSCRIPTION as SUB,
} from "./ids-stage4-store";
import { PEOPLE } from "./people";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const ax = T.apex;
const hm = T.harmony;
const at = (s: string) => (s.length === 8 ? `2026-${s}:00:00Z` : `2026-${s}:00Z`);
const meta = {
  [ax]: { institutionId: I.apex, currency: "INR", provider: "demo_pay_in" },
  [hm]: { institutionId: I.harmony, currency: "SGD", provider: "demo_pay_sg" },
} as const;
type StoreTenant = keyof typeof meta;

function pid(tenantId: StoreTenant, personId: string, kind: C.RoleProfileKind): string {
  const row = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === personId && p.kind === kind,
  );
  if (!row) throw new Error(`Missing ${kind} profile for ${personId}`);
  return row.id;
}

function buyerOf(tenantId: StoreTenant, personId: string, kind: C.RoleProfileKind) {
  const person = PEOPLE.find((p) => p.tenantId === tenantId && p.id === personId);
  if (!person?.email) throw new Error(`Missing email for ${personId}`);
  return [pid(tenantId, personId, kind), person.email] as const;
}

const axStaff = pid(ax, P.axKarthik, "staff");
const hmStaff = pid(hm, P.hmWeiLing, "staff");
const vijay = pid(ax, P.axVijay, "learner");
const divya = pid(ax, P.axDivya, "learner");
const arun = pid(ax, P.axArun, "learner");
const nila = pid(ax, P.axNila, "learner");
const chloe = pid(hm, P.hmChloe, "learner");
const rachel = pid(hm, P.hmRachel, "learner");
const marcus = pid(hm, P.hmMarcus, "learner");

interface ProdOpts {
  slug: string;
  title: string;
  copy?: C.StoreProduct["copySource"];
  compare?: number;
  interval?: C.StoreProduct["billingInterval"];
  trial?: number;
  status?: C.StoreProduct["status"];
}

function prod(
  tenantId: StoreTenant,
  id: string,
  kind: C.StoreProductKind,
  refIds: string[],
  price: number,
  o: ProdOpts,
): C.StoreProduct {
  const status = o.status ?? "published";
  const staff = tenantId === ax ? axStaff : hmStaff;
  return {
    id,
    tenantId,
    institutionId: meta[tenantId].institutionId,
    kind,
    refIds,
    slug: o.slug,
    title: o.title,
    description: `Store listing for ${o.title}.`,
    copySource: o.copy ?? "manual",
    price,
    currency: meta[tenantId].currency,
    compareAtPrice: o.compare ?? null,
    billingInterval: o.interval ?? null,
    trialDays: o.trial ?? null,
    status,
    publishedByStaffProfileId: status === "draft" ? null : staff,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

export const STORE_PRODUCTS: readonly C.StoreProduct[] = [
  prod(ax, PRD.axCourse, "course", [CS.axAlgebra], 150_000, {
    slug: "apex-foundation-algebra",
    title: "Foundation Algebra",
    copy: "ai_draft",
    compare: 200_000,
  }),
  prod(ax, PRD.axSubscription, "subscription", [CS.axAlgebra], 50_000, {
    slug: "apex-monthly-pass",
    title: "Apex Monthly Pass",
    interval: "month",
    trial: 7,
  }),
  prod(ax, PRD.axAiDraft, "course", [CS.axAlgebra], 90_000, {
    slug: "apex-algebra-revision-draft",
    title: "Algebra Revision Sprint",
    copy: "ai_draft",
    status: "draft",
  }),
  prod(hm, PRD.hmCourse, "course", [CS.hmSightRead], 6_000, {
    slug: "harmony-sight-reading",
    title: "Sight-Reading Course",
  }),
  prod(hm, PRD.hmPack, "session_pack", [SP.hmStudio], 10_000, {
    slug: "harmony-four-session-pack",
    title: "Four Studio Sessions",
    compare: 12_000,
  }),
  prod(hm, PRD.hmBundle, "bundle", [PRD.hmCourse, PRD.hmPack], 14_000, {
    slug: "harmony-piano-starter-bundle",
    title: "Piano Starter Bundle",
    compare: 16_000,
  }),
  prod(hm, PRD.hmArchived, "subscription", [CS.hmPiano], 48_000, {
    slug: "harmony-annual-archive-pass",
    title: "Legacy Annual Pass",
    interval: "year",
    trial: 14,
    status: "archived",
  }),
];

export const COUPONS: readonly C.Coupon[] = (
  [
    [CPN.axPercent, ax, "APEX10", "percent", 1000, [PRD.axCourse], "09-01T00", 100],
    [CPN.hmAmount, hm, "HARMONY20", "amount", 2_000, [], "01-15T00", 50],
  ] as const
).map(([id, tenantId, code, kind, val, productIds, validFrom, maxRedemptions]) => ({
  id,
  tenantId,
  code,
  kind,
  percentBps: kind === "percent" ? val : null,
  amount: kind === "amount" ? val : null,
  currency: kind === "amount" ? meta[tenantId].currency : null,
  productIds: [...productIds],
  validFrom: at(validFrom),
  validUntil: "2026-12-31T23:59:59Z",
  maxRedemptions,
  redemptions: 1,
  active: true,
}));

const aff = (
  id: string,
  tenantId: StoreTenant,
  name: string,
  code: string,
  commissionBps: number,
  payoutEmail: string,
  status: C.Affiliate["status"],
): C.Affiliate => ({ id, tenantId, name, code, commissionBps, payoutEmail, status });

export const AFFILIATES: readonly C.Affiliate[] = [
  aff(AFF.axPartner, ax, "Chennai STEM Circle", "STEM-REF-01", 1000, "partner@stem.test", "active"),
  aff(AFF.hmPartner, hm, "East Coast Guild", "MUSIC-REF-01", 1500, "guild@music.test", "paused"),
];

interface OrdOpts {
  cpn?: string;
  gw?: string;
  aff?: string;
  paidAt?: string;
}

function ord(
  id: string,
  tenantId: StoreTenant,
  buyer: readonly [string | null, string],
  learnerProfileId: string | null,
  item: readonly [productId: string, price: number, discount: number, tax: number],
  status: C.StoreOrderStatus,
  createdAt: string,
  o: OrdOpts = {},
): C.StoreOrder {
  const [productId, unitPrice, discount, taxTotal] = item;
  return {
    id,
    tenantId,
    buyerProfileId: buyer[0],
    buyerEmail: buyer[1],
    learnerProfileId,
    lines: [{ productId, unitPrice, quantity: 1, discount }],
    couponId: o.cpn ?? null,
    subtotal: unitPrice,
    discountTotal: discount,
    taxTotal,
    total: unitPrice - discount + taxTotal,
    currency: meta[tenantId].currency,
    status,
    provider: meta[tenantId].provider,
    gatewayReference: o.gw ?? null,
    affiliateId: o.aff ?? null,
    paidAt: o.paidAt ? at(o.paidAt) : null,
    createdAt: at(createdAt),
  };
}

const axM = buyerOf(ax, P.axMeena, "guardian");
const axA = buyerOf(ax, P.axArun, "learner");
const axL = buyerOf(ax, P.axLakshmi, "guardian");
const hmM = buyerOf(hm, P.hmMei, "guardian");
const hmR = buyerOf(hm, P.hmRachel, "learner");
const guest = [null, "guest.buyer@family.test"] as const;
const ac = PRD.axCourse;
const ap = PRD.axSubscription;
const hb = PRD.hmBundle;
const hp = PRD.hmArchived;

export const STORE_ORDERS: readonly C.StoreOrder[] = [
  ord(ORD.axFulfilled, ax, axM, vijay, [ac, 150_000, 15_000, 24_300], "fulfilled", "09-10T06", {
    cpn: CPN.axPercent,
    gw: GW.axFulfilled,
    aff: AFF.axPartner,
    paidAt: "09-10T06:05",
  }),
  ord(ORD.axPaid, ax, axA, arun, [ap, 50_000, 0, 9_000], "paid", "09-14T08", {
    gw: GW.axPaid,
    aff: AFF.axPartner,
    paidAt: "09-14T08:10",
  }),
  ord(ORD.axPending, ax, axL, divya, [ac, 150_000, 0, 27_000], "pending", "10-05T09", {
    aff: AFF.axPartner,
  }),
  ord(ORD.hmRefunded, hm, hmM, chloe, [hb, 14_000, 2_000, 1_080], "refunded", "06-12T04", {
    cpn: CPN.hmAmount,
    gw: GW.hmRefunded,
    aff: AFF.hmPartner,
    paidAt: "06-12T04:10",
  }),
  ord(ORD.hmCancelled, hm, hmR, rachel, [PRD.hmCourse, 6_000, 0, 540], "cancelled", "07-03T05"),
  ord(ORD.hmFailed, hm, guest, marcus, [PRD.hmPack, 10_000, 0, 900], "failed", "08-14T07", {
    gw: GW.hmFailed,
  }),
];

export const STORE_SUBSCRIPTIONS: readonly C.StoreSubscription[] = (
  [
    [SUB.axTrialing, ax, ap, nila, "trialing", "10-01T00", "10-08T00", X.axTrialing, false],
    [SUB.axActive, ax, ap, arun, "active", "09-14T08:10", "10-14T08:10", X.axActive, false],
    [SUB.axPastDue, ax, ap, vijay, "past_due", "09-05T00", "10-05T00", X.axPastDue, false],
    [SUB.hmCancelled, hm, hp, rachel, "cancelled", "01-15T00", "07-15T00", X.hmCancelled, true],
    [SUB.hmExpired, hm, hp, marcus, "expired", "01-10T00", "06-10T00", X.hmExpired, false],
  ] as const
).map(([id, tenantId, productId, learnerProfileId, status, start, end, ext, cancel]) => ({
  id,
  tenantId,
  productId,
  learnerProfileId,
  status,
  currentPeriodStart: at(start),
  currentPeriodEnd: at(end),
  cancelAtPeriodEnd: cancel,
  provider: meta[tenantId].provider,
  externalSubscriptionId: ext,
}));

export const AFFILIATE_CONVERSIONS: readonly C.AffiliateConversion[] = (
  [
    [AFC.axPending, ax, AFF.axPartner, ORD.axPending, 15_000, "pending"],
    [AFC.axApproved, ax, AFF.axPartner, ORD.axPaid, 5_000, "approved"],
    [AFC.axPaid, ax, AFF.axPartner, ORD.axFulfilled, 13_500, "paid"],
    [AFC.hmReversed, hm, AFF.hmPartner, ORD.hmRefunded, 1_800, "reversed"],
  ] as const
).map(([id, tenantId, affiliateId, orderId, commission, status]) => ({
  id,
  tenantId,
  affiliateId,
  orderId,
  commission,
  currency: meta[tenantId].currency,
  status,
}));
