import { COURSE_SPACE, TENANT, USER, mockDb, type DemoPersona } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { CourseSpaceView } from "./CourseSpaceView";

function renderSpaceView(who?: DemoPersona) {
  const activeWho: DemoPersona = who ?? {
    ...persona(TENANT.riverside, "teacher"),
    userId: USER.rvAmira,
  };
  signInAs(activeWho);
  const space = mockDb.courseSpaces.find((row) => row.id === COURSE_SPACE.rvY5Math)!;
  const onBack = vi.fn();

  const view = render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CourseSpaceView space={space} onBack={onBack} />
    </AppProviders>,
  );

  return { ...view, onBack, space };
}

describe("CourseSpaceView (M30)", () => {
  it("shows space details, calls onBack and switches between Outline and Discussions", async () => {
    const { onBack } = renderSpaceView();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Year 5 South — Mathematics" }),
    ).toBeInTheDocument();
    expect(screen.getByText("RV-Y5-MATH")).toBeInTheDocument();
    expect(screen.getByText("Class")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { level: 3, name: /Equivalent Fractions/ }),
    ).toBeInTheDocument();

    const discussionsTab = screen.getByRole("tab", { name: "Discussions" });
    fireEvent.mouseDown(discussionsTab);
    fireEvent.click(discussionsTab);

    expect(
      await screen.findByRole("heading", { level: 3, name: /Questions on Equivalent Fractions/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to courses" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("applies RTL direction to the tabs when the active locale is RTL", async () => {
    const institution = mockDb.institutions.find((row) => row.tenantId === TENANT.riverside)!;
    institution.locale.supportedLocales.push("ar");
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "ar" }));

    renderSpaceView();

    await waitFor(() => {
      expect(screen.getByRole("tablist").closest("[dir='rtl']")).not.toBeNull();
    });
  });
});
