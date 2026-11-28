import { CONTENT_ITEM, TENANT, USER, mockDb } from "@nexus/mocks";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createNexusQueryClient } from "@nexus/services";
import { AppProviders } from "../../App";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { LessonEditor } from "./LessonEditor";

describe("LessonEditor", () => {
  it("keeps block identity through keyboard-accessible moves and confirms removal", async () => {
    signInAs({ ...persona(TENANT.riverside, "teacher"), userId: USER.rvAmira });
    const base = mockDb.contentItems.find((item) => item.id === CONTENT_ITEM.rvDraftLesson)!;
    const onSave = vi.fn().mockResolvedValue(undefined);
    const item = {
      ...base,
      aiAssisted: true,
      blocks: [{ type: "text" as const, markdown: "First" }],
    };
    render(
      <AppProviders
        db={freshDb()}
        createClient={() =>
          createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <LessonEditor item={item} onSave={onSave} onCancel={vi.fn()} />
      </AppProviders>,
    );
    expect(await screen.findByText("AI-assisted")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Block type"), { target: { value: "question" } });
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Question ID"), { target: { value: "question-1" } });
    const list = screen.getByRole("list", { name: "Lesson blocks" });
    const blocks = () => within(list).getAllByRole("listitem");
    fireEvent.click(within(blocks()[1]!).getByRole("button", { name: "Move up" }));
    expect(within(blocks()[0]!).getByLabelText("Question ID")).toHaveValue("question-1");
    fireEvent.click(within(blocks()[1]!).getByRole("button", { name: "Remove block" }));
    fireEvent.click(within(blocks()[1]!).getByRole("button", { name: "Cancel" }));
    expect(blocks()).toHaveLength(2);
    fireEvent.click(within(blocks()[1]!).getByRole("button", { name: "Remove block" }));
    expect(within(blocks()[1]!).getByText("Remove this block from the lesson?")).toBeVisible();
    fireEvent.click(within(blocks()[1]!).getByRole("button", { name: "Remove block" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        title: item.title,
        outcomeIds: item.outcomeIds,
        language: item.language,
        blocks: [{ type: "question", questionId: "question-1" }],
      }),
    );
  });
});

it.each(["ar", "en-XA"])("opens the draft form in %s with labelled fields", async (locale) => {
  const institution = mockDb.institutions.find((row) => row.tenantId === TENANT.riverside)!;
  if (locale === "ar") institution.locale.supportedLocales.push("ar");
  localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: locale }));
  signInAs({ ...persona(TENANT.riverside, "teacher"), userId: USER.rvAmira });
  render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LessonEditor item={null} onSave={vi.fn()} onCancel={vi.fn()} />
    </AppProviders>,
  );
  const heading = await screen.findByRole("heading", { level: 2 });
  if (locale === "ar") await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
  else expect(heading).toHaveTextContent(/^⟦.*⟧$/);
  for (const field of screen.getAllByRole("textbox")) expect(field).toHaveAccessibleName();
});
