import { resolveMessages } from "@nexus/i18n";
import { PUBLIC_ENQUIRY_FORM, TENANT, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MODULES } from "../app/modules";
import { persona, renderApp } from "../test/renderApp";

describe("PublicEnquiry", () => {
  it("sends an enquiry signed out and lists it as New / Public form for admin", async () => {
    const publicView = renderApp(`/apply/${PUBLIC_ENQUIRY_FORM.riversideSchool}`, {
      modules: MODULES,
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Riverside School" }),
    ).toBeVisible();
    expect(screen.getByRole("note")).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Learner name/), {
      target: { value: "Anya Public" },
    });
    fireEvent.change(screen.getByLabelText(/Contact name/), {
      target: { value: "Claire Public" },
    });
    fireEvent.change(screen.getByLabelText("Contact phone"), {
      target: { value: "+44 7700-900456" },
    });
    const consent = screen.getByRole("checkbox", {
      name: /I consent to Riverside School contacting me about this admissions enquiry\./,
    });
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Thank you for your enquiry" }),
    ).toBeVisible();
    expect(screen.queryByText("Anya Public")).toBeNull();
    expect(screen.queryByText("+447700900456")).toBeNull();

    const stored = mockDb.enquiries.find(
      (row) => row.tenantId === TENANT.riverside && row.learnerName === "Anya Public",
    );
    expect(stored).toMatchObject({
      contactName: "Claire Public",
      contactPhone: "+447700900456",
      status: "new",
      source: "public_form",
      assignedStaffProfileId: null,
    });

    publicView.unmount();

    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const toggle = await screen.findByRole("button", { name: "Anya Public" });
    const item = within(toggle.closest("li")!);
    expect(item.getByText("New")).toBeVisible();
    expect(item.getByText("Public form")).toBeVisible();
  });

  it("validates required names, contact method, formatted phone and consent", async () => {
    renderApp(`/apply/${PUBLIC_ENQUIRY_FORM.riversideSchool}`, { modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Riverside School" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(await screen.findByText("Enter a phone number or an email address.")).toBeVisible();
    expect(screen.getByText("Confirm that you consent to be contacted.")).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Learner name/), { target: { value: "Demo learner" } });
    fireEvent.change(screen.getByLabelText(/Contact name/), { target: { value: "Demo contact" } });
    fireEvent.change(screen.getByLabelText("Contact phone"), {
      target: { value: "+91 98765 0000x" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /I consent to Riverside School/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(
      await screen.findByText(
        "Enter the number with its country code, for example +91 98765 43210.",
      ),
    ).toBeVisible();
  });

  it("shows Needs a connection and disables Send enquiry when offline", async () => {
    const connection = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      renderApp(`/apply/${PUBLIC_ENQUIRY_FORM.riversideSchool}`, { modules: MODULES });
      const submit = await screen.findByRole("button", { name: "Send enquiry" });
      expect(submit).toBeEnabled();

      connection.mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });

      expect(screen.getByText("Needs a connection")).toBeVisible();
      expect(submit).toBeDisabled();
    } finally {
      connection.mockRestore();
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
    }
  });

  it("shows a not-found message for an unknown form id", async () => {
    renderApp("/apply/pef-does-not-exist", { modules: MODULES });
    expect(await screen.findByRole("heading", { name: "Enquiry form not found" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send enquiry" })).toBeNull();
  });

  it("drops submissions silently when the hidden honeypot is filled", async () => {
    const before = mockDb.enquiries.length;
    renderApp(`/apply/${PUBLIC_ENQUIRY_FORM.riversideSchool}`, { modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Riverside School" }),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Learner name/), { target: { value: "Bot Learner" } });
    fireEvent.change(screen.getByLabelText(/Contact name/), { target: { value: "Bot Contact" } });
    fireEvent.change(screen.getByLabelText("Contact email"), {
      target: { value: "bot@example.test" },
    });
    fireEvent.change(document.getElementById("m12-public-website")!, {
      target: { value: "https://spam.example" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /I consent to Riverside School/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Thank you for your enquiry" }),
    ).toBeVisible();
    expect(mockDb.enquiries).toHaveLength(before);
  });

  it("provides Hindi and Tamil translations for public enquiry messages (D42)", () => {
    const hi = resolveMessages({ locale: "hi-IN" });
    const ta = resolveMessages({ locale: "ta-IN" });
    for (const key of [
      "m12.public.title",
      "m12.public.submit",
      "m12.public.consent",
      "m12.public.copyLink",
      "m12.public.notFoundTitle",
    ] as const) {
      expect(hi[key]).toMatch(/[ऀ-ॿ]/);
      expect(ta[key]).toMatch(/[஀-௿]/);
    }
  });
});
