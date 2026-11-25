import { PUBLIC_ENQUIRY_FORM, TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("EnquiriesTab", () => {
  it("shows contact details only in the opened row and filters the pipeline by status", async () => {
    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const rows = mockDb.enquiries.filter((item) => item.tenantId === TENANT.riverside);
    const row = rows[0]!;
    const detail = row.contactPhone ?? row.contactEmail!;
    const toggle = await screen.findByRole("button", { name: row.learnerName });
    expect(screen.queryByText(detail)).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText(detail)).toBeVisible();
    fireEvent.click(toggle);
    expect(screen.queryByText(detail)).toBeNull();
    const other = rows.find((item) => item.status !== row.status)!;
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: other.status },
    });
    expect(await screen.findByRole("button", { name: other.learnerName })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("button", { name: row.learnerName })).toBeNull());
  });

  it("omits manager actions for a read-only viewer", async () => {
    const entry = MODULES.find((item) => item.moduleId === "M12")!;
    renderApp("/admissions", {
      as: persona(TENANT.riverside, "admin"),
      modules: [
        {
          ...entry,
          load: async () => {
            const { EnquiriesTab } = await import("./EnquiriesTab");
            return { default: () => <EnquiriesTab canManage={false} online /> };
          },
        },
      ],
    });
    expect(await screen.findByLabelText("Filter by status")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add enquiry" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy public form link" })).toBeNull();
  });

  it("copies the public enquiry form link and shows a confirmation toast", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
      const copyButton = await screen.findByRole("button", { name: "Copy public form link" });
      fireEvent.click(copyButton);
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          `${window.location.origin}/apply/${PUBLIC_ENQUIRY_FORM.riversideSchool}`,
        ),
      );
      expect(await screen.findByText("Public enquiry form link copied.")).toBeVisible();
    } finally {
      if (previous) {
        Object.defineProperty(navigator, "clipboard", previous);
      } else {
        delete (navigator as { clipboard?: unknown }).clipboard;
      }
    }
  });
});
