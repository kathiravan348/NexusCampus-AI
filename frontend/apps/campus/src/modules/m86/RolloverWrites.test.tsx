import type { RolloverRun } from "@nexus/contracts";
import { TENANT, mockDb } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { ChangeDecisionDialog } from "./ChangeDecisionDialog";
import { RunActions } from "./RunActions";
import { StartRolloverDialog } from "./StartRolloverDialog";

function renderAsAdmin(node: ReactNode) {
  signInAs(persona(TENANT.littleSteps, "admin"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </AppProviders>,
  );
}

function fixtureRun(): RolloverRun {
  const run = mockDb.rolloverRuns.find((row) => row.tenantId === TENANT.littleSteps);
  if (!run) throw new Error("missing fixture run");
  return run;
}

describe("M86 rollover writes (NEX-194, D84)", () => {
  it("confirms a ready dry run after showing its counts, then rolls it back", async () => {
    const run = fixtureRun();
    const view = renderAsAdmin(<RunActions run={run} online />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm rollover" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm rollover" });
    expect(within(dialog).getByText(/You can roll back for 14 days/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm rollover" }));
    await waitFor(() => expect(fixtureRun().status).toBe("completed"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    view.rerender(
      <AppProviders
        db={freshDb()}
        createClient={() =>
          createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RunActions run={fixtureRun()} online />
      </AppProviders>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Roll back" }));
    const back = await screen.findByRole("dialog", { name: "Roll back" });
    fireEvent.click(within(back).getByRole("button", { name: "Roll back" }));
    await waitFor(() => expect(fixtureRun().status).toBe("rolled_back"));
  });

  it("shows no actions for runs that are neither ready nor inside the window", async () => {
    const run = { ...fixtureRun(), status: "rolled_back" as const, rollbackUntil: null };
    renderAsAdmin(
      <>
        <p>ready</p>
        <RunActions run={run} online />
      </>,
    );
    await screen.findByText("ready");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("changes one decision and asks for a next-year class before promoting", async () => {
    const run = fixtureRun();
    const decision = mockDb.promotionDecisions.find((row) => row.runId === run.id);
    if (!decision) throw new Error("missing decision");
    const onClose = vi.fn();
    renderAsAdmin(<ChangeDecisionDialog run={run} decision={decision} onClose={onClose} online />);
    const dialog = await screen.findByRole("dialog", { name: "Change decision" });
    fireEvent.change(within(dialog).getByLabelText(/Action/), { target: { value: "promote" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save decision" }));
    expect(
      await within(dialog).findByText("Choose a class of the next academic year."),
    ).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Action/), { target: { value: "graduate" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save decision" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saved = mockDb.promotionDecisions.find((row) => row.id === decision.id);
    expect(saved?.action).toBe("graduate");
    expect(saved?.overriddenByStaffProfileId).not.toBeNull();
  });

  it("starts a dry run and explains when one is already open", async () => {
    const run = fixtureRun();
    const year = mockDb.calendars.find((row) => row.id === run.fromAcademicYearId);
    if (!year) throw new Error("missing calendar");
    mockDb.calendars.push({
      ...year,
      id: run.toAcademicYearId,
      academicYear: "2027-28",
    } as typeof year);
    const onStarted = vi.fn();
    renderAsAdmin(<StartRolloverDialog open onOpenChange={vi.fn()} online onStarted={onStarted} />);
    const dialog = await screen.findByRole("dialog", { name: "Start a rollover dry run" });
    const toYear = within(dialog).getByLabelText(/To academic year/) as HTMLSelectElement;
    await waitFor(() => expect(toYear.value).toBe(run.toAcademicYearId));
    fireEvent.click(within(dialog).getByRole("button", { name: "Start dry run" }));
    expect(
      await within(dialog).findByText("A rollover run is already open for this year."),
    ).toBeTruthy();
    expect(onStarted).not.toHaveBeenCalled();

    fireEvent.change(toYear, { target: { value: run.fromAcademicYearId } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start dry run" }));
    expect(await within(dialog).findByText("Choose two different academic years.")).toBeTruthy();
  });
});
