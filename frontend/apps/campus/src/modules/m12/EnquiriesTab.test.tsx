import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("omits the manager action for a read-only viewer", async () => {
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
  });
});
