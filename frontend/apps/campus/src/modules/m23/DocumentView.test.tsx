import { IssuedDocumentReadSchema, pageSchema } from "@nexus/contracts";
import { LEARNER, TENANT, mockDb } from "@nexus/mocks";
import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("shows details and signatures to read-only staff without a revoke button", async () => {
  const doc = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.riverside)!;
  const sig = doc.signatures[0]!;
  doc.signatures = [
    { ...sig, method: "drawn" },
    { ...sig, method: "digital_certificate" },
    { ...sig, method: "otp" },
  ];
  const teacher = persona(TENANT.riverside, "teacher");
  mockDb.roles.find((row) => row.id === teacher.roleId)!.permissions.push("m23.documents.read");

  renderApp(`/documents?document=${doc.id}`, { as: teacher, modules: MODULES });
  const view = within(await screen.findByRole("article"));
  expect(view.getByText("Transfer certificate")).toBeVisible();
  expect(view.getByText(doc.number)).toBeVisible();
  expect(view.getByText(doc.verificationCode)).toBeVisible();
  expect(view.getByText("Signatures").nextElementSibling).toHaveTextContent(/^3/);
  expect(view.getByText("Drawn signature")).toBeVisible();
  expect(view.getByText("Digital certificate")).toBeVisible();
  expect(view.getByText("One-time passcode")).toBeVisible();
  expect(view.queryByRole("button", { name: "Revoke" })).toBeNull();

  const response = await fetch(`http://localhost/api/v1/issued-documents/${doc.id}/revoke`, {
    method: "POST",
    headers: {
      "X-Nexus-Tenant": teacher.tenantId,
      "X-Nexus-User": teacher.userId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Unauthorized attempt" }),
  });
  expect(response.status).toBe(403);
});

it("shows the revocation reason to read-only staff on a revoked document", async () => {
  const doc = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.riverside)!;
  doc.revoked = true;
  doc.revokedReason = "Issued in error";
  const teacher = persona(TENANT.riverside, "teacher");
  mockDb.roles.find((row) => row.id === teacher.roleId)!.permissions.push("m23.documents.read");

  renderApp(`/documents?document=${doc.id}`, { as: teacher, modules: MODULES });
  const view = within(await screen.findByRole("article"));
  expect(view.getByText("Revoked")).toBeVisible();
  expect(view.getByText("Revocation reason")).toBeVisible();
  expect(view.getByText("Issued in error")).toBeVisible();
  expect(view.queryByRole("button", { name: "Revoke" })).toBeNull();
});

it("redacts the revocation reason and hides revoke controls for family viewers", async () => {
  const doc = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.littleSteps)!;
  doc.learnerId = LEARNER.lsRohan;
  doc.revoked = true;
  doc.revokedReason = "Internal administrative note";
  const guardian = persona(TENANT.littleSteps, "guardian");

  const response = await fetch("http://localhost/api/v1/issued-documents", {
    headers: { "X-Nexus-Tenant": guardian.tenantId, "X-Nexus-User": guardian.userId },
  });
  expect(response.status).toBe(200);
  const page = pageSchema(IssuedDocumentReadSchema).parse(await response.json());
  const row = page.items.find((item) => item.id === doc.id);
  expect(row?.revoked).toBe(true);
  expect(row?.revokedReason).toBeNull();

  renderApp(`/documents?document=${doc.id}`, { as: guardian, modules: MODULES });
  const view = within(await screen.findByRole("article"));
  expect(view.getByText("Revoked")).toBeVisible();
  expect(view.queryByText("Revocation reason")).toBeNull();
  expect(view.queryByText("Internal administrative note")).toBeNull();
  expect(view.queryByRole("button")).toBeNull();
});
