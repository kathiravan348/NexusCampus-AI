import type { ContentBlock } from "@nexus/contracts";
import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createNexusQueryClient } from "@nexus/services";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { BlockEditor } from "./BlockEditor";

function renderBlock(block: ContentBlock) {
  signInAs(persona(TENANT.riverside, "teacher"));
  const assets = mockDb.contentAssets.filter((asset) => asset.tenantId === TENANT.riverside);
  const onChange = vi.fn();
  const view = render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BlockEditor block={block} assets={assets} onChange={onChange} />
    </AppProviders>,
  );
  return { ...view, assets, onChange };
}

describe("BlockEditor", () => {
  it("offers image assets and links alt text to its error and character count", async () => {
    const { assets } = renderBlock({ type: "image", assetId: "", altText: "" });
    const input = await screen.findByRole("textbox", { name: "Alt text" });
    expect(input).toHaveAccessibleDescription(/Describe the image.*0 of 500 characters/);
    expect(input).toHaveAttribute("maxlength", "500");
    expect(screen.getAllByRole("option")).toHaveLength(
      1 + assets.filter((asset) => asset.kind === "image").length,
    );
  });

  it("offers caption tracks and warns about publishing a captionless video", async () => {
    const block = { type: "video" as const, assetId: "", captionAssetIds: [] };
    const { assets, onChange } = renderBlock(block);
    expect(
      await screen.findByText("You can save this draft. Add captions before publishing."),
    ).toBeVisible();
    const caption = assets.find((asset) => asset.kind === "captions")!;
    fireEvent.click(screen.getByRole("checkbox", { name: caption.fileName }));
    expect(onChange).toHaveBeenCalledWith({ ...block, captionAssetIds: [caption.id] });
  });

  it("shows only the hostname in the embed preview", async () => {
    const { container } = renderBlock({ type: "embed", url: "https://example.org/private/path" });
    expect(await screen.findByText("Embedded host: example.org")).toBeVisible();
    expect(screen.queryByText(/private\/path/)).toBeNull();
    expect(container.querySelector("iframe, a")).toBeNull();
  });
});
