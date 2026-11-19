import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("LocaleTab", () => {
  it("updates live format preview immediately when currency or time zone changes and saves", async () => {
    renderApp("/setup", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    await screen.findByRole("heading", { level: 1, name: "Institution setup" });
    const tab = screen.getByRole("tab", { name: "Locale & formats" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);

    expect(await screen.findByTestId("preview-money")).toHaveTextContent("£1,234.56");
    const initialDate = screen.getByTestId("preview-date").textContent;

    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "EUR" } });
    await waitFor(() => expect(screen.getByTestId("preview-money")).toHaveTextContent("€1,234.56"));

    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "Asia/Kolkata" } });
    await waitFor(() =>
      expect(screen.getByTestId("preview-date").textContent).not.toBe(initialDate),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Locale settings saved.")).toBeInTheDocument();
  });
});
