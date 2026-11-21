import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

function renderAt(staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
    initialEntries: ["/access"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("P10 Access requests", () => {
  it("shows that the institution decides, and sends a scoped request", async () => {
    renderAt(STAFF.morgan);
    const table = await screen.findByRole("table", { name: "Access requests" });
    expect(await within(table).findByText("The institution decides")).toBeInTheDocument();
    expect(within(table).getByText("Denied by the institution")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Request access" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask an institution for access" });
    const institution = within(dialog).getByRole("combobox", { name: "Institution" });
    await within(institution).findByRole("option", { name: "Harmony Music Academy" });
    expect(within(dialog).queryByRole("checkbox", { name: "Data vault & access" })).toBeNull();
    const send = within(dialog).getByRole("button", { name: "Send request" });
    expect(send).toBeDisabled();
    fireEvent.click(within(dialog).getAllByRole("checkbox")[0] as HTMLElement);
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Reason the institution will read" }),
      {
        target: { value: "Check the institution profile import." },
      },
    );
    fireEvent.click(send);
    expect(await screen.findByText(/Request sent/)).toBeInTheDocument();
    expect(
      await within(await screen.findByRole("table", { name: "Access requests" })).findByText(
        "Check the institution profile import.",
      ),
    ).toBeInTheDocument();
  });

  it("lists recorded sessions and the break-glass case with its report owed", async () => {
    renderAt(STAFF.okafor);
    await screen.findByRole("table", { name: "Access requests" });
    openTab("Sessions");
    const sessions = await screen.findByRole("table", { name: "Support sessions" });
    expect(await within(sessions).findByText("31")).toBeInTheDocument();
    openTab("Break-glass");
    expect(await screen.findByText("Report still owed to the institution")).toBeInTheDocument();
    expect(screen.getByText("Approved by C. Okafor and E. Lindqvist")).toBeInTheDocument();
  });

  it("is hidden from billing staff", async () => {
    renderAt(STAFF.billing);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
