import { IssuedDocumentSchema, pageSchema } from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { familyLearnerIds, readLearnerFilter } from "./m18";
import { get, list } from "./route";

const M = { module: "M23" } as const;
const READ = "m23.documents.read";

export const m23Handlers = [
  get("/issued-documents", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const learnerId = readLearnerFilter(ctx, family);
    const documents = ofTenant(mockDb.issuedDocuments, viewer.tenantId).filter(
      (row) =>
        (family === null || (row.learnerId !== null && family.has(row.learnerId))) &&
        (learnerId === null || row.learnerId === learnerId),
    );
    return list(ctx, documents, pageSchema(IssuedDocumentSchema));
  }),
];
