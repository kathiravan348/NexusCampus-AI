import { GUARDIAN_RELATIONSHIP, PERSON, TENANT, mockDb } from "@nexus/mocks";
import { usePeople } from "@nexus/services";
import { screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import type { ModuleEntry } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";
import { GuardianList } from "./GuardianList";

function renderGuardianList(
  learnerPersonId: string,
  options: { readonly role?: "admin" | "teacher"; readonly showPickups?: boolean } = {},
) {
  const { role = "admin", showPickups = true } = options;
  function Harness() {
    const people = usePeople();
    const peopleById = useMemo(
      () => new Map((people.data?.items ?? []).map((p) => [p.id, p])),
      [people.data],
    );
    return (
      <GuardianList
        learnerPersonId={learnerPersonId}
        peopleById={peopleById}
        showPickups={showPickups}
      />
    );
  }
  const modules: readonly ModuleEntry[] = [
    {
      moduleId: "M14",
      path: "test-guardians",
      navKey: "m14.nav.title",
      summaryKey: "m14.nav.summary",
      icon: Users,
      permission: null,
      offlineLevel: "L1",
      load: () => Promise.resolve({ default: Harness }),
    },
  ];
  return renderApp("/test-guardians", { as: persona(TENANT.riverside, role), modules });
}

describe("GuardianList (M14)", () => {
  it("shows court-restricted warning badge and court order note to an admin", async () => {
    renderGuardianList(PERSON.rvElla, { role: "admin", showPickups: false });

    expect(await screen.findByText("Daniel Price")).toBeInTheDocument();
    expect(screen.getByText("Father")).toBeInTheDocument();
    expect(screen.getByText("Court restricted")).toBeInTheDocument();
    expect(screen.getByText("Court order note")).toBeInTheDocument();
    expect(screen.getByText("Collection requires prior court approval.")).toBeInTheDocument();
  });

  it("shows the warning badge without the court note when masked for a teacher", async () => {
    renderGuardianList(PERSON.rvElla, { role: "teacher", showPickups: false });

    expect(await screen.findByText("Court restricted")).toBeInTheDocument();
    expect(screen.queryByText("Court order note")).not.toBeInTheDocument();
    expect(screen.queryByText("Collection requires prior court approval.")).not.toBeInTheDocument();
  });

  it("shows authorised pickups when enabled and hides them when showPickups is false", async () => {
    const { unmount } = renderGuardianList(PERSON.rvMia, { role: "admin", showPickups: true });

    expect(await screen.findByText("Grace Bennett")).toBeInTheDocument();
    expect(screen.getByText("Pickup allowed")).toBeInTheDocument();
    expect(await screen.findByText("Eleanor Bennett")).toBeInTheDocument();
    expect(screen.getByText("Grandparent")).toBeInTheDocument();

    unmount();
    renderGuardianList(PERSON.rvMia, { role: "admin", showPickups: false });

    expect(await screen.findByText("Grace Bennett")).toBeInTheDocument();
    expect(screen.queryByText("Authorised pickups")).not.toBeInTheDocument();
    expect(screen.queryByText("Eleanor Bennett")).not.toBeInTheDocument();
  });

  it("renders a not-allowed pickup badge and empty pickup state cleanly", async () => {
    const rel = mockDb.guardianRelationships.find(
      (row) => row.id === GUARDIAN_RELATIONSHIP.rvOliver,
    );
    if (!rel) throw new Error("Missing relationship fixture");
    rel.pickupRight = "not_allowed";
    rel.courtOrderNote = null;

    renderGuardianList(PERSON.rvOliver, { role: "admin", showPickups: true });

    expect(await screen.findByText("Pickup not allowed")).toBeInTheDocument();
    expect(await screen.findByText("No authorised pickups recorded.")).toBeInTheDocument();
  });
});
