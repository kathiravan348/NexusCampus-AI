import type { ImportJob } from "@nexus/contracts";
import { formatDateTime } from "@nexus/i18n";
import { IMPORT_JOB, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { ImportJobView } from "./ImportJobView";

function renderJobView(job: ImportJob, onBack = vi.fn()) {
  signInAs(persona(TENANT.riverside, "admin"));
  const view = render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ImportJobView job={job} onBack={onBack} />
    </AppProviders>,
  );
  return { ...view, onBack };
}

describe("ImportJobView (M09)", () => {
  it("shows summary, rollback deadline, mappings and empty issues for a completed job", async () => {
    const job = mockDb.importJobs.find((row) => row.id === IMPORT_JOB.rv[0])!;
    const { onBack } = renderJobView(job);

    expect(
      await screen.findByRole("heading", { level: 1, name: job.fileName }),
    ).toBeInTheDocument();
    expect(screen.getByText("Rollback available until")).toBeInTheDocument();
    expect(
      screen.getByText(
        formatDateTime(job.rollbackUntil!, { locale: "en-GB", timeZone: "Europe/London" }),
      ),
    ).toBeInTheDocument();

    const mappingsList = await screen.findByRole("list", { name: "Column mappings" });
    expect(within(mappingsList).getByText("Full Name")).toBeInTheDocument();
    expect(within(mappingsList).getByText("legalName")).toBeInTheDocument();
    expect(within(mappingsList).getByText("custom:studyInterest")).toBeInTheDocument();
    expect(within(mappingsList).getAllByText("Trim spaces").length).toBeGreaterThan(0);

    expect(
      await screen.findByText("No validation issues reported for this job."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to imports" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows skipped columns and localized issue keys without rollback on a dry-run job", async () => {
    const job = mockDb.importJobs.find((row) => row.id === IMPORT_JOB.rv[1])!;
    renderJobView(job);

    expect(
      await screen.findByRole("heading", { level: 1, name: job.fileName }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Rollback available until")).not.toBeInTheDocument();

    const mappingsList = await screen.findByRole("list", { name: "Column mappings" });
    expect(within(mappingsList).getByText("Guardian Name")).toBeInTheDocument();
    expect(within(mappingsList).getByText("Phone (+91)")).toBeInTheDocument();
    expect(within(mappingsList).getByText("Skipped")).toBeInTheDocument();

    const issuesList = await screen.findByRole("list", { name: "Dry-run validation issues" });
    expect(within(issuesList).getByText("Row 4")).toBeInTheDocument();
    expect(within(issuesList).getByText("Column: Mobile")).toBeInTheDocument();
    expect(within(issuesList).getByText("Error")).toBeInTheDocument();
    expect(
      within(issuesList).getByText("Phone number is not in a valid format."),
    ).toBeInTheDocument();
    expect(within(issuesList).getByText("Row 2")).toBeInTheDocument();
    expect(within(issuesList).getByText("Warning")).toBeInTheDocument();
    expect(
      within(issuesList).getByText("A matching name already exists in this institution."),
    ).toBeInTheDocument();
  });

  it("renders error states with retry when mappings or issues fail to load", async () => {
    const job = mockDb.importJobs.find((row) => row.id === IMPORT_JOB.rv[1])!;
    server.use(
      http.get("*/api/v1/import-jobs/:id/mappings", () =>
        HttpResponse.json(
          { error: { code: "internal", message: "Something went wrong." } },
          { status: 500 },
        ),
      ),
      http.get("*/api/v1/import-jobs/:id/issues", () =>
        HttpResponse.json(
          { error: { code: "internal", message: "Something went wrong." } },
          { status: 500 },
        ),
      ),
    );
    renderJobView(job);

    expect(await screen.findByText("Column mappings could not be loaded.")).toBeInTheDocument();
    expect(await screen.findByText("Validation issues could not be loaded.")).toBeInTheDocument();
  });
});
