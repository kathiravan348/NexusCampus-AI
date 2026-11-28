import { COURSE_SPACE, LEARNER, TENANT, USER, type DemoPersona } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { CourseOutline } from "./CourseOutline";

function renderOutline(courseSpaceId: string, who: DemoPersona, isStaff: boolean) {
  signInAs(who);
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CourseOutline courseSpaceId={courseSpaceId} isStaff={isStaff} />
    </AppProviders>,
  );
}

describe("CourseOutline (M30)", () => {
  it("shows ordered modules, items, prerequisites and learner progress", async () => {
    renderOutline(COURSE_SPACE.nbCs101, persona(TENANT.northbridge, "learner"), false);

    expect(await screen.findByText("CS101 Syllabus & Setup")).toBeInTheDocument();

    const headings = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    expect(headings).toEqual(["Loops", "Testing"]);

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "50.0% (2 of 4)");
    expect(screen.getByText("Prerequisites: Loops")).toBeInTheDocument();
    expect(screen.getByText("Page")).toBeInTheDocument();
    expect(screen.getByText("Lesson")).toBeInTheDocument();
    expect(screen.getByText("Discussion")).toBeInTheDocument();
    expect(screen.getByText("Assignment")).toBeInTheDocument();
    expect(screen.getByText("Live class")).toBeInTheDocument();
    expect(screen.getAllByText("View to complete")).toHaveLength(2);
    expect(screen.getByText("Pass at 70%")).toBeInTheDocument();
    expect(screen.getByText("No completion required")).toBeInTheDocument();
    expect(screen.getByText("Submit to complete")).toBeInTheDocument();
    expect(screen.getAllByText("Done")).toHaveLength(2);
  });

  it("shows staff aggregate progress counts without listing learners", async () => {
    const amira: DemoPersona = {
      ...persona(TENANT.riverside, "teacher"),
      userId: USER.rvAmira,
    };
    const { container } = renderOutline(COURSE_SPACE.rvY5Math, amira, true);

    expect(await screen.findByText("1 learner with recorded progress")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByText("Prerequisites: Equivalent Fractions")).toBeInTheDocument();
    expect(screen.getByText("Prerequisites: Adding Fractions")).toBeInTheDocument();
    expect(screen.getAllByText("1 of 1 done")).toHaveLength(2);
    expect(screen.getAllByText("0 of 1 done")).toHaveLength(4);
    expect(container.textContent).not.toContain(LEARNER.rvMia);
    expect(container.textContent).not.toContain("Mia");
  });
});
