import { TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { HttpResponse, http } from "msw";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

function openRollCall(locked = false) {
  const session = mockDb.attendanceSessions.find(
    (row) => row.tenantId === TENANT.riverside && row.status === "open" && row.classGroupId,
  )!;
  if (locked) {
    session.status = "locked";
    session.submittedAt = session.createdAt;
  }
  renderApp(`/attendance?session=${encodeURIComponent(session.id)}`, {
    as: persona(TENANT.riverside, "teacher"),
    modules: MODULES,
  });
  return session;
}

describe("RollCall", () => {
  it("records three individual marks, including ten minutes late, and marks the class present", async () => {
    // Place three demo learners in the chosen class for this session date.
    const session = mockDb.attendanceSessions.find(
      (row) => row.tenantId === TENANT.riverside && row.status === "open" && row.classGroupId,
    )!;
    const learners = mockDb.learners.filter((row) => row.tenantId === TENANT.riverside).slice(0, 3);
    const template = mockDb.enrolments.find((row) => row.tenantId === TENANT.riverside)!;
    learners.forEach((learner, index) =>
      mockDb.enrolments.push({
        ...template,
        id: crypto.randomUUID(),
        learnerId: learner.id,
        classGroupId: session.classGroupId!,
        effectiveFrom: session.date,
        effectiveTo: null,
        rollNumber: String(index + 1),
      }),
    );
    openRollCall();
    const forms = await screen.findAllByRole("form");
    const count = mockDb.attendanceMarks.length;
    for (const [index, status] of ["Present", "Absent", "Late"].entries()) {
      const row = within(forms[index]!);
      fireEvent.click(row.getByRole("button", { name: status }));
      if (status === "Late")
        fireEvent.change(row.getByRole("spinbutton", { name: "Minutes late" }), {
          target: { value: "10" },
        });
      fireEvent.click(row.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mockDb.attendanceMarks.length).toBe(count + index + 1));
      await waitFor(() => expect(row.getByRole("button", { name: status })).toBeEnabled());
      expect(mockDb.attendanceMarks.at(-1)?.status).toBe(status.toLowerCase());
    }
    expect(await screen.findByText("10 minutes late")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }));
    await waitFor(() => {
      for (const form of forms)
        expect(within(form).getByRole("button", { name: "Present" })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
    });
  });

  it("uses the roll number when names are unavailable and shows the newest mark by time", async () => {
    const session = mockDb.attendanceSessions.find(
      (row) => row.tenantId === TENANT.riverside && row.status === "open" && row.classGroupId,
    )!;
    const placement = mockDb.enrolments.find((row) => row.tenantId === TENANT.riverside)!;
    placement.classGroupId = session.classGroupId!;
    placement.effectiveFrom = session.date;
    placement.effectiveTo = null;
    placement.rollNumber = "R-TEST";
    mockDb.enrolments = mockDb.enrolments.filter(
      (row) => row.learnerId !== placement.learnerId || row.id === placement.id,
    );
    const template = mockDb.attendanceMarks.find((row) => row.tenantId === TENANT.riverside)!;
    const mark = {
      ...template,
      learnerId: placement.learnerId,
      sessionId: session.id,
      minutesLate: null,
      note: null,
    };
    mockDb.attendanceMarks = mockDb.attendanceMarks.filter(
      (row) => row.sessionId !== session.id || row.learnerId !== placement.learnerId,
    );
    mockDb.attendanceMarks.push(
      { ...mark, id: crypto.randomUUID(), markedAt: "2026-06-05T08:30:00Z", status: "excused" },
      { ...mark, id: crypto.randomUUID(), markedAt: "2026-06-05T08:29:00Z", status: "absent" },
    );
    server.use(
      http.get("*/api/v1/people", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
      ),
    );
    openRollCall();
    const form = await screen.findByRole("form", { name: "Learner R-TEST" });
    expect(within(form).getByRole("button", { name: "Excused" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a waiting badge until the queued mark replays", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      openRollCall();
      const editor = (await screen.findAllByRole("form"))[0]!;
      const form = within(editor);
      const row = within(editor.closest("li")!);
      const count = mockDb.attendanceMarks.length;
      online.mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });
      fireEvent.click(form.getByRole("button", { name: "Absent" }));
      fireEvent.click(form.getByRole("button", { name: "Save" }));
      expect(await row.findByText("Waiting to sync")).toBeVisible();
      expect(mockDb.attendanceMarks).toHaveLength(count);
      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await waitFor(() => expect(mockDb.attendanceMarks).toHaveLength(count + 1));
      await waitFor(() => expect(row.queryByText("Waiting to sync")).not.toBeInTheDocument());
    } finally {
      online.mockRestore();
    }
  });

  it.each(["locked", "viewer"])(
    "shows the roster without editing controls for a %s session",
    async (kind) => {
      if (kind === "viewer") {
        for (const role of mockDb.roles)
          role.permissions = role.permissions.filter((p) => p !== "m17.attendance.mark");
      }
      openRollCall(kind === "locked");
      expect(await screen.findByRole("heading", { name: "Roll call" })).toBeVisible();
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mark all present" })).not.toBeInTheDocument();
    },
  );
});
