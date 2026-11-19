import { z } from "zod";
import { describe, expect, it } from "vitest";
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, PageQuerySchema, pageSchema } from "./page";

const NamePage = pageSchema(z.strictObject({ name: z.string() }));

describe("pageSchema", () => {
  it("accepts a valid page, including an empty last page", () => {
    expect(
      NamePage.safeParse({ items: [{ name: "A" }], total: 1, page: 1, pageSize: 50 }).success,
    ).toBe(true);
    expect(NamePage.safeParse({ items: [], total: 0, page: 1, pageSize: 50 }).success).toBe(true);
  });

  it("validates each item with the item schema", () => {
    expect(
      NamePage.safeParse({ items: [{ name: 1 }], total: 1, page: 1, pageSize: 50 }).success,
    ).toBe(false);
  });

  it("rejects page 0, page sizes out of range, and more items than pageSize", () => {
    expect(NamePage.safeParse({ items: [], total: 0, page: 0, pageSize: 50 }).success).toBe(false);
    expect(NamePage.safeParse({ items: [], total: 0, page: 1, pageSize: 0 }).success).toBe(false);
    expect(
      NamePage.safeParse({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE_MAX + 1 }).success,
    ).toBe(false);
    const three = [{ name: "a" }, { name: "b" }, { name: "c" }];
    expect(NamePage.safeParse({ items: three, total: 3, page: 1, pageSize: 2 }).success).toBe(
      false,
    );
  });

  it("rejects extra keys such as a cursor", () => {
    expect(
      NamePage.safeParse({ items: [], total: 0, page: 1, pageSize: 50, nextCursor: null }).success,
    ).toBe(false);
  });
});

describe("PageQuery", () => {
  it("defaults to page 1 and the default size", () => {
    expect(PageQuerySchema.parse({})).toEqual({ page: 1, pageSize: PAGE_SIZE_DEFAULT });
    expect(PageQuerySchema.parse({ page: 3, pageSize: 20 })).toEqual({ page: 3, pageSize: 20 });
  });

  it("rejects out-of-range values", () => {
    expect(PageQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(PageQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });
});
