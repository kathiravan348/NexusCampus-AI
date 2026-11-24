import { ReportCardSchema, pageSchema } from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { familyLearnerIds, readLearnerFilter } from "./m18";
import { get, list } from "./route";

const M = { module: "M22" } as const;
const READ = "m22.reports.read";

export const m22Handlers = [
  get("/report-cards", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const learnerId = readLearnerFilter(ctx, family);
    const cards = ofTenant(mockDb.reportCards, viewer.tenantId).filter(
      (row) =>
        (family === null || (family.has(row.learnerId) && row.status === "published")) &&
        (learnerId === null || row.learnerId === learnerId),
    );
    return list(ctx, cards, pageSchema(ReportCardSchema));
  }),
];
