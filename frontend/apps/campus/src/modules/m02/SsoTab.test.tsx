import { TENANT } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openSso() {
  renderApp("/access", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Single sign-on" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  return screen.findByDisplayValue("Riverside staff and pupils");
}

describe("SsoTab", () => {
  it("rejects an http:// issuer inline and never shows a secret field", async () => {
    await openSso();
    expect(screen.queryByLabelText(/secret/i)).not.toBeInTheDocument();
    expect(screen.getByText(/client secret is never shown/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Issuer URL/), {
      target: { value: "http://idp.example.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The issuer URL must start with https://")).toBeInTheDocument();
  });

  it("saves a valid change", async () => {
    const name = await openSso();
    fireEvent.change(name, { target: { value: "Riverside SSO" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Single sign-on settings saved.")).toBeInTheDocument();
  });
});
