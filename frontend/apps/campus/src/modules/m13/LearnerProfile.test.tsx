import { LEARNER, LEARNER_FIELD, TENANT, mockDb } from "@nexus/mocks";
import { act, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

function openProfile(learnerId: string, role: "admin" | "teacher" | "guardian" = "admin") {
  return renderApp(`/learners?learner=${encodeURIComponent(learnerId)}`, {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

function addRestrictedFixtureData(learnerId: string) {
  const row = mockDb.learners.find((entry) => entry.id === learnerId);
  if (!row) throw new Error("Missing learner fixture");
  row.healthFlags = [
    { kind: "allergy", label: "Peanut allergy", note: "Keep emergency inhaler nearby." },
  ];
  row.customFields[LEARNER_FIELD.supportNote] = "Requires quiet exam room.";
}

describe("LearnerProfile (M13)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("shows details, enrolments, health flags, custom fields and court note", async () => {
    addRestrictedFixtureData(LEARNER.rvElla);
    openProfile(LEARNER.rvElla, "admin");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ella Price" }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.getByRole("heading", { level: 2, name: "Details" })).toBeInTheDocument();
    expect(screen.getByText("RV-2026-0004")).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Health flags" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Peanut allergy")).toBeInTheDocument();
    expect(screen.getByText("Keep emergency inhaler nearby.")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { level: 2, name: "Additional details" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Study interest")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Learner support note")).toBeInTheDocument();
    expect(screen.getByText("Requires quiet exam room.")).toBeInTheDocument();

    expect(await screen.findByText("Year 9 North Section")).toBeInTheDocument();
    expect(await screen.findByText("Court restricted")).toBeInTheDocument();
    expect(screen.getByText("Collection requires prior court approval.")).toBeInTheDocument();
  });

  it("shows document metadata without any download link", async () => {
    openProfile(LEARNER.rvOliver, "admin");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Oliver Bennett" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Previous report")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    const docsHeading = screen.getByRole("heading", { level: 2, name: "Documents" });
    const docsCard = docsHeading.closest("div")?.parentElement;
    expect(docsCard).not.toBeNull();
    if (docsCard) {
      expect(within(docsCard).queryAllByRole("link")).toHaveLength(0);
    }
  });

  it("masks health flags, sensitive fields and court notes from a teacher", async () => {
    addRestrictedFixtureData(LEARNER.rvElla);
    openProfile(LEARNER.rvElla, "teacher");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ella Price" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Study interest")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(await screen.findByText("Court restricted")).toBeInTheDocument();

    expect(screen.queryByRole("heading", { name: "Health flags" })).not.toBeInTheDocument();
    expect(screen.queryByText("Peanut allergy")).not.toBeInTheDocument();
    expect(screen.queryByText("Requires quiet exam room.")).not.toBeInTheDocument();
    expect(screen.queryByText("Learner support note")).not.toBeInTheDocument();
    expect(screen.queryByText("Collection requires prior court approval.")).not.toBeInTheDocument();
    expect(screen.queryByText("Court order note")).not.toBeInTheDocument();
  });

  it("shows a not found state when a guardian opens another learner URL", async () => {
    openProfile(LEARNER.rvElla, "guardian");

    expect(await screen.findByRole("heading", { name: "Learner not found" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to learners" })).toBeInTheDocument();
  });

  it("lets a guardian view their own child profile", async () => {
    openProfile(LEARNER.rvOliver, "guardian");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Oliver Bennett" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Year 10 North Section")).toBeInTheDocument();
    expect(await screen.findByText("Grace Bennett")).toBeInTheDocument();
    expect(screen.getByText("Pickup allowed")).toBeInTheDocument();
  });

  it("keeps an opened profile readable offline from cache with last synced", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    openProfile(LEARNER.rvOliver, "admin");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Oliver Bennett" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Year 10 North Section")).toBeInTheDocument();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);

    onlineSpy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByRole("heading", { level: 1, name: "Oliver Bennett" })).toBeInTheDocument();
    expect(screen.getByText("Year 10 North Section")).toBeInTheDocument();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
  });
});
