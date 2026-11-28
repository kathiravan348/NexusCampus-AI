import { CONTENT_ITEM, TENANT, USER, mockDb, resetMockDb } from "@nexus/mocks";
import { listOutbox } from "@nexus/offline";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useCheckContentAccessibility,
  useContentAssets,
  useContentAttempts,
  useContentItem,
  useContentItems,
  useCreateContentLesson,
  useUpdateContentLesson,
  usePublishContentItem,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => {
  vi.restoreAllMocks();
  resetMockDb();
});

describe("M31 hooks", () => {
  it("loads content, asset metadata and attempts for a selected item", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const items = useContentItems();
        const itemId =
          items.data?.items.find((row) => row.kind === "lesson" && row.status === "published")
            ?.id ?? null;
        return {
          items,
          item: useContentItem(itemId),
          assets: useContentAssets(),
          attempts: useContentAttempts(itemId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { items, item, assets, attempts } = result.current;
      expect(items.data?.total).toBe(3);
      expect(item.data).toMatchObject({ kind: "lesson", status: "published" });
      expect(assets.data?.total).toBe(6);
      expect(attempts.data?.total).toBe(1);
      expect(attempts.data?.items[0]?.contentItemId).toBe(item.data?.id);
    });
  });

  it("checks accessibility and publishes online, invalidating item and list queries", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const id = CONTENT_ITEM.rvDraftLesson;
    const { result } = renderHook(
      () => ({
        items: useContentItems(),
        item: useContentItem(id),
        check: useCheckContentAccessibility(),
        publish: usePublishContentItem(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => expect(result.current.item.data?.status).toBe("draft"));

    await act(async () => {
      const checked = await result.current.check.mutateAsync(id);
      expect(checked.queued).toBe(false);
      if (!checked.queued) expect(checked.data.accessibility?.issues).toEqual([]);
    });

    await waitFor(() => expect(result.current.item.data?.accessibility?.issues).toEqual([]));

    await act(async () => {
      const published = await result.current.publish.mutateAsync(id);
      expect(published.queued).toBe(false);
      if (!published.queued) expect(published.data.status).toBe("published");
    });

    await waitFor(() => {
      expect(result.current.item.data?.status).toBe("published");
      const listed = result.current.items.data?.items.find((row) => row.id === id);
      expect(listed?.status).toBe("published");
    });
  });

  it("queues a lesson offline, syncs one draft, and refreshes its list and detail after editing", async () => {
    const scope = { tenantId: TENANT.riverside, userId: USER.rvAmira };
    signInAs({ ...ADMIN, ...scope });
    const db = freshDb();
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const title = "Paper folding";
    const input = {
      title,
      language: "en",
      outcomeIds: [],
      blocks: [{ type: "text" as const, markdown: "Fold once." }],
    };
    const { result } = renderHook(
      () => {
        const list = useContentItems();
        const id = list.data?.items.find((i) => i.title === title)?.id ?? null;
        return {
          list,
          detail: useContentItem(id),
          create: useCreateContentLesson(),
          update: useUpdateContentLesson(),
        };
      },
      { wrapper: wrapper({ db }) },
    );
    await act(async () =>
      expect((await result.current.create.mutateAsync(input)).queued).toBe(true),
    );
    expect(await listOutbox(db, scope)).toMatchObject([
      { operation: "content.create", payload: input },
    ]);
    expect(mockDb.contentItems.some((item) => item.title === title)).toBe(false);
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.detail.data?.status).toBe("draft"));
    await waitFor(async () => expect(await listOutbox(db, scope)).toHaveLength(0));
    const id = result.current.detail.data!.id;
    await act(async () => {
      await result.current.update.mutateAsync({ id, input: { ...input, language: "hi" } });
    });
    await waitFor(() => {
      expect(result.current.detail.data?.language).toBe("hi");
      expect(result.current.list.data?.items.filter((item) => item.id === id)).toMatchObject([
        { language: "hi" },
      ]);
    });
  });

  it("queues a publish offline and syncs it when back online", async () => {
    const scope = { tenantId: TENANT.riverside, userId: USER.rvHelen };
    const id = CONTENT_ITEM.rvDraftLesson;
    signInAs({ ...ADMIN, ...scope });
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const db = freshDb();

    const { result } = renderHook(
      () => ({
        items: useContentItems(),
        item: useContentItem(id),
        publish: usePublishContentItem(),
      }),
      { wrapper: wrapper({ db }) },
    );

    await act(async () => {
      const outcome = await result.current.publish.mutateAsync(id);
      expect(outcome.queued).toBe(true);
    });

    expect(mockDb.contentItems.find((row) => row.id === id)?.status).toBe("draft");
    expect(await listOutbox(db, scope)).toMatchObject([
      {
        moduleId: "M31",
        operation: "content.publish",
        mergeRule: "lww-audited",
        idempotencyKey: expect.any(String),
        payload: id,
      },
    ]);

    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(async () => expect(await listOutbox(db, scope)).toHaveLength(0));
    await waitFor(() => {
      expect(result.current.item.data?.status).toBe("published");
      const listed = result.current.items.data?.items.find((row) => row.id === id);
      expect(listed?.status).toBe("published");
    });
  });

  it("queues an accessibility check offline and syncs it when back online", async () => {
    const scope = { tenantId: TENANT.riverside, userId: USER.rvHelen };
    const id = CONTENT_ITEM.rvDraftLesson;
    signInAs({ ...ADMIN, ...scope });
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const db = freshDb();

    const { result } = renderHook(
      () => ({
        item: useContentItem(id),
        check: useCheckContentAccessibility(),
      }),
      { wrapper: wrapper({ db }) },
    );

    await act(async () => {
      const outcome = await result.current.check.mutateAsync(id);
      expect(outcome.queued).toBe(true);
    });

    expect(await listOutbox(db, scope)).toMatchObject([
      {
        moduleId: "M31",
        operation: "content.accessibility-check",
        mergeRule: "lww-audited",
        idempotencyKey: expect.any(String),
        payload: id,
      },
    ]);

    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(async () => expect(await listOutbox(db, scope)).toHaveLength(0));
    await waitFor(() => expect(result.current.item.data?.accessibility?.issues).toEqual([]));
  });
});
