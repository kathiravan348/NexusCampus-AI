import { createNexusQueryClient } from "@nexus/services";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";

/** Renders one vault tab inside the app providers, signed in as the tenant's admin (owner), in English (test/setup). */
export function renderAsOwner(tenantId: string, ui: ReactElement) {
  signInAs(persona(tenantId, "admin"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </AppProviders>,
  );
}
