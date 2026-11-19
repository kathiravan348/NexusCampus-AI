import { z } from "zod";

export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 200;

const PageNumberSchema = z.int().min(1);
const PageSizeSchema = z.int().min(1).max(PAGE_SIZE_MAX);

/** One page of a list (D15): `page` starts at 1. */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z
    .strictObject({
      items: z.array(item),
      total: z.int().min(0),
      page: PageNumberSchema,
      pageSize: PageSizeSchema,
    })
    .refine((p) => p.items.length <= p.pageSize, {
      message: "A page cannot hold more items than pageSize",
      path: ["items"],
    });
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** List query: `?page=2&pageSize=50`. Missing values take the defaults. */
export const PageQuerySchema = z.strictObject({
  page: PageNumberSchema.default(1),
  pageSize: PageSizeSchema.default(PAGE_SIZE_DEFAULT),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;
