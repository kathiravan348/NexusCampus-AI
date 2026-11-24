import type { HomeCard } from "@nexus/contracts";
import { formatNumber } from "@nexus/i18n";
import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { HomeCards } from "./HomeCards";

function renderCards(cards: readonly HomeCard[], childCount: number) {
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <HomeCards cards={cards} childCount={childCount} />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("HomeCards", () => {
  it("renders titles, counts, severity text, links, and a single combined note", () => {
    const cards: readonly HomeCard[] = [
      {
        kind: "attendance",
        titleKey: "m28.card.attendance",
        moduleId: "M17",
        count: 1234,
        severity: "warning",
        href: "/attendance",
      },
      {
        kind: "fees",
        titleKey: "m28.card.fees",
        moduleId: "M18",
        count: null,
        severity: "critical",
        href: "/fees",
      },
      {
        kind: "messages",
        titleKey: "m28.card.messages",
        moduleId: "M24",
        count: 0,
        severity: "info",
        href: "/messages",
      },
      {
        kind: "notices",
        titleKey: "m28.card.notices",
        moduleId: "M24",
        count: 3,
        severity: null,
        href: "/notices",
      },
    ];

    renderCards(cards, 2);

    expect(screen.getAllByText("Totals for all your children")).toHaveLength(1);
    const list = screen.getByRole("list", { name: "Summary cards" });

    const attendanceLink = within(list).getByRole("link", { name: /Attendance/ });
    expect(attendanceLink).toHaveAttribute("href", "/attendance");
    expect(within(attendanceLink).getByText("1,234")).toBeVisible();
    expect(within(attendanceLink).getByText("Warning")).toBeVisible();

    const feesLink = within(list).getByRole("link", { name: /Unpaid invoices/ });
    expect(feesLink).toHaveAttribute("href", "/fees");
    expect(within(feesLink).getByText("Critical")).toBeVisible();
    expect(within(feesLink).queryByText(/\d/)).toBeNull();

    const messagesLink = within(list).getByRole("link", { name: /Unread messages/ });
    expect(messagesLink).toHaveAttribute("href", "/messages");
    expect(within(messagesLink).getByText("0")).toBeVisible();
    expect(within(messagesLink).getByText("Info")).toBeVisible();

    const noticesLink = within(list).getByRole("link", { name: /Notices/ });
    expect(noticesLink).toHaveAttribute("href", "/notices");
    expect(within(noticesLink).getByText("3")).toBeVisible();
    expect(within(noticesLink).queryByText("Info")).toBeNull();
    expect(within(noticesLink).queryByText("Warning")).toBeNull();
    expect(within(noticesLink).queryByText("Critical")).toBeNull();
  });

  it("omits the combined note for a single child and uses the tenant locale", async () => {
    signInAs(persona(TENANT.apex, "guardian"));
    renderCards(
      [
        {
          kind: "fees",
          titleKey: "m28.card.fees",
          moduleId: "M18",
          count: 100000,
          severity: null,
          href: "/fees",
        },
      ],
      1,
    );

    expect(await screen.findByText(formatNumber(100000, "en-IN"))).toBeVisible();
    expect(screen.queryByText("Totals for all your children")).toBeNull();
  });
});
