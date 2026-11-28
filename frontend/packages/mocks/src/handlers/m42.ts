import {
  DegreeAuditSchema,
  ElectiveRegistrationSchema,
  PathAdviceSchema,
  ProgramRequirementSchema,
  RegistrationWindowSchema,
  ThesisSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, param, type RouteContext } from "./route";

const REGISTRATION = { module: "M42", permission: "m42.registration.read" } as const;
const AUDIT = { module: "M42", permission: "m42.audit.read" } as const;

function forLearner<T extends { tenantId: string; learnerId: string }>(
  ctx: RouteContext,
  collection: readonly T[],
): T[] {
  const { tenantId } = ctx.viewer;
  const learnerId = param(ctx.url, "learnerId");
  if (learnerId !== null) {
    found(ofTenant(mockDb.learners, tenantId).find((row) => row.id === learnerId));
  }
  return ofTenant(collection, tenantId).filter(
    (row) => learnerId === null || row.learnerId === learnerId,
  );
}

export const m42Handlers = [
  get("/program-requirements", REGISTRATION, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.programRequirements, ctx.viewer.tenantId),
      pageSchema(ProgramRequirementSchema),
    ),
  ),
  get("/registration-windows", REGISTRATION, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.registrationWindows, ctx.viewer.tenantId),
      pageSchema(RegistrationWindowSchema),
    ),
  ),
  get("/elective-registrations", REGISTRATION, (ctx) => {
    const windowId = param(ctx.url, "windowId");
    if (windowId !== null) {
      found(
        ofTenant(mockDb.registrationWindows, ctx.viewer.tenantId).find(
          (row) => row.id === windowId,
        ),
      );
    }
    const rows = forLearner(ctx, mockDb.electiveRegistrations).filter(
      (row) => windowId === null || row.windowId === windowId,
    );
    return list(ctx, rows, pageSchema(ElectiveRegistrationSchema));
  }),
  get("/degree-audits", AUDIT, (ctx) =>
    list(ctx, forLearner(ctx, mockDb.degreeAudits), pageSchema(DegreeAuditSchema)),
  ),
  get("/theses", AUDIT, (ctx) =>
    list(ctx, forLearner(ctx, mockDb.theses), pageSchema(ThesisSchema)),
  ),
  get("/path-advice", AUDIT, (ctx) => {
    const canDecide = ctx.viewer.permissions.has("m42.registration.decide");
    const rows = forLearner(ctx, mockDb.pathAdvice).filter(
      (row) => canDecide || row.status === "reviewed",
    );
    return list(ctx, rows, pageSchema(PathAdviceSchema));
  }),
];
