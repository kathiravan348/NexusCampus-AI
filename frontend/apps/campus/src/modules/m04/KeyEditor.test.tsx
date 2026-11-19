import { explainMessage } from "@nexus/i18n";
import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { KeyEditor } from "./KeyEditor";

function renderEditor(options: {
  key?: "term.learner" | "common.syncPending";
  locale?: string;
  institution?: Record<string, string>;
  group?: Record<string, string>;
  lockedByGroup?: boolean;
  online?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const key = options.key ?? "common.syncPending";
  const locale = options.locale ?? "en-US";
  const explanation = explainMessage(key, {
    locale,
    typePack: "he",
    group: options.group,
    institution: options.institution,
  });
  signInAs(persona(TENANT.northbridge, "admin"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <KeyEditor
          open
          onOpenChange={options.onOpenChange ?? vi.fn()}
          messageKey={key}
          locale={locale}
          localeLabel="English (United States) (en-US)"
          explanation={explanation}
          lockedByGroup={options.lockedByGroup ?? false}
          hasInstitutionOverride={Boolean(options.institution?.[key])}
          online={options.online ?? true}
        />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("KeyEditor", () => {
  it("renders layer breakdown, live ICU preview, and blocks saving invalid ICU", async () => {
    renderEditor({ key: "common.syncPending" });
    expect(await screen.findByText("Resolution layers")).toBeInTheDocument();
    expect(screen.getByTestId("m04-preview-output")).toHaveTextContent("3 changes waiting to sync");

    const textarea = screen.getByLabelText("Institution override");
    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "{count, plural, one {unclosed" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/Invalid ICU message/);
    expect(screen.getByTestId("m04-preview-error")).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();

    fireEvent.change(textarea, {
      target: { value: "{count, plural, one {# edit queued} other {# edits queued}}" },
    });
    expect(screen.getByTestId("m04-preview-output")).toHaveTextContent("3 edits queued");
    expect(saveBtn).toBeEnabled();
  });

  it("renders group-locked keys as read-only", async () => {
    renderEditor({
      key: "term.learner",
      group: { "term.learner": "Pupil" },
      lockedByGroup: true,
    });
    expect(await screen.findByText(/Locked by the group override/)).toBeInTheDocument();
    expect(screen.getByLabelText("Institution override")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove override" })).not.toBeInTheDocument();
  });
});
