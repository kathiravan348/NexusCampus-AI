import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openNoticesTab() {
  const tab = await screen.findByRole("tab", { name: "Notices" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("NoticesTab", () => {
  it("shows all tenant notices with status and acknowledgement badges for publishers", async () => {
    renderApp("/messages", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    await openNoticesTab();

    const list = within(await screen.findByRole("list", { name: "Notices" }));
    expect(list.getAllByRole("listitem")).toHaveLength(2);
    expect(list.getByText("Term calendar reminder")).toBeVisible();
    expect(list.getByText("Published")).toBeVisible();
    expect(list.getByText("Family and teacher review sessions")).toBeVisible();
    expect(list.getByText("Scheduled")).toBeVisible();
    expect(list.getByText("Needs acknowledgement")).toBeVisible();
  });

  it("shows audience notices as plain text without status badges for guardians", async () => {
    const published = mockDb.notices.find(
      (row) => row.tenantId === TENANT.riverside && row.status === "published",
    )!;
    published.requiresAcknowledgement = true;
    published.body = "Bring <strong>signed</strong> form <script>alert(1)</script>";
    mockDb.notices.push({
      ...published,
      id: "not-rv-teacher-only",
      title: "Staff only notice",
      audience: { kind: "roles", ids: ["teacher"] },
    });

    renderApp("/messages", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    await openNoticesTab();

    const listEl = await screen.findByRole("list", { name: "Notices" });
    const list = within(listEl);
    expect(list.getAllByRole("listitem")).toHaveLength(1);
    expect(list.getByText("Term calendar reminder")).toBeVisible();
    expect(list.getByText("Needs acknowledgement")).toBeVisible();
    expect(list.getByText(published.body)).toBeVisible();
    expect(listEl.querySelector("strong")).toBeNull();
    expect(listEl.querySelector("script")).toBeNull();
    expect(list.queryByText("Published")).toBeNull();
    expect(list.queryByText("Scheduled")).toBeNull();
    expect(list.queryByText("Staff only notice")).toBeNull();
  });

  it("shows an empty state when there are no visible notices", async () => {
    mockDb.notices = mockDb.notices.filter((row) => row.tenantId !== TENANT.riverside);

    renderApp("/messages", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    await openNoticesTab();

    expect(await screen.findByText("No notices to show")).toBeVisible();
  });
});
