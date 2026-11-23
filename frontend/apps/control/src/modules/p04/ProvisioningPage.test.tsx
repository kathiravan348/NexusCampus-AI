import { STAFF, controlDb } from "@nexus/mocks/control";
import { type DataMode } from "@nexus/services";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

const VALID_PEM = `-----BEGIN PUBLIC KEY-----\n${"MIIBojANBgkqhkiG9w0BAQEFAAOCAY8A".repeat(4)}\n-----END PUBLIC KEY-----`;

function renderAt(staffId: string, mode: DataMode = "mock") {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
    initialEntries: ["/provisioning"],
  });
  return render(
    <ControlProviders
      services={{ mode }}
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P04 Provisioning", () => {
  it("shows jobs with their steps, starts a trial tenant and runs its first step", async () => {
    renderAt(STAFF.implementation);
    const steps = await screen.findByRole("list", { name: "Steps of prv-sr" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(5);
    expect(within(steps).getByText("Load starter settings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start trial tenant" }));
    const dialog = await screen.findByRole("dialog", { name: "Start a trial tenant" });
    const account = within(dialog).getByRole("combobox", { name: "Account" });
    await within(account).findByRole("option", { name: "Lotus Coaching Centre" });
    fireEvent.change(account, { target: { value: "acc-lt" } });
    await within(within(dialog).getByRole("combobox", { name: "Plan" })).findByRole("option", {
      name: "Standard",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(await screen.findByText("Provisioning started")).toBeInTheDocument();

    const next = await screen.findByRole("button", { name: "Run the next step of prv-new-1" });
    fireEvent.click(next);
    expect(await screen.findByText(/Tenant ten-new-new-1/)).toBeInTheDocument();
  });

  it("retries a failed provisioning job and hides Run next step in real mode", async () => {
    controlDb.provisioningJobs = controlDb.provisioningJobs.map((j) =>
      j.id === "prv-sr"
        ? {
            ...j,
            status: "failed",
            steps: j.steps.map((s) =>
              s.name === "seed" ? { ...s, status: "failed" as const } : s,
            ),
          }
        : j,
    );
    const view = renderAt(STAFF.implementation);
    const retryBtn = await screen.findByRole("button", { name: "Retry prv-sr" });
    fireEvent.click(retryBtn);
    expect(await screen.findByText("Job retried")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Retry prv-sr" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Run the next step of prv-sr" })).toBeInTheDocument();
    view.unmount();

    // Real mode: Run next step is hidden
    const realFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers).entries()),
          "X-Nexus-Staff": STAFF.implementation,
        },
      })) as typeof fetch;
    sessionStorage.setItem(CONTROL_STAFF_KEY, STAFF.implementation);
    const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
      initialEntries: ["/provisioning"],
    });
    render(
      <ControlProviders
        services={{ mode: "real", fetch: realFetch }}
        createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RouterProvider router={router} />
      </ControlProviders>,
    );
    await screen.findByRole("list", { name: "Steps of prv-sr" });
    expect(screen.queryByRole("button", { name: /Run the next step/ })).not.toBeInTheDocument();
  });

  it("runs a full offboarding by two staff members to a signed certificate and blocks same-person double approval", async () => {
    const firstView = renderAt(STAFF.implementation);
    await screen.findByRole("list", { name: "Steps of prv-sr" });
    const tab = screen.getByRole("tab", { name: "Offboarding" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);

    // Start offboarding for Little Steps
    fireEvent.click(await screen.findByRole("button", { name: "Start offboarding" }));
    const dialog = await screen.findByRole("dialog", { name: "Start offboarding" });
    const account = within(dialog).getByRole("combobox", { name: "Account" });
    await within(account).findByRole("option", { name: "Little Steps" });
    fireEvent.change(account, { target: { value: "acc-ls" } });
    fireEvent.change(within(dialog).getByLabelText("Institution public key (PEM)"), {
      target: { value: VALID_PEM },
    });
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "The institution's data will be frozen" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Start offboarding" }));
    expect(await screen.findByText("Offboarding started")).toBeInTheDocument();

    // Confirm export received (Approve key destruction is not shown yet)
    expect(
      screen.queryByRole("button", { name: /Approve key destruction for off-new-1/ }),
    ).not.toBeInTheDocument();
    const confirmBtn = await screen.findByRole("button", {
      name: "Confirm export received for off-new-1",
    });
    fireEvent.click(confirmBtn);
    expect(await screen.findByText("Export receipt confirmed")).toBeInTheDocument();

    // First staff approval
    const approveBtn = await screen.findByRole("button", {
      name: "Approve key destruction for off-new-1",
    });
    fireEvent.click(approveBtn);
    const confirmModal = await screen.findByRole("dialog", {
      name: "Approve key destruction for Little Steps?",
    });
    fireEvent.click(within(confirmModal).getByRole("button", { name: "Approve key destruction" }));
    expect(
      await screen.findByText("First approval recorded. A second staff member must now approve."),
    ).toBeInTheDocument();

    // Same staff member approves a second time -> 409 message, nothing queued
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve key destruction for off-new-1" }),
    );
    const sameModal = await screen.findByRole("dialog", {
      name: "Approve key destruction for Little Steps?",
    });
    fireEvent.click(within(sameModal).getByRole("button", { name: "Approve key destruction" }));
    expect(await within(sameModal).findByRole("alert")).toHaveTextContent(
      "A second, different staff member must approve key destruction.",
    );
    fireEvent.click(within(sameModal).getByRole("button", { name: "Cancel" }));
    firstView.unmount();

    // Second staff member (admin) approves -> keys destroyed + certificate issued
    renderAt(STAFF.admin);
    await screen.findByRole("list", { name: "Steps of prv-sr" });
    const tab2 = screen.getByRole("tab", { name: "Offboarding" });
    fireEvent.mouseDown(tab2);
    fireEvent.click(tab2);
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve key destruction for off-new-1" }),
    );
    const secondModal = await screen.findByRole("dialog", {
      name: "Approve key destruction for Little Steps?",
    });
    fireEvent.click(within(secondModal).getByRole("button", { name: "Approve key destruction" }));
    expect(
      await screen.findByText("Second approval recorded. Key destruction is now queued."),
    ).toBeInTheDocument();

    const certs = await screen.findAllByRole("region", { name: "Key-destruction certificate" });
    expect(certs).toHaveLength(2);
    expect(screen.getByText(/key-ten-ls-tenant-data/)).toBeInTheDocument();
  });

  it("retries a failed offboarding job", async () => {
    controlDb.offboardingJobs = [
      {
        id: "off-fail",
        accountId: "acc-ls",
        tenantId: "ten-ls",
        steps: [
          { name: "freeze_writes", status: "done" },
          { name: "export_ready", status: "failed" },
          { name: "export_downloaded", status: "pending" },
          { name: "keys_destroyed", status: "pending" },
          { name: "certificate_issued", status: "pending" },
        ],
        status: "failed",
        shredCertificateId: null,
        requestedByStaffId: STAFF.implementation,
        createdAt: "2026-10-01T00:00:00Z",
      },
      ...controlDb.offboardingJobs,
    ];
    renderAt(STAFF.implementation);
    await screen.findByRole("list", { name: "Steps of prv-sr" });
    const tab = screen.getByRole("tab", { name: "Offboarding" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);

    const retryBtn = await screen.findByRole("button", { name: "Retry off-fail" });
    fireEvent.click(retryBtn);
    expect(await screen.findByText("Job retried")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Retry off-fail" })).not.toBeInTheDocument(),
    );
  });

  it("lets site reliability read jobs without changing them", async () => {
    renderAt(STAFF.lindqvist);
    await screen.findByRole("list", { name: "Steps of prv-sr" });
    expect(screen.queryByRole("button", { name: "Start trial tenant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run the next step/ })).not.toBeInTheDocument();
    const tab = screen.getByRole("tab", { name: "Offboarding" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    await screen.findByRole("region", { name: "Key-destruction certificate" });
    expect(screen.queryByRole("button", { name: "Start offboarding" })).not.toBeInTheDocument();
  });
});
