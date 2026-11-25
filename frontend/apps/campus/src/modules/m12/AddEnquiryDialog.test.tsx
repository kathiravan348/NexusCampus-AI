import { TENANT } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("AddEnquiryDialog", () => {
  it("requires a contact method and shows the new enquiry after saving", async () => {
    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    fireEvent.click(await screen.findByRole("button", { name: "Add enquiry" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add enquiry" }));
    fireEvent.change(dialog.getByLabelText(/Learner name/), { target: { value: "Demo learner" } });
    fireEvent.change(dialog.getByLabelText(/Contact name/), { target: { value: "Demo contact" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(await dialog.findByText("Enter a phone number or an email address.")).toBeVisible();
    fireEvent.change(dialog.getByLabelText("Contact email"), {
      target: { value: "admissions@example.test" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    const toggle = await screen.findByRole("button", { name: "Demo learner" });
    expect(within(toggle.closest("li")!).getByText("New")).toBeVisible();
  });

  it("saves a formatted phone number in E.164", async () => {
    let submittedPhone: unknown;
    server.use(
      http.post("*/api/v1/enquiries", async ({ request }) => {
        const body = (await request.clone().json()) as { contactPhone?: unknown };
        submittedPhone = body.contactPhone;
      }),
    );
    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    fireEvent.click(await screen.findByRole("button", { name: "Add enquiry" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add enquiry" }));
    fireEvent.change(dialog.getByLabelText(/Learner name/), { target: { value: "Demo learner" } });
    fireEvent.change(dialog.getByLabelText(/Contact name/), { target: { value: "Demo contact" } });
    fireEvent.change(dialog.getByLabelText("Contact phone"), {
      target: { value: "+91 98765-00000" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    const toggle = await screen.findByRole("button", { name: "Demo learner" });
    expect(within(toggle.closest("li")!).getByText("New")).toBeVisible();
    expect(submittedPhone).toBe("+919876500000");
  });

  it("shows the country code example when a formatted phone number is invalid", async () => {
    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    fireEvent.click(await screen.findByRole("button", { name: "Add enquiry" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add enquiry" }));
    fireEvent.change(dialog.getByLabelText(/Learner name/), { target: { value: "Demo learner" } });
    fireEvent.change(dialog.getByLabelText(/Contact name/), { target: { value: "Demo contact" } });
    fireEvent.change(dialog.getByLabelText("Contact phone"), {
      target: { value: "+91 98765 0000x" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(
      await dialog.findByText(
        "Enter the number with its country code, for example +91 98765 43210.",
      ),
    ).toBeVisible();
  });

  it("shows a server validation error on its field and keeps the form open", async () => {
    server.use(
      http.post("*/api/v1/enquiries", () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_request",
              message: "Invalid program",
              details: [{ path: "programId", message: "Invalid program" }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    fireEvent.click(await screen.findByRole("button", { name: "Add enquiry" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add enquiry" }));
    fireEvent.change(dialog.getByLabelText(/Learner name/), { target: { value: "Demo learner" } });
    fireEvent.change(dialog.getByLabelText(/Contact name/), { target: { value: "Demo contact" } });
    fireEvent.change(dialog.getByLabelText("Contact email"), {
      target: { value: "admissions@example.test" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(await dialog.findByText("Select a program in this institution.")).toBeVisible();
  });
});
