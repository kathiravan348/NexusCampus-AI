import {
  COURSE_SPACE,
  DISCUSSION_POST,
  PERSON,
  TENANT,
  USER,
  mockDb,
  type DemoPersona,
} from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { DiscussionsTab } from "./DiscussionsTab";

function renderDiscussions(options: { readonly canModerate: boolean; readonly who?: DemoPersona }) {
  const activeWho: DemoPersona = options.who ?? {
    ...persona(TENANT.riverside, "teacher"),
    userId: USER.rvAmira,
  };
  signInAs(activeWho);
  const amiraStaffId = mockDb.roleProfiles.find(
    (row) => row.personId === PERSON.rvAmira && row.kind === "staff",
  )!.id;

  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DiscussionsTab
        courseSpaceId={COURSE_SPACE.rvY5Math}
        canModerate={options.canModerate}
        ownProfileIds={new Set([amiraStaffId])}
      />
    </AppProviders>,
  );
}

describe("DiscussionsTab (M30)", () => {
  it("orders pinned threads first and hides reply controls on a locked thread", async () => {
    const amiraStaffId = mockDb.roleProfiles.find(
      (row) => row.personId === PERSON.rvAmira && row.kind === "staff",
    )!.id;
    mockDb.discussionThreads.push({
      id: "dth-rv-math-locked",
      tenantId: TENANT.riverside,
      courseSpaceId: COURSE_SPACE.rvY5Math,
      title: "Archived Homework Notice",
      authorProfileId: amiraStaffId,
      pinned: false,
      locked: true,
      postCount: 0,
      lastPostAt: "2026-09-20T12:00:00Z",
      createdAt: "2026-09-20T10:00:00Z",
    });

    renderDiscussions({ canModerate: true });

    const threadList = await screen.findByRole("list", { name: "Discussion threads" });
    const buttons = within(threadList).getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Questions on Equivalent Fractions");
    expect(buttons[0]).toHaveTextContent("Pinned");
    expect(buttons[1]).toHaveTextContent("Archived Homework Notice");
    expect(buttons[1]).toHaveTextContent("Locked");

    fireEvent.click(buttons[1]!);

    expect(
      await screen.findByText("This thread is locked. New replies are closed."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Reply to thread/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post reply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
  });

  it("renders nested replies, gates hidden posts and posts inline replies", async () => {
    const hiddenView = renderDiscussions({ canModerate: false });
    expect(await screen.findByText("Does 3/6 equal 1/2?")).toBeInTheDocument();
    expect(screen.getByText("Divide by 3.")).toBeInTheDocument();
    expect(screen.queryByText("Duplicate post.")).not.toBeInTheDocument();
    hiddenView.unmount();

    renderDiscussions({ canModerate: true });
    expect(await screen.findByText("Duplicate post.")).toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();

    const postsList = screen.getByRole("list", { name: "Discussion replies" });
    const rootItem = screen.getByText("Does 3/6 equal 1/2?").closest("li")!;
    expect(within(rootItem).getByText("Divide by 3.")).toBeInTheDocument();
    expect(postsList).toBeInTheDocument();

    const replyButtons = within(rootItem).getAllByRole("button", { name: "Reply" });
    fireEvent.click(replyButtons[0]!);

    const postInput = await within(rootItem).findByLabelText(/^Reply to post/);
    fireEvent.change(postInput, { target: { value: "Try drawing fraction strips too." } });
    fireEvent.click(within(rootItem).getByRole("button", { name: "Post reply" }));

    expect(await screen.findByText("Try drawing fraction strips too.")).toBeInTheDocument();
    const created = mockDb.discussionPosts.find(
      (post) => post.body === "Try drawing fraction strips too.",
    );
    expect(created?.parentPostId).toBe(DISCUSSION_POST.rvMiaQuestion);
  });
});
