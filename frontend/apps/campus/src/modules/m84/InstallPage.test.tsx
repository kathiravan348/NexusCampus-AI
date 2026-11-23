import { TENANT } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("InstallPage (M84)", () => {
  it("shows licence use, the update, backups and the bundle waiting for review", async () => {
    renderApp("/install", { as: persona(TENANT.apex, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Install & updates" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,284 of 1,500")).toBeInTheDocument();
    expect(await screen.findByText("Version 2.4.2")).toBeInTheDocument();
    expect(screen.getByText("Security fix")).toBeInTheDocument();
    expect(await screen.findAllByText(/Encrypted backup of/)).toHaveLength(2);
    expect(await screen.findByText("Waiting for your review")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is sent until an admin approves it/)).toBeInTheDocument();
  });

  it("is not in the menu of a tenant without an install", async () => {
    renderApp("/install", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    expect(await screen.findByText("Not in your plan")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Install & updates" })).not.toBeInTheDocument();
  });

  async function openReview() {
    renderApp("/install", { as: persona(TENANT.apex, "admin"), modules: MODULES });
    fireEvent.click(await screen.findByRole("button", { name: "Review bundle dgn-0914" }));
    const dialog = await screen.findByRole("dialog", { name: "Review support diagnostics" });
    const text = await within(dialog).findByRole("textbox", { name: "Bundle content" });
    expect(text).toHaveAttribute("readonly");
    expect((text as HTMLTextAreaElement).value).toContain("nexus-diagnostics/1");
    return dialog;
  }

  it("shows exactly what a waiting bundle sends, then approves it", async () => {
    const dialog = await openReview();
    expect(within(dialog).getByText(/Nothing leaves your install until you approve/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve sending" }));
    expect(await screen.findByText("Bundle approved for sending")).toBeInTheDocument();
    expect(await screen.findByText("Approved")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Review bundle/ })).not.toBeInTheDocument();
  });

  it("discards a bundle only after the second question", async () => {
    const dialog = await openReview();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(within(dialog).getByText("Discard this bundle? It will never be sent.")).toBeVisible();
    expect(
      within(dialog).queryByRole("button", { name: "Approve sending" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, discard" }));
    expect(await screen.findByText("Bundle discarded")).toBeInTheDocument();
    expect(await screen.findByText("Discarded")).toBeInTheDocument();
  });

  it("keeps the dialog open with a clear message when someone reviewed the bundle first (409)", async () => {
    server.use(
      http.post("*/api/v1/install/diagnostics/:id/approve", () =>
        HttpResponse.json(
          { error: { code: "conflict", message: "Already reviewed." } },
          { status: 409 },
        ),
      ),
    );
    const dialog = await openReview();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve sending" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Someone has already reviewed this bundle. Close this and check the list.",
    );
    expect(screen.getByRole("dialog", { name: "Review support diagnostics" })).toBeInTheDocument();
  });
});
