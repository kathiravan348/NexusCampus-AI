import {
  CredentialTemplateSchema,
  CredentialVerificationSchema,
  IssuedCredentialSchema,
  pageSchema,
  type IssuedCredential,
} from "@nexus/contracts";
import { ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, getPublic, list, ok } from "./route";

const READ = { module: "M45", permission: "m45.credential.read" } as const;
const templatePage = pageSchema(CredentialTemplateSchema);
const credentialPage = pageSchema(IssuedCredentialSchema);

function visibleCredentials(viewer: Viewer): IssuedCredential[] {
  const { tenantId, personId } = viewer;
  const rows = ofTenant(mockDb.issuedCredentials, tenantId);
  if (viewer.permissions.has("m45.credential.issue")) return rows;

  const learners = ofTenant(mockDb.learners, tenantId);
  const ownLearners = new Set(
    learners.filter((learner) => learner.personId === personId).map((learner) => learner.id),
  );
  const linkedPeople = new Set(
    ofTenant(mockDb.guardianLinks, tenantId)
      .filter((link) => link.guardianPersonId === personId)
      .map((link) => link.learnerPersonId),
  );
  const linkedMinors = new Set(
    ofTenant(mockDb.people, tenantId)
      .filter((person) => person.isMinor && linkedPeople.has(person.id))
      .map((person) => person.id),
  );
  const children = new Set(
    learners.filter((learner) => linkedMinors.has(learner.personId)).map((learner) => learner.id),
  );

  return rows.filter(
    (row) =>
      ownLearners.has(row.learnerId) ||
      (children.has(row.learnerId) && !mockDb.hiddenCredentialIds.includes(row.id)),
  );
}

function verificationCode(url: URL): string {
  const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export const m45Handlers = [
  get("/credential-templates", READ, (ctx) =>
    list(ctx, ofTenant(mockDb.credentialTemplates, ctx.viewer.tenantId), templatePage),
  ),
  get("/issued-credentials", READ, (ctx) =>
    list(ctx, visibleCredentials(ctx.viewer), credentialPage),
  ),
  get("/issued-credentials/:id", READ, (ctx) =>
    ok(
      IssuedCredentialSchema,
      found(visibleCredentials(ctx.viewer).find((row) => row.id === ctx.params["id"])),
    ),
  ),
  getPublic("/credential-verifications/:code", ({ url }) => {
    const code = verificationCode(url);
    const row = mockDb.credentialVerifications.find(
      (verification) => verification.verificationCode === code,
    );
    return ok(
      CredentialVerificationSchema,
      row ?? {
        verificationCode: code.slice(0, 64) || "UNKNOWN",
        result: "not_found",
        kind: null,
        credentialName: null,
        institutionName: null,
        issuedOn: null,
        expiresOn: null,
      },
    );
  }),
];
