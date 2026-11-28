import type { ContentItem } from "@nexus/contracts";
import type { DemoPersona } from "@nexus/mocks";
import { CONTENT_ASSET, CONTENT_ITEM, TENANT, USER, mockDb, roleId } from "@nexus/mocks";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openContent(who: DemoPersona) {
  return renderApp("/teaching/content", { as: who, modules: MODULES });
}

describe("ContentPage (M31)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("blocks publishing a captionless video after check and publishes a clean draft", async () => {
    const teacherRole = mockDb.roles.find((r) => r.id === roleId(TENANT.riverside, "teacher"))!;
    mockDb.roles = mockDb.roles.map((role) =>
      role === teacherRole
        ? { ...role, permissions: [...role.permissions, "m31.content.publish"] }
        : role,
    );

    const baseVideo = mockDb.contentItems.find((row) => row.id === CONTENT_ITEM.rvWaterVideo)!;
    const uncaptionedDraft: ContentItem = {
      ...baseVideo,
      id: "cit-rv-lab-safety-draft",
      title: "Lab Safety Video Draft",
      status: "draft",
      assetId: CONTENT_ASSET.rvWaterVideo,
      textTrackAssetIds: [],
      accessibility: null,
    };
    mockDb.contentItems.push(uncaptionedDraft);

    const amira: DemoPersona = {
      ...persona(TENANT.riverside, "teacher"),
      userId: USER.rvAmira,
    };
    openContent(amira);

    expect(await screen.findByRole("heading", { level: 1, name: "Content" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);

    const list = await screen.findByRole("list", { name: "Content items" });
    expect(within(list).getByText("Lab Safety Video Draft")).toBeInTheDocument();
    expect(within(list).getByText("Analytical Essay Structure (Draft)")).toBeInTheDocument();
    expect(within(list).getByText("AI-assisted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Lab Safety Video Draft" }));
    expect(await screen.findByText("Not checked")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Run accessibility check" }));
    expect(await screen.findByText("Missing video captions")).toBeInTheDocument();
    expect(screen.getByText("Fix the errors to publish")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Back to content" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open Analytical Essay Structure (Draft)" }),
    );
    expect(await screen.findByText("Missing alt text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Run accessibility check" }));
    expect(await screen.findByText("No accessibility issues found")).toBeInTheDocument();

    const publishButton = screen.getByRole("button", { name: "Publish" });
    expect(publishButton).toBeEnabled();
    fireEvent.click(publishButton);
    expect(await screen.findByText("This item is published.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to content" }));
    const updatedList = await screen.findByRole("list", { name: "Content items" });
    const essayCard = within(updatedList)
      .getByText("Analytical Essay Structure (Draft)")
      .closest("li")!;
    expect(within(essayCard).getByText("Published")).toBeInTheDocument();
  });

  it("saves a text and image lesson, then edits it to add a video", async () => {
    openContent({ ...persona(TENANT.riverside, "teacher"), userId: USER.rvAmira });
    fireEvent.click(await screen.findByRole("button", { name: "New lesson" }));
    const change = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const add = (type: string) => {
      change("Block type", type);
      fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    };
    change("Lesson title", "Local habitats");
    change("Lesson text", "Compare the habitats.");
    add("image");
    const image = mockDb.contentAssets.find(
      (a) => a.tenantId === TENANT.riverside && a.kind === "image",
    )!;
    await screen.findByRole("option", { name: image.fileName });
    change("Image", image.id);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    change("Alt text", "A pond and its banks.");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Local habitats" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run accessibility check" }));
    expect(await screen.findByText("No accessibility issues found")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    add("video");
    const video = mockDb.contentAssets.find((a) => a.id === CONTENT_ASSET.rvFractionClip)!;
    await screen.findByRole("option", { name: video.fileName });
    change("Video", video.id);
    expect(
      screen.getByText("You can save this draft. Add captions before publishing."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Not checked")).toBeVisible();
    const lesson = mockDb.contentItems.find((row) => row.title === "Local habitats");
    expect(lesson?.status).toBe("draft");
    expect(lesson?.blocks?.map((b) => b.type)).toEqual(["text", "image", "video"]);
  });

  it("hides authoring controls from a teacher without manage permission", async () => {
    const role = mockDb.roles.find((r) => r.id === roleId(TENANT.riverside, "teacher"))!;
    const previous = role.permissions;
    role.permissions = previous.filter((p) => p !== "m31.content.manage");
    try {
      openContent({ ...persona(TENANT.riverside, "teacher"), userId: USER.rvAmira });
      const open = await screen.findByRole("button", {
        name: "Open Equivalent Fractions Interactive Lesson",
      });
      expect(screen.queryByRole("button", { name: "New lesson" })).toBeNull();
      fireEvent.click(open);
      expect(await screen.findByRole("heading", { name: "Lesson blocks" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    } finally {
      role.permissions = previous;
    }
  });

  it("filters content items by status", async () => {
    const amira: DemoPersona = {
      ...persona(TENANT.riverside, "teacher"),
      userId: USER.rvAmira,
    };
    openContent(amira);

    const list = await screen.findByRole("list", { name: "Content items" });
    expect(within(list).getByText("Equivalent Fractions Interactive Lesson")).toBeInTheDocument();
    expect(within(list).getByText("Analytical Essay Structure (Draft)")).toBeInTheDocument();

    const filter = screen.getByLabelText("Filter by status");
    fireEvent.change(filter, { target: { value: "draft" } });

    const draftList = screen.getByRole("list", { name: "Content items" });
    expect(within(draftList).getByText("Analytical Essay Structure (Draft)")).toBeInTheDocument();
    expect(
      within(draftList).queryByText("Equivalent Fractions Interactive Lesson"),
    ).not.toBeInTheDocument();

    fireEvent.change(filter, { target: { value: "archived" } });
    expect(screen.getByText("No content matches this status")).toBeInTheDocument();
  });

  it("shows a Riverside learner published items only with no check or publish controls", async () => {
    openContent(persona(TENANT.riverside, "learner"));

    const list = await screen.findByRole("list", { name: "Content items" });
    expect(within(list).getByText("Equivalent Fractions Interactive Lesson")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New lesson" })).toBeNull();
    expect(within(list).getByText("The Water Cycle Explained")).toBeInTheDocument();
    expect(within(list).queryByText("Analytical Essay Structure (Draft)")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Open Equivalent Fractions Interactive Lesson" }),
    );
    expect(
      await screen.findByRole("heading", { level: 3, name: "Lesson blocks" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Run accessibility check" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("hides the Content nav entry and blocks access for a Riverside guardian", async () => {
    openContent(persona(TENANT.riverside, "guardian"));

    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Content" })).not.toBeInTheDocument();
  });

  it("renders cleanly in pseudo-locale (en-XA)", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openContent(persona(TENANT.riverside, "learner"));

    expect(await screen.findByRole("heading", { level: 1, name: /^⟦.*⟧$/ })).toBeInTheDocument();
    expect(await screen.findByText("Equivalent Fractions Interactive Lesson")).toBeInTheDocument();
  });
});
