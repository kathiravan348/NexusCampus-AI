import {
  AcademicCalendarSchema,
  CampusSchema,
  GroupSchema,
  IdSchema,
  InstitutionSchema,
  InstitutionTypeProfileSchema,
  InstitutionTypeSchema,
  LocaleSchema,
  LocaleSettingsSchema,
  NameSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";

/** One demo tenant on the sign-in screen with its personas (mock mode). */
export const DemoTenantEntrySchema = z.strictObject({
  tenantId: IdSchema,
  name: NameSchema,
  type: InstitutionTypeSchema,
  defaultLocale: LocaleSchema,
  personas: z.array(
    z.strictObject({ userId: IdSchema, labelKey: z.string().min(1), roleId: IdSchema }),
  ),
});
export type DemoTenantEntry = z.infer<typeof DemoTenantEntrySchema>;
export const DemoTenantListSchema = z.array(DemoTenantEntrySchema);

/** The signed-in tenant: its group (`null` = standalone institution), institutions and campuses. */
export const TenantResponseSchema = z.strictObject({
  group: GroupSchema.nullable(),
  institutions: z.array(InstitutionSchema),
  campuses: z.array(CampusSchema),
});
export type TenantResponse = z.infer<typeof TenantResponseSchema>;

export const CalendarPageSchema = pageSchema(AcademicCalendarSchema);

const institutionPath = (id: string, leaf: string) =>
  `/institutions/${encodeURIComponent(id)}/${leaf}`;

/** Demo sign-in list; needs no session. */
export function useDemoTenants() {
  const { client } = useServices();
  return useQuery({
    queryKey: queryKeys.demoTenants(),
    queryFn: ({ signal }) =>
      client.get("/demo-tenants", DemoTenantListSchema, undefined, { signal }),
  });
}

export function useTenant() {
  return useScopedQuery(queryKeys.m01.tenant, (client, signal) =>
    client.get("/tenant", TenantResponseSchema, undefined, { signal }),
  );
}

/** Type profile of one institution; idle while `institutionId` is `null`. */
export function useInstitutionProfile(institutionId: string | null) {
  const id = institutionId ?? "";
  return useScopedQuery(
    (s) => queryKeys.m01.institutionProfile(s, id),
    (client, signal) =>
      client.get(institutionPath(id, "profile"), InstitutionTypeProfileSchema, undefined, {
        signal,
      }),
    institutionId !== null,
  );
}

/** Academic calendars of one institution; idle while `institutionId` is `null`. */
export function useCalendars(institutionId: string | null) {
  const id = institutionId ?? "";
  return useScopedQuery(
    (s) => queryKeys.m01.calendars(s, id),
    (client, signal) =>
      client.get(
        institutionPath(id, "calendars"),
        CalendarPageSchema,
        { pageSize: PAGE_SIZE_MAX },
        { signal },
      ),
    institutionId !== null,
  );
}

/** Locale settings of one institution, or of the tenant's first institution when `null`. */
export function useLocaleSettings(institutionId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m01.localeSettings(s, institutionId),
    (client, signal) =>
      client.get("/locale-settings", LocaleSettingsSchema, { institutionId }, { signal }),
  );
}
