import {
  CertificationSchema,
  DpaRecordSchema,
  PAGE_SIZE_MAX,
  SecurityIncidentSchema,
  SubProcessorSchema,
  pageSchema,
} from "@nexus/contracts";
import { useControlQuery } from "./hooks";

export const CertificationPageSchema = pageSchema(CertificationSchema);
export const SecurityIncidentPageSchema = pageSchema(SecurityIncidentSchema);
export const SubProcessorPageSchema = pageSchema(SubProcessorSchema);
export const DpaRecordPageSchema = pageSchema(DpaRecordSchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

/** ISO 27001 / 27701, SOC 2, CERT-In empanelment and their state (`ctl.trust.read`, P14). */
export function useCertifications() {
  return useControlQuery("/certifications", CertificationPageSchema, ALL);
}

/** Security incidents with the breach-notification clock (P14). */
export function useIncidents() {
  return useControlQuery("/incidents", SecurityIncidentPageSchema, ALL);
}

/** Companies that process data for us, as published on the trust page (P14). */
export function useSubProcessors() {
  return useControlQuery("/sub-processors", SubProcessorPageSchema, ALL);
}

/** Data-processing agreements signed by customers (P14). */
export function useDpas() {
  return useControlQuery("/dpas", DpaRecordPageSchema, ALL);
}
