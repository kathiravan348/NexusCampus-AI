import type { DemoPersona } from "@nexus/mocks";
import { COURSE_SPACE, PERSON, TENANT, USER, mockDb, roleId } from "@nexus/mocks";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openCourses(who: DemoPersona) {
  return renderApp("/teaching/courses", { as: who, modules: MODULES });
}

function selectTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("CoursesPage (M30)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("lets a Riverside learner view own spaces, outline progress and post a reply", async () => {
    const tomStaffId = mockDb.roleProfiles.find(
      (profile) => profile.personId === PERSON.rvTom && profile.kind === "staff",
    )!.id;
    mockDb.discussionThreads.push({
      id: "dth-rv-y10-sci-lab",
      tenantId: TENANT.riverside,
      courseSpaceId: COURSE_SPACE.rvY10Sci,
      title: "Lab Method Questions",
      authorProfileId: tomStaffId,
      pinned: false,
      locked: false,
      postCount: 0,
      lastPostAt: null,
      createdAt: "2026-09-18T09:00:00Z",
    });

    openCourses(persona(TENANT.riverside, "learner"));

    expect(await screen.findByRole("heading", { level: 1, name: "Courses" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);

    const list = await screen.findByRole("list", { name: "Course spaces" });
    expect(within(list).getByText("Year 10 North — Science")).toBeInTheDocument();
    expect(within(list).getByText("Year 10 North — History")).toBeInTheDocument();
    expect(within(list).queryByText("Year 5 South — Mathematics")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Year 10 North — Science" }));

    expect(await screen.findByText("Experimental Design")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "100.0% (1 of 1)");
    expect(screen.getByText("Lab Method Overview")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();

    selectTab("Discussions");
    expect(
      await screen.findByRole("heading", { level: 3, name: /Lab Method Questions/ }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Reply to thread/), {
      target: { value: "Ready for tomorrow's lab!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    expect(await screen.findByText("Ready for tomorrow's lab!")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to courses" }));
    expect(await screen.findByRole("list", { name: "Course spaces" })).toBeInTheDocument();
  });

  it("shows a Riverside teacher spaces and moderator-only hidden posts", async () => {
    const amira: DemoPersona = {
      ...persona(TENANT.riverside, "teacher"),
      userId: USER.rvAmira,
    };
    const first = openCourses(amira);

    const list = await screen.findByRole("list", { name: "Course spaces" });
    expect(within(list).getByText("Year 5 South — Mathematics")).toBeInTheDocument();
    expect(within(list).queryByText("Year 10 North — Science")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Year 5 South — Mathematics" }));
    expect(await screen.findByText("1 learner with recorded progress")).toBeInTheDocument();

    selectTab("Discussions");
    expect(await screen.findByText("Duplicate post.")).toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();

    first.unmount();

    const teacherRole = mockDb.roles.find((r) => r.id === roleId(TENANT.riverside, "teacher"))!;
    teacherRole.permissions = teacherRole.permissions.filter(
      (code) => code !== "m30.discussion.moderate",
    );

    openCourses(amira);
    fireEvent.click(await screen.findByRole("button", { name: "Open Year 5 South — Mathematics" }));
    selectTab("Discussions");

    expect(await screen.findByText("Does 3/6 equal 1/2?")).toBeInTheDocument();
    expect(screen.queryByText("Duplicate post.")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("hides the Courses nav entry and blocks access for a Riverside guardian", async () => {
    openCourses(persona(TENANT.riverside, "guardian"));

    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Courses" })).not.toBeInTheDocument();
  });

  it("renders cleanly in pseudo-locale (en-XA)", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openCourses(persona(TENANT.riverside, "learner"));

    expect(await screen.findByRole("heading", { level: 1, name: /^⟦.*⟧$/ })).toBeInTheDocument();
    expect(await screen.findByText("Year 10 North — Science")).toBeInTheDocument();
  });
});
