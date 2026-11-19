import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { persona, renderApp } from "../test/renderApp";

describe("LocaleSwitch", () => {
  it("switches Apex between Arabic RTL, English LTR and pseudo-locale", async () => {
    renderApp("/", { as: persona(TENANT.apex, "admin") });
    const picker = await screen.findByLabelText("اللغة");
    expect(document.documentElement.dir).toBe("rtl");

    const options = Array.from(picker.querySelectorAll("option")).map((o) => o.value);
    expect(options).toContain("ar-AE");
    expect(options).toContain("en-XA");

    const english = options.find((v) => v === "en" || (v.startsWith("en-") && v !== "en-XA"));
    expect(english).toBeDefined();

    fireEvent.change(picker, { target: { value: english! } });
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
    expect(await screen.findByLabelText("Language")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "en-XA" } });
    await waitFor(() => expect(document.documentElement.lang).toBe("en-XA"));
    expect(await screen.findByRole("heading", { level: 1, name: /^⟦/ })).toBeInTheDocument();
  });
});
