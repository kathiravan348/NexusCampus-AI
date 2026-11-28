import type { LessonPlan } from "@nexus/contracts";
import { LESSON_PLAN, OFFERING, PERSON, TENANT, USER, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { listOutbox } from "@nexus/offline";
import { createNexusQueryClient } from "@nexus/services";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { LessonPlanDialog } from "./LessonPlanDialog";

function renderDialog(options?: {
  readonly plan?: LessonPlan | null;
  readonly defaultOfferingId?: string;
  readonly userRole?: "teacher" | "admin";
}) {
  const onOpenChange = vi.fn();
  const who = persona(TENANT.riverside, options?.userRole ?? "teacher");
  signInAs(who);
  const offerings = mockDb.subjectOfferings.filter((r) => r.tenantId === TENANT.riverside);
  const subjects = new Map(mockDb.subjects.map((r) => [r.id, r]));
  const classGroups = mockDb.classGroups.filter((r) => r.tenantId === TENANT.riverside);
  const groupById = new Map(classGroups.map((r) => [r.id, r]));
  const labels = new Map(
    offerings.map((o) => {
      const subject = subjects.get(o.subjectId)?.name ?? o.subjectId;
      const group = groupById.get(o.classGroupId)?.name ?? o.classGroupId;
      return [o.id, `${subject} — ${group}`];
    }),
  );
  const personId = who.userId === USER.rvHelen ? PERSON.rvHelen : PERSON.rvTom;
  const staffId = mockDb.roleProfiles.find(
    (r) => r.personId === personId && r.kind === "staff",
  )!.id;
  const db = freshDb();

  const view = render(
    <AppProviders
      db={db}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LessonPlanDialog
        open
        onOpenChange={onOpenChange}
        plan={options?.plan ?? null}
        defaultOfferingId={options?.defaultOfferingId ?? OFFERING.rvNorthYearNine[0]}
        ownStaffProfileId={staffId}
        offerings={offerings}
        offeringLabels={labels}
        classGroups={classGroups}
      />
    </AppProviders>,
  );

  return { ...view, onOpenChange, db, who };
}

describe("LessonPlanDialog (M29)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("validates required title and topics before saving", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "New lesson plan" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
    expect(await within(dialog).findByText("This field is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Select at least one syllabus topic.")).toBeInTheDocument();
  });

  it("creates a manual draft with topics, outcomes and reordered activities", async () => {
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "New lesson plan" });

    fireEvent.change(within(dialog).getByLabelText(/^Title/), {
      target: { value: "Argument Structure" },
    });
    fireEvent.change(within(dialog).getByLabelText("Lesson date"), {
      target: { value: "2026-10-12" },
    });
    const topic = await within(dialog).findByRole("checkbox", {
      name: /Drafting a focused thesis statement/,
    });
    fireEvent.click(topic);
    const outcome = await within(dialog).findByRole("checkbox", { name: /RV\.ENG\.9\.1/ });
    fireEvent.click(outcome);

    fireEvent.click(within(dialog).getByRole("button", { name: "Add activity" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add activity" }));
    const titleInputs = within(dialog).getAllByLabelText(/Activity title/);
    fireEvent.change(titleInputs[0]!, { target: { value: "Hook" } });
    fireEvent.change(titleInputs[1]!, { target: { value: "Writing" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move activity 2 up" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const saved = mockDb.lessonPlans.find((row) => row.title === "Argument Structure");
    expect(saved).toMatchObject({
      status: "draft",
      source: "manual",
      date: "2026-10-12",
    });
    expect(saved?.activities.map((a) => [a.order, a.title])).toEqual([
      [1, "Writing"],
      [2, "Hook"],
    ]);
  });

  it("queues a lesson plan in the outbox while offline and shows the queued toast", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { onOpenChange, db, who } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "New lesson plan" });
    const topic = await within(dialog).findByRole("checkbox", {
      name: /Drafting a focused thesis statement/,
    });

    onlineSpy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(
      await within(dialog).findByText(
        "You are offline. Saving will queue this lesson plan to sync later.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save draft" })).toBeEnabled();

    fireEvent.change(within(dialog).getByLabelText(/^Title/), {
      target: { value: "Offline Plan Draft" },
    });
    fireEvent.click(topic);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const queued = await listOutbox(db, { tenantId: who.tenantId, userId: who.userId });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ moduleId: "M29", operation: "lessonplan.create" });
  });

  it("shows server forbidden and conflict errors cleanly", async () => {
    const otherPlan = mockDb.lessonPlans.find((r) => r.id === LESSON_PLAN.rvSubmitted)!;
    const { onOpenChange } = renderDialog({ plan: otherPlan });
    const dialog = await screen.findByRole("dialog", { name: "Edit lesson plan" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(
      await within(dialog).findByText("You can only edit your own lesson plans."),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    server.use(
      http.put("*/api/v1/lesson-plans/:id", () =>
        HttpResponse.json(
          { error: { code: "conflict", message: "The record changed in the meantime." } },
          { status: 409 },
        ),
      ),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(
      await within(dialog).findByText("Only draft or returned lesson plans can be edited."),
    ).toBeInTheDocument();
  });
});
