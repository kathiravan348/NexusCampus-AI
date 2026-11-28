import type { ContentAsset, ContentBlock } from "@nexus/contracts";
import { CONTENT_ASSETS, TENANT } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { BlockPreview } from "./BlockPreview";

function renderPreview(
  blocks: readonly ContentBlock[],
  assetById?: ReadonlyMap<string, ContentAsset>,
) {
  signInAs(persona(TENANT.riverside, "teacher"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BlockPreview blocks={blocks} assetById={assetById} />
    </AppProviders>,
  );
}

describe("BlockPreview (M31)", () => {
  it("renders all five block types safely without HTML injection or iframes", async () => {
    const assets = CONTENT_ASSETS.filter((asset) => asset.tenantId === TENANT.riverside);
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const imageAsset = assets.find((asset) => asset.kind === "image")!;
    const videoAsset = assets.find((asset) => asset.kind === "video")!;
    const captionAsset = assets.find((asset) => asset.kind === "captions")!;

    const { container } = renderPreview(
      [
        { type: "text", markdown: "# Heading\n<script>alert('xss')</script> <b>bold</b>" },
        { type: "image", assetId: imageAsset.id, altText: "Fraction bar diagram" },
        { type: "video", assetId: videoAsset.id, captionAssetIds: [captionAsset.id] },
        { type: "question", questionId: "qit-rv-frac-choice" },
        { type: "embed", url: "https://interactive.example.edu/fractions-wall?secret=1" },
      ],
      assetById,
    );

    expect(
      await screen.findByRole("heading", { level: 3, name: "Lesson blocks" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Block 1")).toBeInTheDocument();
    expect(screen.getByText("Block 5")).toBeInTheDocument();

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText(/<script>alert\('xss'\)<\/script>/)).toBeInTheDocument();

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(imageAsset.fileName)).toBeInTheDocument();
    expect(screen.getByText("Alt text: Fraction bar diagram")).toBeInTheDocument();

    expect(screen.getByText(videoAsset.fileName)).toBeInTheDocument();
    expect(screen.getByText("1 caption track")).toBeInTheDocument();

    expect(screen.getByText("Question ID: qit-rv-frac-choice")).toBeInTheDocument();

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Embedded host: interactive.example.edu")).toBeInTheDocument();
    expect(screen.queryByText(/fractions-wall/)).not.toBeInTheDocument();
  });

  it("shows zero and plural caption track counts for video blocks", async () => {
    renderPreview([
      { type: "video", assetId: "cas-missing", captionAssetIds: [] },
      { type: "video", assetId: "cas-missing-2", captionAssetIds: ["cas-cap-1", "cas-cap-2"] },
    ]);

    expect(await screen.findByText("No captions")).toBeInTheDocument();
    expect(screen.getByText("2 caption tracks")).toBeInTheDocument();
  });
});
