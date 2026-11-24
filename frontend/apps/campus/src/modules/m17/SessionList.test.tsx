import { TENANT, mockDb } from "@nexus/mocks";
import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("lists only the selected class, newest date first, with mode and status text", async () => {
  const group = mockDb.attendanceSessions.find(
    (row) => row.tenantId === TENANT.riverside && row.classGroupId,
  )!.classGroupId!;
  renderApp(`/attendance?group=${encodeURIComponent(group)}`, {
    as: persona(TENANT.riverside, "teacher"),
    modules: MODULES,
  });
  const heading = await screen.findByRole("heading", { name: "Attendance sessions" });
  const buttons = within(heading.parentElement!).getAllByRole("button");
  const sessions = mockDb.attendanceSessions.filter(
    (row) => row.tenantId === TENANT.riverside && row.classGroupId === group,
  );
  expect(buttons.map((button) => button.querySelector("time")?.dateTime)).toEqual(
    sessions
      .map((row) => row.date)
      .sort()
      .reverse(),
  );
  for (const button of buttons) {
    expect(button).toHaveAccessibleName(/(Daily|Period|Session|Event).*?(Open|Submitted|Locked)/);
  }
});
