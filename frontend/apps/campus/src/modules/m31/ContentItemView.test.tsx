import { CONTENT_ITEM, TENANT, USER, mockDb, type DemoPersona } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { ContentItemView } from "./ContentItemView";

function renderView(itemId: string, who: DemoPersona) {
  signInAs(who);
  const item = mockDb.contentItems.find((row) => row.id === itemId)!;
  const onBack = vi.fn();
  const view = render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContentItemView item={item} onBack={onBack} />
    </AppProviders>,
  );
  return { ...view, onBack };
}

describe("ContentItemView (M31)", () => {
  it("renders metadata, referenced assets without URLs, blocks, report and publish bar", async () => {
    const teacher: DemoPersona = {
      ...persona(TENANT.riverside, "teacher"),
      userId: USER.rvAmira,
    };
    const { container, onBack } = renderView(CONTENT_ITEM.rvFractionsLesson, teacher);

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Equivalent Fractions Interactive Lesson",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(screen.getByText("en-GB")).toBeInTheDocument();
    expect(screen.getByText("1 outcome")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();

    expect(await screen.findByText("fraction-en.vtt")).toBeInTheDocument();
    expect(screen.getByText("90.2 KB")).toBeInTheDocument();
    expect(screen.getByText("13.5 MB")).toBeInTheDocument();
    expect(screen.getByText("4.7 KB")).toBeInTheDocument();
    expect(screen.queryByText("water-cycle.mp4")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("a")).toBeNull();

    expect(screen.getByRole("heading", { level: 3, name: "Lesson blocks" })).toBeInTheDocument();
    expect(screen.getByText("No accessibility issues found")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Run accessibility check" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to content" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows learning package metadata for a SCORM item", async () => {
    renderView(CONTENT_ITEM.nbScormLab, persona(TENANT.northbridge, "admin"));

    expect(
      await screen.findByRole("heading", { level: 3, name: "Learning package" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Manifest ID: nb-cs101-loops-scorm2004")).toBeInTheDocument();
    expect(screen.getByText("Launch path: content/index.html")).toBeInTheDocument();
    expect(await screen.findByText("cs101-scorm2004.zip")).toBeInTheDocument();
  });

  it("hides check and publish controls for a learner", async () => {
    renderView(CONTENT_ITEM.rvFractionsLesson, persona(TENANT.riverside, "learner"));

    expect(await screen.findByText("fraction-en.vtt")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Review & publish" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Run accessibility check" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("renders cleanly in RTL (ar) direction", async () => {
    const institution = mockDb.institutions.find((row) => row.tenantId === TENANT.riverside)!;
    institution.locale.supportedLocales.push("ar");
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "ar" }));
    renderView(CONTENT_ITEM.rvWaterVideo, persona(TENANT.riverside, "learner"));

    expect(
      await screen.findByRole("heading", { level: 2, name: "The Water Cycle Explained" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(document.documentElement.dir).toBe("rtl");
    });
  });
});
