import { useText } from "@nexus/i18n";
import { TENANT } from "@nexus/mocks";
import { TENANT_THEME_STYLE_ID } from "@nexus/ui-core";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Globe } from "lucide-react";
import { describe, expect, it } from "vitest";
import { LOCALE_STORAGE_KEY, useRuntime } from "./TenantRuntime";
import { withInstitutionLocale, persona, renderApp } from "../test/renderApp";

function Probe() {
  const t = useText();
  const { locale, setLocale } = useRuntime();
  return (
    <div>
      <p data-testid="learner">{t("term.learner")}</p>
      <p data-testid="class">{t("term.class")}</p>
      <p data-testid="locale">{locale}</p>
      <button type="button" onClick={() => setLocale("en-XA")}>
        pick-pseudo
      </button>
    </div>
  );
}

describe("TenantRuntime", () => {
  it("applies tenant theme and removes it on sign-out", async () => {
    renderApp("/", { as: persona(TENANT.riverside, "admin") });
    await waitFor(() =>
      expect(document.getElementById(TENANT_THEME_STYLE_ID)?.textContent).toContain(
        "--brand-primary: #1D4ED8",
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await screen.findByRole("heading", { level: 1, name: "Sign in to a demo institution" });
    await waitFor(() => expect(document.getElementById(TENANT_THEME_STYLE_ID)).toBeNull());
  });

  it("applies group and campus text overrides for Riverside North teacher", async () => {
    renderApp("/probe", {
      as: persona(TENANT.riverside, "teacher"),
      modules: [
        {
          moduleId: "M01",
          path: "probe",
          navKey: "common.details",
          summaryKey: "common.details",
          icon: Globe,
          permission: null,
          offlineLevel: "L1",
          load: () => Promise.resolve({ default: Probe }),
        },
      ],
    });
    expect(await screen.findByTestId("learner")).toHaveTextContent("Pupil");
    expect(screen.getByTestId("class")).toHaveTextContent("Form");
  });

  it("applies Tamil institution text override for Apex", async () => {
    withInstitutionLocale(TENANT.apex);
    renderApp("/probe", {
      as: persona(TENANT.apex, "admin"),
      modules: [
        {
          moduleId: "M01",
          path: "probe",
          navKey: "common.details",
          summaryKey: "common.details",
          icon: Globe,
          permission: null,
          offlineLevel: "L1",
          load: () => Promise.resolve({ default: Probe }),
        },
      ],
    });
    expect(await screen.findByTestId("learner")).toHaveTextContent("பயிற்சியாளர்");
  });

  it("scopes locale picks per tenant so another tenant keeps its default locale", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.littleSteps]: "en-GB" }));
    renderApp("/probe", {
      as: persona(TENANT.apex, "admin"),
      modules: [
        {
          moduleId: "M01",
          path: "probe",
          navKey: "common.details",
          summaryKey: "common.details",
          icon: Globe,
          permission: null,
          offlineLevel: "L1",
          load: () => Promise.resolve({ default: Probe }),
        },
      ],
    });
    expect(await screen.findByTestId("locale")).toHaveTextContent("ta-IN");
    fireEvent.click(screen.getByRole("button", { name: "pick-pseudo" }));
    expect(await screen.findByTestId("locale")).toHaveTextContent("en-XA");
  });
});
