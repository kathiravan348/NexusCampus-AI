import {
  AdmissionOfferSchema,
  ApplicationSchema,
  EnquirySchema,
  WaitlistEntrySchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { get, list, param } from "./route";

const M = { module: "M12", permission: "m12.admissions.read" } as const;

export const m12Handlers = [
  get("/enquiries", M, (ctx) => {
    const status = param(ctx.url, "status");
    const enquiries = ofTenant(mockDb.enquiries, ctx.viewer.tenantId).filter(
      (row) => status === null || row.status === status,
    );
    return list(ctx, enquiries, pageSchema(EnquirySchema));
  }),
  get("/applications", M, (ctx) => {
    const applications = ofTenant(mockDb.applications, ctx.viewer.tenantId);
    return list(ctx, applications, pageSchema(ApplicationSchema));
  }),
  get("/admission-offers", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.admissionOffers, ctx.viewer.tenantId),
      pageSchema(AdmissionOfferSchema),
    ),
  ),
  get("/waitlist", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.waitlistEntries, ctx.viewer.tenantId),
      pageSchema(WaitlistEntrySchema),
    ),
  ),
];
