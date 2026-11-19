import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { HistoryPanel } from "./HistoryPanel";

function renderHistory(
  props: {
    messageKey: "term.learner" | "common.save";
    locale: string;
    lockedByGroup?: boolean;
    online?: boolean;
    onRolledBack?: (override: unknown) => void;
  },
  as = persona(TENANT.riverside, "admin"),
) {
  signInAs(as);
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <HistoryPanel
          messageKey={props.messageKey}
          locale={props.locale}
          lockedByGroup={props.lockedByGroup ?? false}
          online={props.online ?? true}
          onRolledBack={props.onRolledBack}
        />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("HistoryPanel", () => {
  it("lists revisions newest first and disables rollback when locked by group", async () => {
    renderHistory(
      { messageKey: "term.learner", locale: "en-GB", lockedByGroup: true },
      persona(TENANT.riverside, "admin"),
    );
    expect(await screen.findByText("Version 2")).toBeInTheDocument();
    expect(screen.getByText("Version 1")).toBeInTheDocument();
    expect(screen.getByText("Pupil")).toBeInTheDocument();
    expect(screen.getByText("Scholar")).toBeInTheDocument();
    const rollbackBtn = screen.getByRole("button", { name: "Roll back" });
    expect(rollbackBtn).toBeDisabled();
  });

  it("rolls back an institution override to an earlier revision", async () => {
    const nb = persona(TENANT.northbridge, "admin");
    await fetch("http://localhost/api/v1/texts/overrides/term.learner?locale=en-US", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Nexus-Tenant": nb.tenantId,
        "X-Nexus-User": nb.userId,
      },
      body: JSON.stringify({ message: "Scholar" }),
    });
    await fetch("http://localhost/api/v1/texts/overrides/term.learner?locale=en-US", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Nexus-Tenant": nb.tenantId,
        "X-Nexus-User": nb.userId,
      },
      body: JSON.stringify({ message: "Fellow" }),
    });

    const onRolledBack = vi.fn();
    renderHistory({ messageKey: "term.learner", locale: "en-US", onRolledBack }, nb);
    expect(await screen.findByText("Version 2")).toBeInTheDocument();
    const rollbackBtn = screen.getByRole("button", { name: "Roll back" });
    expect(rollbackBtn).toBeEnabled();

    fireEvent.click(rollbackBtn);
    expect(await screen.findByText("Rolled back to version 1.")).toBeInTheDocument();
    await waitFor(() => expect(onRolledBack).toHaveBeenCalled());
    expect(await screen.findByText("Version 3")).toBeInTheDocument();
  });
});
