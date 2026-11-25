import { resolveMessages } from "@nexus/i18n";
import { PUBLIC_ENQUIRY_FORM, TENANT, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { localeName } from "../app/LocaleSwitch";
import { MODULES } from "../app/modules";
import { persona, renderApp } from "../test/renderApp";
import { PUBLIC_LOCALE_KEY_PREFIX } from "./PublicEnquiry";

const RIVERSIDE = PUBLIC_ENQUIRY_FORM.riversideSchool;
const APEX = PUBLIC_ENQUIRY_FORM.apex;
const LITTLE_STEPS = PUBLIC_ENQUIRY_FORM.littleSteps;
const HI_THANKS = "आपकी पूछताछ के लिए धन्यवाद";
const HI_NOT_FOUND = "पूछताछ फ़ॉर्म नहीं मिला";

function fill(label: string | RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("PublicEnquiry", () => {
  it("opens Riverside in Hindi by default, sends an enquiry and lists it for admin", async () => {
    const publicView = renderApp(`/apply/${RIVERSIDE}`, { modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Riverside School" }),
    ).toBeVisible();
    expect(screen.getByText("प्रवेश पूछताछ")).toBeVisible();
    expect(document.documentElement.lang).toBe("hi-IN");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem(`${PUBLIC_LOCALE_KEY_PREFIX}${RIVERSIDE}`)).toBeNull();
    expect(screen.getByRole("note")).toBeVisible();

    fill(/विद्यार्थी का नाम/, "Anya Public");
    fill(/संपर्क व्यक्ति का नाम/, "Claire Public");
    fill("संपर्क फ़ोन", "+44 7700-900456");
    fireEvent.click(screen.getByRole("checkbox", { name: /Riverside School/ }));
    fireEvent.click(screen.getByRole("button", { name: "पूछताछ भेजें" }));

    expect(await screen.findByRole("heading", { level: 2, name: HI_THANKS })).toBeVisible();
    expect(screen.queryByText("Anya Public")).toBeNull();
    expect(screen.queryByText("+447700900456")).toBeNull();

    const stored = mockDb.enquiries.find(
      (row) => row.tenantId === TENANT.riverside && row.learnerName === "Anya Public",
    );
    expect(stored).toMatchObject({
      contactName: "Claire Public",
      contactPhone: "+447700900456",
      status: "new",
      source: "public_form",
      assignedStaffProfileId: null,
    });

    publicView.unmount();

    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const toggle = await screen.findByRole("button", { name: "Anya Public" });
    const item = within(toggle.closest("li")!);
    expect(item.getByText("New")).toBeVisible();
    expect(item.getByText("Public form")).toBeVisible();
  });

  it("opens Apex in Tamil by default with a Language select", async () => {
    renderApp(`/apply/${APEX}`, { modules: MODULES });
    expect(await screen.findByRole("heading", { level: 1, name: "Apex Coaching" })).toBeVisible();
    expect(screen.getByText("சேர்க்கை விசாரணை")).toBeVisible();
    expect(screen.getByRole("button", { name: "விசாரணையை அனுப்பு" })).toBeVisible();
    expect(document.documentElement.lang).toBe("ta-IN");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem(`${PUBLIC_LOCALE_KEY_PREFIX}${APEX}`)).toBeNull();

    const select = screen.getByLabelText("மொழி") as HTMLSelectElement;
    expect(select.value).toBe("ta-IN");
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["ta-IN", "en-IN"]);
    expect(Array.from(select.options).map((o) => o.text)).toEqual([
      localeName("ta-IN", "ta-IN"),
      localeName("en-IN", "ta-IN"),
    ]);
  });

  it("switches language without losing typed values and keeps the choice on reload", async () => {
    const first = renderApp(`/apply/${RIVERSIDE}`, { modules: MODULES });
    expect(await screen.findByRole("button", { name: "पूछताछ भेजें" })).toBeVisible();

    fill(/विद्यार्थी का नाम/, "Anya Switch");
    fill(/संपर्क व्यक्ति का नाम/, "Claire Switch");
    fill("संपर्क फ़ोन", "+44 7700 900111");

    fireEvent.change(screen.getByLabelText("भाषा"), { target: { value: "en-GB" } });
    expect(await screen.findByRole("button", { name: "Send enquiry" })).toBeVisible();
    expect(document.documentElement.lang).toBe("en-GB");
    expect(screen.getByLabelText(/Learner name/)).toHaveValue("Anya Switch");
    expect(screen.getByLabelText(/Contact name/)).toHaveValue("Claire Switch");
    expect(screen.getByLabelText("Contact phone")).toHaveValue("+44 7700 900111");
    expect(localStorage.getItem(`${PUBLIC_LOCALE_KEY_PREFIX}${RIVERSIDE}`)).toBe("en-GB");

    first.unmount();

    renderApp(`/apply/${RIVERSIDE}`, { modules: MODULES });
    expect(await screen.findByRole("button", { name: "Send enquiry" })).toBeVisible();
    expect(document.documentElement.lang).toBe("en-GB");
    const select = screen.getByLabelText("Language") as HTMLSelectElement;
    expect(select.value).toBe("en-GB");

    fireEvent.change(select, { target: { value: "hi-IN" } });
    expect(await screen.findByRole("button", { name: "पूछताछ भेजें" })).toBeVisible();
    expect(localStorage.getItem(`${PUBLIC_LOCALE_KEY_PREFIX}${RIVERSIDE}`)).toBe("hi-IN");
  });

  it("falls back to the institution default when a saved locale is unsupported", async () => {
    localStorage.setItem(`${PUBLIC_LOCALE_KEY_PREFIX}${RIVERSIDE}`, "ta-IN");
    renderApp(`/apply/${RIVERSIDE}`, { modules: MODULES });
    expect(await screen.findByRole("button", { name: "पूछताछ भेजें" })).toBeVisible();
    expect(document.documentElement.lang).toBe("hi-IN");
    expect(localStorage.getItem(`${PUBLIC_LOCALE_KEY_PREFIX}${RIVERSIDE}`)).toBe("ta-IN");
  });

  it("uses the browser language before the form loads and English when unsupported", async () => {
    const langs = vi.spyOn(navigator, "languages", "get").mockReturnValue(["hi-IN", "en-US"]);
    try {
      const hindiView = renderApp("/apply/pef-does-not-exist", { modules: MODULES });
      expect(await screen.findByRole("heading", { name: HI_NOT_FOUND })).toBeVisible();
      expect(document.documentElement.lang).toBe("hi-IN");
      expect(localStorage.getItem(`${PUBLIC_LOCALE_KEY_PREFIX}pef-does-not-exist`)).toBeNull();
      hindiView.unmount();

      langs.mockReturnValue(["fr-FR"]);
      renderApp("/apply/pef-does-not-exist", { modules: MODULES });
      expect(await screen.findByRole("heading", { name: "Enquiry form not found" })).toBeVisible();
      expect(document.documentElement.lang).toBe("en");
      expect(screen.queryByRole("button", { name: "Send enquiry" })).toBeNull();
      expect(localStorage.getItem(`${PUBLIC_LOCALE_KEY_PREFIX}pef-does-not-exist`)).toBeNull();
    } finally {
      langs.mockRestore();
    }
  });

  it("validates required names, contact method, formatted phone and consent", async () => {
    renderApp(`/apply/${LITTLE_STEPS}`, { modules: MODULES });
    expect(await screen.findByRole("heading", { level: 1, name: "Little Steps" })).toBeVisible();
    expect(screen.queryByLabelText("Language")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(await screen.findByText("Enter a phone number or an email address.")).toBeVisible();
    expect(screen.getByText("Confirm that you consent to be contacted.")).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Learner name/), { target: { value: "Demo learner" } });
    fireEvent.change(screen.getByLabelText(/Contact name/), { target: { value: "Demo contact" } });
    fireEvent.change(screen.getByLabelText("Contact phone"), {
      target: { value: "+91 98765 0000x" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /I consent to Little Steps/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(
      await screen.findByText(
        "Enter the number with its country code, for example +91 98765 43210.",
      ),
    ).toBeVisible();
  });

  it("shows Needs a connection and disables Send enquiry when offline", async () => {
    const connection = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      renderApp(`/apply/${LITTLE_STEPS}`, { modules: MODULES });
      const submit = await screen.findByRole("button", { name: "Send enquiry" });
      expect(submit).toBeEnabled();

      connection.mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });

      expect(screen.getByText("Needs a connection")).toBeVisible();
      expect(submit).toBeDisabled();
    } finally {
      connection.mockRestore();
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
    }
  });

  it("drops submissions silently when the hidden honeypot is filled", async () => {
    const before = mockDb.enquiries.length;
    renderApp(`/apply/${LITTLE_STEPS}`, { modules: MODULES });
    expect(await screen.findByRole("heading", { level: 1, name: "Little Steps" })).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Learner name/), { target: { value: "Bot Learner" } });
    fireEvent.change(screen.getByLabelText(/Contact name/), { target: { value: "Bot Contact" } });
    fireEvent.change(screen.getByLabelText("Contact email"), {
      target: { value: "bot@example.test" },
    });
    fireEvent.change(document.getElementById("m12-public-website")!, {
      target: { value: "https://spam.example" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /I consent to Little Steps/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Thank you for your enquiry" }),
    ).toBeVisible();
    expect(mockDb.enquiries).toHaveLength(before);
  });

  it("provides Hindi and Tamil translations for public enquiry messages (D42)", () => {
    const hi = resolveMessages({ locale: "hi-IN" });
    const ta = resolveMessages({ locale: "ta-IN" });
    for (const key of [
      "m04.localeSwitch.label",
      "m12.public.title",
      "m12.public.submit",
      "m12.public.consent",
      "m12.public.copyLink",
      "m12.public.notFoundTitle",
    ] as const) {
      expect(hi[key]).toMatch(/[ऀ-ॿ]/);
      expect(ta[key]).toMatch(/[஀-௿]/);
    }
  });
});
