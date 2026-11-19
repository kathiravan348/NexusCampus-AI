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
  type AcademicCalendar,
  type Campus,
  type LocaleSettings,
} from "@nexus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

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

/** Input payload for creating or updating a campus (id and tenantId are server-owned). */
export const CampusInputSchema = CampusSchema.omit({ id: true, tenantId: true });
export type CampusInput = z.infer<typeof CampusInputSchema>;

/** Editable academic calendar payload (id, tenantId and institutionId come from the route). */
export type CalendarInput = Omit<AcademicCalendar, "id" | "tenantId" | "institutionId">;

/** Updates the institution's locale, time zone, currency and weekend days (M01, L0 online-only). */
export function useUpdateLocaleSettings(institutionId: string | null = null) {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  const path =
    institutionId === null
      ? "/locale-settings"
      : `/locale-settings?institutionId=${encodeURIComponent(institutionId)}`;

  return useMutation<LocaleSettings, Error, LocaleSettings>({
    mutationFn: (body) => client.send("PUT", path, body, LocaleSettingsSchema),
    onSuccess: async () => {
      if (!session) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.m01.localeSettings(session, institutionId) }),
        qc.invalidateQueries({ queryKey: queryKeys.m01.localeSettings(session, null) }),
        qc.invalidateQueries({ queryKey: queryKeys.m01.tenant(session) }),
      ]);
    },
  });
}

export interface SaveCampusVariables {
  readonly id?: string;
  readonly data: CampusInput;
}

/** Creates (`id` omitted) or updates (`id` set) a campus (M01, L0 online-only). */
export function useSaveCampus() {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();

  return useMutation<Campus, Error, SaveCampusVariables>({
    mutationFn: ({ id, data }) =>
      id
        ? client.send("PUT", `/campuses/${encodeURIComponent(id)}`, data, CampusSchema)
        : client.send("POST", "/campuses", data, CampusSchema),
    onSuccess: async () => {
      if (!session) return;
      await qc.invalidateQueries({ queryKey: queryKeys.m01.tenant(session) });
    },
  });
}

export interface SaveCalendarVariables {
  readonly calendarId: string;
  readonly data: CalendarInput;
}

/** Updates an institution's academic calendar (M01, L0 online-only). */
export function useSaveCalendar(institutionId: string) {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();

  return useMutation<AcademicCalendar, Error, SaveCalendarVariables>({
    mutationFn: ({ calendarId, data }) =>
      client.send(
        "PUT",
        `${institutionPath(institutionId, "calendars")}/${encodeURIComponent(calendarId)}`,
        data,
        AcademicCalendarSchema,
      ),
    onSuccess: async () => {
      if (!session) return;
      await qc.invalidateQueries({ queryKey: queryKeys.m01.calendars(session, institutionId) });
    },
  });
}
