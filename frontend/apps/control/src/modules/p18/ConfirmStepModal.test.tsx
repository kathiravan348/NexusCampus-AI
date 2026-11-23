import type { PortabilityJob, PortabilityStepName, StepStatus } from "@nexus/contracts";
import { STAFF, controlDb } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ControlProviders } from "../../App";
import { ConfirmStepModal } from "./ConfirmStepModal";

const VALID_PEM = `-----BEGIN PUBLIC KEY-----\n${"MIIBojANBgkqhkiG9w0BAQEFAAOCAY8A".repeat(4)}\n-----END PUBLIC KEY-----`;
const STEPS: readonly PortabilityStepName[] = [
  "preflight",
  "export_encrypted",
  "transfer",
  "import",
  "verify",
  "cutover",
  "shred_source",
];

function makeJob(
  direction: PortabilityJob["direction"],
  currentStep: PortabilityStepName,
): PortabilityJob {
  const idx = STEPS.indexOf(currentStep);
  const steps = STEPS.map((name, i) => ({
    name,
    status: (i < idx ? "done" : "pending") as StepStatus,
  }));
  return {
    id: "mov-test",
    accountId: "acc-ls",
    tenantId: "ten-ls",
    direction,
    fromRegion: "in",
    toRegion: direction === "region_move" ? "eu" : "in",
    steps,
    status: idx === 0 ? "pending" : "running",
    encrypted: true,
    createdAt: "2026-10-01T00:00:00Z",
  };
}

function renderStep(job: PortabilityJob, step: PortabilityStepName, onClose = vi.fn()) {
  controlDb.portabilityJobs = [job];
  sessionStorage.setItem(CONTROL_STAFF_KEY, STAFF.implementation);
  const view = render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ConfirmStepModal job={job} step={step} onClose={onClose} />
    </ControlProviders>,
  );
  return { ...view, onClose };
}

describe("ConfirmStepModal", () => {
  it("asks only for the destination PEM on preflight (self-hosted destination)", async () => {
    const { onClose } = renderStep(makeJob("saas_to_self_hosted", "preflight"), "preflight");
    const dialog = await screen.findByRole("dialog", { name: "Confirm Pre-flight check" });
    expect(within(dialog).getByLabelText("Destination public key (PEM)")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Export file name")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Row count")).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Destination public key (PEM)"), {
      target: { value: VALID_PEM },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm step" }));
    expect(await screen.findByText("Move step confirmed")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks only for file name and row count on export_encrypted (self-hosted source)", async () => {
    const { onClose } = renderStep(
      makeJob("self_hosted_to_saas", "export_encrypted"),
      "export_encrypted",
    );
    const dialog = await screen.findByRole("dialog", { name: "Confirm Encrypted export" });
    expect(within(dialog).getByLabelText("Export file name")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Row count")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Destination public key (PEM)")).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Export file name"), {
      target: { value: "export-ls.nxte" },
    });
    fireEvent.change(within(dialog).getByLabelText("Row count"), {
      target: { value: "81" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm step" }));
    expect(await screen.findByText("Move step confirmed")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks only for the import folder tick on transfer", async () => {
    const { onClose } = renderStep(makeJob("region_move", "transfer"), "transfer");
    const dialog = await screen.findByRole("dialog", { name: "Confirm Transfer" });
    const checkbox = within(dialog).getByRole("checkbox", {
      name: "The file is in the destination's import folder",
    });
    expect(within(dialog).queryByLabelText("Row count")).not.toBeInTheDocument();

    fireEvent.click(checkbox);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm step" }));
    expect(await screen.findByText("Move step confirmed")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks only for row count and two verification checks on import (self-hosted destination)", async () => {
    const { onClose } = renderStep(makeJob("saas_to_self_hosted", "import"), "import");
    const dialog = await screen.findByRole("dialog", { name: "Confirm Import" });
    expect(within(dialog).getByLabelText("Row count")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Export file name")).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Row count"), { target: { value: "81" } });
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Activity log hash chain verified" }),
    );
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Signed checkpoint verified" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm step" }));
    expect(await screen.findByText("Move step confirmed")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports a failed check on import: the move stops at Verify", async () => {
    renderStep(makeJob("saas_to_self_hosted", "import"), "import");
    const dialog = await screen.findByRole("dialog", { name: "Confirm Import" });
    fireEvent.change(within(dialog).getByLabelText("Row count"), { target: { value: "81" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Signed checkpoint verified" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm step" }));
    expect(await screen.findByText("Move step confirmed")).toBeInTheDocument();
    const job = controlDb.portabilityJobs.find((j) => j.id === "mov-test")!;
    expect(job.status).toBe("failed");
    expect(job.steps.find((s) => s.name === "verify")?.status).toBe("failed");
  });

  it("asks only for the irreversible warning tick on cutover and source-deleted tick on shred_source", async () => {
    const first = renderStep(makeJob("self_hosted_to_saas", "cutover"), "cutover");
    const cutoverDialog = await screen.findByRole("dialog", { name: "Confirm Switch over" });
    expect(
      within(cutoverDialog).getByText(
        "Switching over points the account to the destination and cannot be undone.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(cutoverDialog).getByRole("checkbox", {
        name: "I understand switching over cannot be undone",
      }),
    );
    fireEvent.click(within(cutoverDialog).getByRole("button", { name: "Confirm step" }));
    expect(await screen.findByText("Move step confirmed")).toBeInTheDocument();
    expect(first.onClose).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderStep(makeJob("self_hosted_to_saas", "shred_source"), "shred_source");
    const shredDialog = await screen.findByRole("dialog", { name: "Confirm Destroy source keys" });
    fireEvent.click(within(shredDialog).getByRole("checkbox", { name: "Source copy deleted" }));
    fireEvent.click(within(shredDialog).getByRole("button", { name: "Confirm step" }));
    expect(await screen.findByText("Move step confirmed")).toBeInTheDocument();
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows and keeps the error state on an out-of-order confirmation", async () => {
    const { onClose } = renderStep(makeJob("region_move", "transfer"), "cutover");
    const dialog = await screen.findByRole("dialog", { name: "Confirm Switch over" });
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "I understand switching over cannot be undone",
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm step" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not confirm the move step. Try again.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
