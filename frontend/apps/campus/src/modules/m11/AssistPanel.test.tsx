import { PERSON, TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openPanel(role = "admin", tenant = TENANT.riverside) {
  renderApp("/", { as: persona(tenant, role), modules: MODULES });
  fireEvent.click(await screen.findByRole("button", { name: "Open Nexus Assist" }));
  return screen.findByRole("dialog", { name: "Nexus Assist" });
}

const credit = (tenant: string) => mockDb.aiCredits.find((c) => c.tenantId === tenant)!;

describe("AssistPanel", () => {
  it("answers with the AI label, numbered sources and a credit charge", async () => {
    const before = credit(TENANT.riverside).used;
    const dialog = await openPanel();
    fireEvent.change(within(dialog).getByLabelText("Your question"), {
      target: { value: "When does the autumn term end?" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask" }));

    const answers = within(dialog).getByRole("list", { name: "Answers" });
    expect(await within(answers).findByText("AI-generated")).toBeInTheDocument();
    expect(within(answers).getByText(/18 December 2026/)).toBeInTheDocument();
    expect(
      within(answers).getByRole("link", { name: "Riverside School calendar 2026–27" }),
    ).toBeInTheDocument();
    expect(within(answers).getByText(/1 credit used/)).toBeInTheDocument();
    expect(credit(TENANT.riverside).used).toBe(before + 1);
  });

  it("explains when nothing matches", async () => {
    const dialog = await openPanel();
    fireEvent.change(within(dialog).getByLabelText("Your question"), {
      target: { value: "Favourite colour?" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask" }));
    expect(await within(dialog).findByText(/no credits were used/)).toBeInTheDocument();
  });

  it("shows the AI-off reason when the institution switched AI off", async () => {
    Object.assign(
      mockDb.aiSettings.find((s) => s.tenantId === TENANT.riverside)!,
      { enabled: false },
    );
    const dialog = await openPanel();
    expect(await within(dialog).findByText("Nexus Assist is switched off")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Your question")).not.toBeInTheDocument();
  });

  it("shows the credits reason when credits run out", async () => {
    const c = credit(TENANT.riverside);
    Object.assign(c, { used: c.granted });
    const dialog = await openPanel();
    fireEvent.change(within(dialog).getByLabelText("Your question"), { target: { value: "term" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask" }));
    expect(await within(dialog).findByText("AI credits have run out")).toBeInTheDocument();
  });

  it("shows the consent reason to a minor learner without guardian consent", async () => {
    const consent = mockDb.consents.find(
      (c) => c.personId === PERSON.rvOliver && c.purpose === "ai_features",
    )!;
    mockDb.consents.splice(mockDb.consents.indexOf(consent), 1);
    const dialog = await openPanel("learner");
    fireEvent.change(within(dialog).getByLabelText("Your question"), { target: { value: "term" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask" }));
    await waitFor(() =>
      expect(within(dialog).getByText("A guardian's consent is needed")).toBeInTheDocument(),
    );
  });
});
