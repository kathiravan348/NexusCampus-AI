import { STAFF, TICKET } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

function renderAt(path: string, staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), { initialEntries: [path] });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P09 Support", () => {
  it("lists tickets, flags a missed SLA and filters by status", async () => {
    renderAt("/support", STAFF.morgan);
    const table = await screen.findByRole("table", { name: "Tickets" });
    expect(
      await within(table).findByRole("link", { name: "Nightly backup slower since 2.2.5" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("SLA missed")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "new" },
    });
    expect(
      await within(table).findByRole("link", { name: "What happens when the trial ends?" }),
    ).toBeInTheDocument();
    expect(
      within(await screen.findByRole("table", { name: "Tickets" })).queryByRole("link", {
        name: "Nightly backup slower since 2.2.5",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "SLA targets by support tier" })).toBeInTheDocument();
  });

  it("shows the thread with internal and AI labels, and posts a reply", async () => {
    renderAt(`/support/${TICKET.apexTemplates}`, STAFF.morgan);
    expect(
      await screen.findByRole("heading", { name: "Notification templates fail to render" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Internal note")).toBeInTheDocument();
    expect(screen.getByText("AI draft, checked by staff")).toBeInTheDocument();
    expect(screen.getByText(/Linked access request acr-ax-0915/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Reply" }), {
      target: { value: "The fix is live; please check tomorrow's reminders." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Reply added")).toBeInTheDocument();
    expect(
      await screen.findByText("The fix is live; please check tomorrow's reminders."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Waiting for customer")).toBeInTheDocument();
  });

  it("lets a partner read their customer's ticket without replying", async () => {
    renderAt(`/support/${TICKET.apexTemplates}`, STAFF.partnerUser);
    await screen.findByRole("heading", { name: "Notification templates fail to render" });
    expect(screen.getByText("You can read this ticket but not reply.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Reply" })).not.toBeInTheDocument();
  });
});
