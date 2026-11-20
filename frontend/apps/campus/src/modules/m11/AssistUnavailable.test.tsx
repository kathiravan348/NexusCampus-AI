import { I18nProvider } from "@nexus/i18n";
import type { AssistUnavailableReason } from "@nexus/services";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistUnavailable } from "./AssistUnavailable";

const CASES: [AssistUnavailableReason, string, RegExp][] = [
  ["ai_off", "Nexus Assist is switched off", /switch it on in AI settings/],
  ["not_entitled", "Nexus Assist is not in your plan", /adding it to the institution's plan/],
  ["offline", "You are offline", /needs a connection/],
  ["no_credits", "AI credits have run out", /renew at the start of next month/],
  ["minor_consent_missing", "A guardian's consent is needed", /parent or guardian/],
];

describe("AssistUnavailable", () => {
  it.each(CASES)("renders %s with its own text and next step", (reason, title, next) => {
    render(
      <I18nProvider locale="en">
        <AssistUnavailable reason={reason} />
      </I18nProvider>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-reason", reason);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(next)).toBeInTheDocument();
  });
});
