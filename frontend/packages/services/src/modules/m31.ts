import {
  ContentAssetSchema,
  ContentAttemptSchema,
  ContentItemSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type ContentItem,
} from "@nexus/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "../client";
import { queryKeys } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery } from "../query";
import { useSession } from "../session";

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

function useContentAction(action: "accessibility-check" | "publish") {
  const { session } = useSession();
  const qc = useQueryClient();

  const invalidate = async (contentItemId: string) => {
    if (!session) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.m31.contentItems(session) }),
      qc.invalidateQueries({ queryKey: queryKeys.m31.contentItem(session, contentItemId) }),
    ]);
  };

  return useOutboxMutation<string, ContentItem>({
    moduleId: "M31",
    operation: `content.${action}`,
    mergeRule: "lww-audited",
    send: async (client, contentItemId, key) => {
      try {
        const item = await client.send(
          "POST",
          `/content-items/${encodeURIComponent(contentItemId)}/${action}`,
          undefined,
          ContentItemSchema,
          { headers: idempotencyHeaders(key) },
        );
        await invalidate(contentItemId);
        return item;
      } catch (error) {
        if (action === "publish" && error instanceof ApiRequestError && error.status === 409) {
          await invalidate(contentItemId);
        }
        throw error;
      }
    },
  });
}

/** Runs `POST /content-items/:id/accessibility-check` (M31, L2 outbox write). */
export function useCheckContentAccessibility() {
  return useContentAction("accessibility-check");
}

/** Publishes a clean draft or in-review item via `POST /content-items/:id/publish` (M31, L2). */
export function usePublishContentItem() {
  return useContentAction("publish");
}
