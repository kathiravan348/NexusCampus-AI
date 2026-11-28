import type { ContentItem } from "@nexus/contracts";
import { CONTENT_ITEM, TENANT, USER, mockDb, roleId, type DemoPersona } from "@nexus/mocks";
import { listOutbox } from "@nexus/offline";
import { createNexusQueryClient } from "@nexus/services";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { PublishBar } from "./PublishBar";

function renderBar(
  item: ContentItem,
  options?: { readonly canManage?: boolean; readonly canPublish?: boolean },
) {
  const who: DemoPersona = {
    ...persona(TENANT.riverside, "teacher"),
    userId: USER.rvAmira,
  };
  const teacherRole = mockDb.roles.find((role) => role.id === roleId(TENANT.riverside, "teacher"))!;
  if (!teacherRole.permissions.includes("m31.content.publish")) {
    teacherRole.permissions = [...teacherRole.permissions, "m31.content.publish"];
  }
  signInAs(who);
  const db = freshDb();

  const view = render(
    <AppProviders
      db={db}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PublishBar
        item={item}
        canManage={options?.canManage ?? true}
        canPublish={options?.canPublish ?? true}
      />
    </AppProviders>,
  );

  return { ...view, db, who };
}

describe("PublishBar (M31)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("renders nothing when the viewer cannot manage or publish", () => {
    const item = mockDb.contentItems.find((row) => row.id === CONTENT_ITEM.rvDraftLesson)!;
    const { container } = renderBar(item, { canManage: false, canPublish: false });

    expect(container.firstChild).toBeNull();
  });

  it("disables publish and shows Fix the errors to publish while errors exist", () => {
    const item = mockDb.contentItems.find((row) => row.id === CONTENT_ITEM.rvDraftLesson)!;
    renderBar(item);

    expect(screen.getByText("Fix the errors to publish")).toBeInTheDocument();
    expect(
      screen.getByText("Drafted with AI. A person must review and publish it."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run accessibility check" })).toBeEnabled();
  });

  it("runs accessibility check and publishes a clean draft online", async () => {
    const draft = mockDb.contentItems.find((row) => row.id === CONTENT_ITEM.rvDraftLesson)!;
    const first = renderBar(draft);

    fireEvent.click(screen.getByRole("button", { name: "Run accessibility check" }));

    await waitFor(() => {
      const updated = mockDb.contentItems.find((row) => row.id === CONTENT_ITEM.rvDraftLesson)!;
      expect(updated.accessibility?.issues).toEqual([]);
    });

    first.unmount();
    const cleaned = mockDb.contentItems.find((row) => row.id === CONTENT_ITEM.rvDraftLesson)!;
    renderBar(cleaned);

    const publishButton = screen.getByRole("button", { name: "Publish" });
    expect(publishButton).toBeEnabled();
    fireEvent.click(publishButton);

    await waitFor(() => {
      const published = mockDb.contentItems.find((row) => row.id === CONTENT_ITEM.rvDraftLesson)!;
      expect(published.status).toBe("published");
    });
  });

  it("queues actions in the offline outbox and shows an inline queued notice", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const draft = mockDb.contentItems.find((row) => row.id === CONTENT_ITEM.rvDraftLesson)!;
    draft.accessibility = { checkedAt: "2026-08-20T10:30:00Z", issues: [] };
    const { db, who } = renderBar(draft);

    onlineSpy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(
      await screen.findByText(
        "You are offline. Actions will queue on this device and sync when you reconnect.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    const notices = await screen.findAllByText(
      "Publish queued offline. It will sync when you reconnect.",
    );
    expect(notices.length).toBeGreaterThanOrEqual(1);

    const queued = await listOutbox(db, { tenantId: who.tenantId, userId: who.userId });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      moduleId: "M31",
      operation: "content.publish",
      mergeRule: "lww-audited",
    });
  });

  it("maps publish accessibility conflict errors safely without leaking item text", async () => {
    const base = mockDb.contentItems.find((row) => row.id === CONTENT_ITEM.rvWaterVideo)!;
    const secretTitle = "PRIVATE-LESSON-SECRET-409";
    const blockedItem: ContentItem = {
      ...base,
      id: "cit-rv-video-no-captions",
      title: secretTitle,
      status: "draft",
      textTrackAssetIds: [],
      accessibility: null,
    };
    mockDb.contentItems.push(blockedItem);

    renderBar(blockedItem);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Fix the errors to publish");
    expect(alert.textContent).not.toContain(secretTitle);
  });
});
