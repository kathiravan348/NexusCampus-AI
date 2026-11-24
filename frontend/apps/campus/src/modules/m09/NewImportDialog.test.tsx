import { TENANT } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { NewImportDialog } from "./NewImportDialog";

function renderDialog() {
  const onOpenChange = vi.fn();
  signInAs(persona(TENANT.riverside, "admin"));
  const view = render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NewImportDialog open onOpenChange={onOpenChange} />
    </AppProviders>,
  );
  return { ...view, onOpenChange };
}

describe("NewImportDialog (M09)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("submits only entity, file name and derived format without reading file contents", async () => {
    let sentBody: unknown = null;
    server.use(
      http.post("*/api/v1/import-jobs", async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          {
            id: "imp-rv-test",
            tenantId: TENANT.riverside,
            entity: "guardian",
            fileName: "guardians.xlsx",
            sourceFormat: "xlsx",
            templateVersion: 1,
            status: "uploaded",
            totalRows: 0,
            validRows: 0,
            errorRows: 0,
            createdByStaffProfileId: "rp-rv-helen-staff",
            rollbackUntil: null,
            createdAt: "2026-11-24T09:00:00Z",
            updatedAt: "2026-11-24T09:00:00Z",
          },
          { status: 201 },
        );
      }),
    );

    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "New import" });

    fireEvent.change(within(dialog).getByLabelText(/Record type/), {
      target: { value: "guardian" },
    });

    const file = new File(["Name,Phone\nSample,+447700900111"], "guardians.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const readText = vi.fn();
    const readBuffer = vi.fn();
    Object.defineProperty(file, "text", { value: readText });
    Object.defineProperty(file, "arrayBuffer", { value: readBuffer });
    const readerTextSpy = vi.spyOn(FileReader.prototype, "readAsText");
    const readerBufferSpy = vi.spyOn(FileReader.prototype, "readAsArrayBuffer");

    fireEvent.change(within(dialog).getByLabelText(/Spreadsheet file/), {
      target: { files: [file] },
    });
    expect(within(dialog).getByText("Detected format: Excel (.xlsx)")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Register import" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(sentBody).toEqual({
      entity: "guardian",
      fileName: "guardians.xlsx",
      sourceFormat: "xlsx",
    });
    expect(readText).not.toHaveBeenCalled();
    expect(readBuffer).not.toHaveBeenCalled();
    expect(readerTextSpy).not.toHaveBeenCalled();
    expect(readerBufferSpy).not.toHaveBeenCalled();
  });

  it("shows a field error for an unsupported file extension and blocks submission", async () => {
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "New import" });

    const invalidFile = new File(["plain text"], "notes.txt", { type: "text/plain" });
    fireEvent.change(within(dialog).getByLabelText(/Spreadsheet file/), {
      target: { files: [invalidFile] },
    });

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Choose a .csv or .xlsx file.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Register import" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Choose a .csv or .xlsx file.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("requires selecting a file before submitting", async () => {
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "New import" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Register import" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("This field is required");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows a permission error when the server refuses with 403", async () => {
    server.use(
      http.post("*/api/v1/import-jobs", () =>
        HttpResponse.json(
          { error: { code: "forbidden", message: "You do not have permission for this." } },
          { status: 403 },
        ),
      ),
    );
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "New import" });

    const file = new File(["a,b"], "learners.csv", { type: "text/csv" });
    fireEvent.change(within(dialog).getByLabelText(/Spreadsheet file/), {
      target: { files: [file] },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Register import" }));

    expect(
      await within(dialog).findByText("You do not have permission to register an import job."),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
