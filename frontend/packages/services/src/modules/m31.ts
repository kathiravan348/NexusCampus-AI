import {
  ContentAssetSchema,
  ContentAttemptSchema,
  ContentItemSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const ContentItemPage = pageSchema(ContentItemSchema);
const ContentAssetPage = pageSchema(ContentAssetSchema);
const ContentAttemptPage = pageSchema(ContentAttemptSchema);

export function useContentItems() {
  return useScopedQuery(queryKeys.m31.contentItems, (c, signal) =>
    c.get("/content-items", ContentItemPage, all, { signal }),
  );
}

export function useContentItem(contentItemId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m31.contentItem(s, contentItemId),
    (c, signal) =>
      c.get(
        `/content-items/${encodeURIComponent(contentItemId ?? "")}`,
        ContentItemSchema,
        undefined,
        { signal },
      ),
    contentItemId !== null,
  );
}

export function useContentAssets() {
  return useScopedQuery(queryKeys.m31.contentAssets, (c, signal) =>
    c.get("/content-assets", ContentAssetPage, all, { signal }),
  );
}

export function useContentAttempts(contentItemId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m31.contentAttempts(s, contentItemId),
    (c, signal) =>
      c.get("/content-attempts", ContentAttemptPage, { ...all, contentItemId }, { signal }),
  );
}
