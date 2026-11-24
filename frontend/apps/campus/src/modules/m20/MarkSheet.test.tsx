import { RUBRIC, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

function enrolRiversideGroup(classGroupId: string, count: number) {
  const learners = mockDb.learners
    .filter((row) => row.tenantId === TENANT.riverside)
    .slice(0, count);
  const template = mockDb.enrolments.find((row) => row.tenantId === TENANT.riverside)!;
  mockDb.enrolments = mockDb.enrolments.filter(
    (row) => !(row.tenantId === TENANT.riverside && row.classGroupId === classGroupId),
  );
  learners.forEach((learner, index) =>
    mockDb.enrolments.push({
      ...template,
      id: crypto.randomUUID(),
      learnerId: learner.id,
      classGroupId,
      effectiveFrom: "2026-09-01",
      effectiveTo: null,
      rollNumber: String(index + 1),
    }),
  );
  return learners;
}

interface OpenOptions {
  status?: "open" | "marking" | "published";
  rubric?: boolean;
}

function openAssessment(options: OpenOptions = {}) {
  const assessment = mockDb.assessments.find(
    (row) => row.tenantId === TENANT.riverside && row.status === "marking",
  )!;
  assessment.status = options.status ?? "open";
  assessment.rubricId = options.rubric ? RUBRIC.rv : null;
  mockDb.markEntries = mockDb.markEntries.filter((row) => row.assessmentId !== assessment.id);
  const offering = mockDb.subjectOfferings.find((row) => row.id === assessment.subjectOfferingId)!;
  enrolRiversideGroup(offering.classGroupId, 3);
  const group = encodeURIComponent(offering.classGroupId);
  const id = encodeURIComponent(assessment.id);
  renderApp(`/gradebook?group=${group}&assessment=${id}`, {
    as: persona(TENANT.riverside, "teacher"),
    modules: MODULES,
  });
  return assessment;
}

describe("MarkSheet", () => {
  it("saves marks for two learners and marks a third learner absent", async () => {
    const assessment = openAssessment({ status: "open" });
    const forms = await screen.findAllByRole("form");
    expect(forms).toHaveLength(3);

    const firstForm = within(forms[0]!);
    const firstRow = within(forms[0]!.closest("li")!);
    fireEvent.change(firstForm.getByRole("spinbutton", { name: "Marks" }), {
      target: { value: "42.5" },
    });
    fireEvent.click(firstForm.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(firstRow.getByText("42.5 / 50")).toBeVisible());
    expect(firstRow.getAllByText("85%").length).toBeGreaterThan(0);

    const secondForm = within(forms[1]!);
    const secondRow = within(forms[1]!.closest("li")!);
    fireEvent.change(secondForm.getByRole("spinbutton", { name: "Marks" }), {
      target: { value: "35" },
    });
    fireEvent.click(secondForm.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(secondRow.getByText("35 / 50")).toBeVisible());

    const thirdForm = within(forms[2]!);
    const thirdRow = within(forms[2]!.closest("li")!);
    const thirdMarks = thirdForm.getByRole("spinbutton", { name: "Marks" });
    fireEvent.change(thirdMarks, { target: { value: "20" } });
    fireEvent.click(thirdForm.getByRole("checkbox", { name: "Absent" }));
    expect(thirdMarks).toBeDisabled();
    expect(thirdMarks).toHaveValue(null);
    fireEvent.click(thirdForm.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const saved = mockDb.markEntries.filter((row) => row.assessmentId === assessment.id);
      expect(saved.some((row) => row.absent && row.marks === null)).toBe(true);
    });
    expect(thirdRow.getAllByText("Absent").length).toBeGreaterThan(1);
  });

  it("shows a field error for marks above max and for server validation errors", async () => {
    const assessment = openAssessment({ status: "open" });
    const forms = await screen.findAllByRole("form");
    const firstForm = within(forms[0]!);
    const input = firstForm.getByRole("spinbutton", { name: "Marks" });
    fireEvent.change(input, { target: { value: String(assessment.maxMarks + 1) } });
    fireEvent.click(firstForm.getByRole("button", { name: "Save" }));
    expect(await firstForm.findByRole("alert")).toHaveTextContent("Marks cannot be more than 50.");
    expect(input).toHaveAttribute("aria-invalid", "true");

    server.use(
      http.put("*/api/v1/assessments/:id/marks/:learnerId", () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_request",
              message: "The request is not valid.",
              details: [{ path: "marks", message: "Invalid marks" }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.click(firstForm.getByRole("button", { name: "Save" }));
    expect(await firstForm.findByRole("alert")).toHaveTextContent(
      "Enter a mark from 0 to 50 in 0.5 steps.",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("renders rubric selectors when the assessment has a rubric and saves scores", async () => {
    const assessment = openAssessment({ status: "open", rubric: true });
    const forms = await screen.findAllByRole("form");
    const firstForm = within(forms[0]!);
    fireEvent.change(firstForm.getByRole("spinbutton", { name: "Marks" }), {
      target: { value: "45" },
    });
    fireEvent.change(firstForm.getByLabelText("Concept understanding"), { target: { value: "3" } });
    fireEvent.change(firstForm.getByLabelText("Application and clarity"), {
      target: { value: "2" },
    });
    fireEvent.click(firstForm.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const saved = mockDb.markEntries.find(
        (row) => row.assessmentId === assessment.id && row.marks === 45,
      );
      expect(saved?.rubricScores).toEqual({ UNDERSTANDING: 3, EXECUTION: 2 });
    });
  });

  it("uses roll-number fallback when directory names are unavailable", async () => {
    server.use(
      http.get("*/api/v1/people", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
      ),
    );
    openAssessment({ status: "open" });
    expect(await screen.findByRole("form", { name: "Learner 1" })).toBeVisible();
  });

  it("queues an entry offline with a waiting badge and replays once when back online", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      const assessment = openAssessment({ status: "open" });
      const forms = await screen.findAllByRole("form");
      const firstForm = within(forms[0]!);
      const firstRow = within(forms[0]!.closest("li")!);

      online.mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });
      fireEvent.change(firstForm.getByRole("spinbutton", { name: "Marks" }), {
        target: { value: "47.5" },
      });
      fireEvent.click(firstForm.getByRole("button", { name: "Save" }));
      expect(await firstRow.findByText("Waiting to sync")).toBeVisible();
      const entries = mockDb.markEntries.filter((row) => row.assessmentId === assessment.id);
      expect(entries).toHaveLength(0);

      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await waitFor(() =>
        expect(
          mockDb.markEntries.filter(
            (row) => row.assessmentId === assessment.id && row.marks === 47.5,
          ),
        ).toHaveLength(1),
      );
      await waitFor(() => expect(firstRow.queryByText("Waiting to sync")).not.toBeInTheDocument());
    } finally {
      online.mockRestore();
    }
  });

  it.each(["published", "viewer"])(
    "renders read-only without edit controls for a %s mark sheet",
    async (kind) => {
      if (kind === "viewer") {
        for (const role of mockDb.roles) {
          role.permissions = role.permissions.filter((code) => code !== "m20.marks.enter");
        }
      }
      openAssessment({ status: kind === "published" ? "published" : "open" });
      expect(await screen.findByRole("heading", { name: "Mark sheet" })).toBeVisible();
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    },
  );
});
