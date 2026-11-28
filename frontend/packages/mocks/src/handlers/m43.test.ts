import {
  AffiliateConversionSchema,
  AffiliateSchema,
  CouponSchema,
  StoreOrderSchema,
  StoreProductSchema,
  StoreSubscriptionSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { ROLE_ASSIGNMENTS, STORE_ORDER, STORE_PRODUCT, TENANT, USER, roleId } from "../fixtures";
import { server } from "../node";
import type { Parser } from "./route";

const hm = TENANT.harmony;
const productPath = `/store-products/${STORE_PRODUCT.hmCourse}`;
const orderPath = `/store-orders/${STORE_ORDER.hmRefunded}`;
const routes = [
  "/store-products",
  productPath,
  "/coupons",
  "/store-orders",
  orderPath,
  "/store-subscriptions",
  "/affiliates",
  "/affiliate-conversions",
];

function adminOf(tenantId: string): string {
  return ROLE_ASSIGNMENTS.find(
    (row) => row.roleId === roleId(tenantId, "admin") || row.roleId === roleId(tenantId, "owner"),
  )!.userId;
}

function get(path: string, userId: string = USER.hmWeiLing, tenantId: string = hm) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

async function readBody(response: Response): Promise<unknown> {
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).not.toMatch(/\b(?:\d[ -]?){12,18}\d\b/);
  return JSON.parse(body);
}

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  return schema.parse(await readBody(response));
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M43 read handlers", () => {
  it("serves all six tenant-scoped lists to an admin without card values", async () => {
    const cases = [
      ["/store-products", pageSchema(StoreProductSchema), mockDb.storeProducts],
      ["/coupons", pageSchema(CouponSchema), mockDb.coupons],
      ["/store-orders", pageSchema(StoreOrderSchema), mockDb.storeOrders],
      ["/store-subscriptions", pageSchema(StoreSubscriptionSchema), mockDb.storeSubscriptions],
      ["/affiliates", pageSchema(AffiliateSchema), mockDb.affiliates],
      [
        "/affiliate-conversions",
        pageSchema(AffiliateConversionSchema),
        mockDb.affiliateConversions,
      ],
    ] as const;
    for (const [route, schema, rows] of cases) {
      const items = rows.filter((row) => row.tenantId === hm);
      expect(items.length).toBeGreaterThan(0);
      expect(schema.parse(await readBody(await get(route)))).toEqual({
        items,
        total: items.length,
        page: 1,
        pageSize: expect.any(Number),
      });
    }
  });

  it("serves store products to an entitled test-prep tenant", async () => {
    const tenantId = TENANT.apex;
    const products = await parse(
      await get("/store-products", adminOf(tenantId), tenantId),
      pageSchema(StoreProductSchema),
    );
    expect(products.items.map((row) => row.id)).toEqual([
      STORE_PRODUCT.axCourse,
      STORE_PRODUCT.axSubscription,
      STORE_PRODUCT.axAiDraft,
    ]);
  });

  it("serves local product and order details, and hides foreign records", async () => {
    const product = await parse(await get(productPath), StoreProductSchema);
    expect(product).toMatchObject({ id: STORE_PRODUCT.hmCourse, tenantId: hm });
    const order = await parse(await get(orderPath), StoreOrderSchema);
    expect(order).toMatchObject({ id: STORE_ORDER.hmRefunded, tenantId: hm });
    expect(order.buyerEmail).toBe(
      mockDb.storeOrders.find((row) => row.id === STORE_ORDER.hmRefunded)?.buyerEmail,
    );

    for (const path of [
      `/store-products/${STORE_PRODUCT.axCourse}`,
      `/store-orders/${STORE_ORDER.axFulfilled}`,
    ]) {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: "Not found." },
      });
    }
  });

  it("allows teachers to read orders and reserves affiliate data for managers", async () => {
    const order = await parse(await get(orderPath, USER.hmPriya), StoreOrderSchema);
    expect(order.id).toBe(STORE_ORDER.hmRefunded);
    for (const route of ["/affiliates", "/affiliate-conversions"]) {
      const response = await get(route, USER.hmPriya);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("keeps buyer data outside the catalogue grant", async () => {
    mockDb.roles = mockDb.roles.map((role) => ({
      ...role,
      permissions: role.permissions.filter((permission) => permission !== "m43.order.read"),
    }));
    expect((await get(productPath)).status).toBe(200);
    for (const route of ["/store-orders", orderPath, "/store-subscriptions"]) {
      const response = await get(route);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("denies learners, guardians and users without grants on every endpoint", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.hmWeiLing);
    for (const userId of [USER.hmRachel, USER.hmMei, USER.hmWeiLing]) {
      for (const route of routes) {
        const response = await get(route, userId);
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
      }
    }
  });

  it("requires M43 entitlement", async () => {
    const tenantId = TENANT.northbridge;
    const response = await get("/store-products", adminOf(tenantId), tenantId);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
