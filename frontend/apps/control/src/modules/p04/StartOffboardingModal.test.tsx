import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ControlProviders } from "../../App";
import { StartOffboardingModal } from "./StartOffboardingModal";

const VALID_PEM = `-----BEGIN PUBLIC KEY-----\n${"MIIBojANBgkqhkiG9w0BAQEFAAOCAY8A".repeat(4)}\n-----END PUBLIC KEY-----`;

function renderModal(onClose = vi.fn()) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, STAFF.implementation);
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <StartOffboardingModal onClose={onClose} />
    </ControlProviders>,
  );
  return { onClose };
}

describe("StartOffboardingModal", () => {
  it("requires an account, tenant, pasted PEM and freeze confirmation before starting", async () => {
    const { onClose } = renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Start offboarding" });
    const account = within(dialog).getByRole("combobox", { name: "Account" });
    await within(account).findByRole("option", { name: "Little Steps" });

    const submit = within(dialog).getByRole("button", { name: "Start offboarding" });
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Institution public key (PEM)"), {
      target: { value: VALID_PEM },
    });
    expect(submit).toBeDisabled();

    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "The institution's data will be frozen" }),
    );
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByText("Offboarding started")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the error state when the backend rejects a malformed PEM", async () => {
    const { onClose } = renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Start offboarding" });
    const account = within(dialog).getByRole("combobox", { name: "Account" });
    await within(account).findByRole("option", { name: "Little Steps" });

    fireEvent.change(within(dialog).getByLabelText("Institution public key (PEM)"), {
      target: { value: "not-a-valid-pem-header-".repeat(5) },
    });
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "The institution's data will be frozen" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Start offboarding" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Offboarding did not start. Check the public key and try again.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the busy message on 409 when the tenant already has an open move or offboarding", async () => {
    const { onClose } = renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Start offboarding" });
    const account = within(dialog).getByRole("combobox", { name: "Account" });
    await within(account).findByRole("option", { name: "Riverside Education Group" });
    // Riverside (ten-rv) already has mov-rv running in demo fixtures.
    fireEvent.change(account, { target: { value: "acc-rv" } });
    fireEvent.change(within(dialog).getByLabelText("Institution public key (PEM)"), {
      target: { value: VALID_PEM },
    });
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "The institution's data will be frozen" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Start offboarding" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This tenant already has an offboarding or move in progress.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
