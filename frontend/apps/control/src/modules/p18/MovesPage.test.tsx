import { STAFF, controlDb } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

const VALID_PEM = `-----BEGIN PUBLIC KEY-----\n${"MIIBojANBgkqhkiG9w0BAQEFAAOCAY8A".repeat(4)}\n-----END PUBLIC KEY-----`;

function renderAt(staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), { initialEntries: ["/moves"] });
  return render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P18 Moves", () => {
  it("shows each move with direction, regions and its seven steps", async () => {
    renderAt(STAFF.implementation);
    expect(
      await screen.findByRole("heading", { name: "Coastal Institute of Technology" }),
    ).toBeTruthy();
    const done = screen.getByRole("list", { name: "Steps of move mov-ct" });
    expect(within(done).getAllByText("Done")).toHaveLength(7);

    const running = screen.getByRole("list", { name: "Steps of move mov-rv" });
    expect(within(running).getByText("Pre-flight check")).toBeInTheDocument();
    expect(within(running).getAllByText("Running")).toHaveLength(1);
    expect(within(running).getAllByText("Waiting")).toHaveLength(6);
    expect(screen.getByText(/SaaS → self-hosted · Europe \(EU\) · started/)).toBeInTheDocument();
    expect(screen.getByText(/SaaS → self-hosted · India \(IN\) · started/)).toBeInTheDocument();
    expect(screen.getByText(/encrypted with the tenant's own keys/)).toBeInTheDocument();
  });

  it("walks a region move to done through Start move and staff step confirmations", async () => {
    renderAt(STAFF.implementation);
    fireEvent.click(await screen.findByRole("button", { name: "Start move" }));
    const startModal = await screen.findByRole("dialog", { name: "Start a tenant move" });
    expect(
      within(startModal).getByText(/The institution is frozen while the move runs/),
    ).toBeInTheDocument();
    const account = within(startModal).getByRole("combobox", { name: "Account" });
    await within(account).findByRole("option", { name: "Little Steps" });
    fireEvent.change(account, { target: { value: "acc-ls" } });
    fireEvent.change(within(startModal).getByRole("combobox", { name: "Destination region" }), {
      target: { value: "eu" },
    });
    fireEvent.click(within(startModal).getByRole("button", { name: "Start move" }));
    expect(await screen.findByText("Move started")).toBeInTheDocument();

    // Cell steps preflight + export_encrypted finish in demo -> next staff step is Transfer
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Transfer for mov-new-1" }));
    const transferModal = await screen.findByRole("dialog", { name: "Confirm Transfer" });
    fireEvent.click(
      within(transferModal).getByRole("checkbox", {
        name: "The file is in the destination's import folder",
      }),
    );
    fireEvent.click(within(transferModal).getByRole("button", { name: "Confirm step" }));

    // Cell steps import + verify finish in demo -> next staff step is Switch over
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm Switch over for mov-new-1" }),
    );
    const cutoverModal = await screen.findByRole("dialog", { name: "Confirm Switch over" });
    fireEvent.click(
      within(cutoverModal).getByRole("checkbox", {
        name: "I understand switching over cannot be undone",
      }),
    );
    fireEvent.click(within(cutoverModal).getByRole("button", { name: "Confirm step" }));

    const steps = await screen.findByRole("list", { name: "Steps of move mov-new-1" });
    await waitFor(() => expect(within(steps).getAllByText("Done")).toHaveLength(7));
  });

  it("walks a SaaS → self-hosted move to done through preflight, transfer, import and cutover", async () => {
    renderAt(STAFF.implementation);
    fireEvent.click(await screen.findByRole("button", { name: "Start move" }));
    const startModal = await screen.findByRole("dialog", { name: "Start a tenant move" });
    const account = within(startModal).getByRole("combobox", { name: "Account" });
    await within(account).findByRole("option", { name: "Little Steps" });
    fireEvent.change(within(startModal).getByRole("combobox", { name: "Direction" }), {
      target: { value: "saas_to_self_hosted" },
    });
    fireEvent.change(within(startModal).getByRole("combobox", { name: "Account" }), {
      target: { value: "acc-ls" },
    });
    fireEvent.click(within(startModal).getByRole("button", { name: "Start move" }));

    // 1. Confirm Pre-flight check (paste destination PEM)
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm Pre-flight check for mov-new-1" }),
    );
    const preflightModal = await screen.findByRole("dialog", { name: "Confirm Pre-flight check" });
    fireEvent.change(within(preflightModal).getByLabelText("Destination public key (PEM)"), {
      target: { value: VALID_PEM },
    });
    fireEvent.click(within(preflightModal).getByRole("button", { name: "Confirm step" }));

    // 2. Confirm Transfer
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Transfer for mov-new-1" }));
    const transferModal = await screen.findByRole("dialog", { name: "Confirm Transfer" });
    fireEvent.click(
      within(transferModal).getByRole("checkbox", {
        name: "The file is in the destination's import folder",
      }),
    );
    fireEvent.click(within(transferModal).getByRole("button", { name: "Confirm step" }));

    // 3. Confirm Import (row count + two checks)
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Import for mov-new-1" }));
    const importModal = await screen.findByRole("dialog", { name: "Confirm Import" });
    fireEvent.change(within(importModal).getByLabelText("Row count"), {
      target: { value: "81" },
    });
    fireEvent.click(
      within(importModal).getByRole("checkbox", { name: "Activity log hash chain verified" }),
    );
    fireEvent.click(
      within(importModal).getByRole("checkbox", { name: "Signed checkpoint verified" }),
    );
    fireEvent.click(within(importModal).getByRole("button", { name: "Confirm step" }));

    // 4. Confirm Switch over -> shred_source completes in demo
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm Switch over for mov-new-1" }),
    );
    const cutoverModal = await screen.findByRole("dialog", { name: "Confirm Switch over" });
    fireEvent.click(
      within(cutoverModal).getByRole("checkbox", {
        name: "I understand switching over cannot be undone",
      }),
    );
    fireEvent.click(within(cutoverModal).getByRole("button", { name: "Confirm step" }));

    const steps = await screen.findByRole("list", { name: "Steps of move mov-new-1" });
    await waitFor(() => expect(within(steps).getAllByText("Done")).toHaveLength(7));
  });

  it("retries a failed move and hides buttons when the viewer lacks ctl.portability.manage", async () => {
    controlDb.portabilityJobs = controlDb.portabilityJobs.map((j) =>
      j.id === "mov-rv"
        ? {
            ...j,
            status: "failed",
            steps: j.steps.map((s, i) => (i === 0 ? { ...s, status: "failed" as const } : s)),
          }
        : j,
    );
    const view = renderAt(STAFF.implementation);
    const retryBtn = await screen.findByRole("button", { name: "Retry move mov-rv" });
    fireEvent.click(retryBtn);
    expect(await screen.findByText("Move retried")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Retry move mov-rv" })).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Confirm Pre-flight check for mov-rv" }),
    ).toBeInTheDocument();
    view.unmount();

    // Site reliability (lindqvist) can read moves but sees no action buttons
    renderAt(STAFF.lindqvist);
    await screen.findByRole("list", { name: "Steps of move mov-rv" });
    expect(screen.queryByRole("button", { name: "Start move" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry move/ })).not.toBeInTheDocument();
  });

  it("shows the busy message on 409 when the tenant already has an open move or offboarding", async () => {
    renderAt(STAFF.implementation);
    fireEvent.click(await screen.findByRole("button", { name: "Start move" }));
    const startModal = await screen.findByRole("dialog", { name: "Start a tenant move" });
    const account = within(startModal).getByRole("combobox", { name: "Account" });
    await within(account).findByRole("option", { name: "Riverside Education Group" });
    // Riverside (ten-rv) already has mov-rv running in demo fixtures.
    fireEvent.change(account, { target: { value: "acc-rv" } });
    fireEvent.change(within(startModal).getByRole("combobox", { name: "Destination region" }), {
      target: { value: "in" },
    });
    fireEvent.click(within(startModal).getByRole("button", { name: "Start move" }));

    expect(await within(startModal).findByRole("alert")).toHaveTextContent(
      "This tenant already has an offboarding or move in progress.",
    );
  });

  it("is hidden from billing", async () => {
    renderAt(STAFF.billing);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
