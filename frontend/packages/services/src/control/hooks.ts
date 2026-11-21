import {
  PAGE_SIZE_MAX,
  StaffSessionSchema,
  StaffUserSchema,
  pageSchema,
  type ControlPermission,
} from "@nexus/contracts";
import { useQuery } from "@tanstack/react-query";
import type { Parser, QueryParams } from "../client";
import { useControlServices } from "./provider";

/** Query keys always include the staff id, so one staff member never sees another's cached answers. */
export const controlKeys = {
  all: ["control"] as const,
  me: (staffId: string | null) => ["control", staffId, "me"] as const,
  demoStaff: ["control", "demo-staff"] as const,
  resource: (staffId: string | null, path: string, query?: QueryParams) =>
    ["control", staffId, path, query ?? {}] as const,
};

/** GET one Control resource for the signed-in staff member; idle until someone is signed in. */
export function useControlQuery<T>(
  path: string,
  schema: Parser<T>,
  query?: QueryParams,
  options: { readonly enabled?: boolean } = {},
) {
  const { client, staffId } = useControlServices();
  return useQuery({
    queryKey: controlKeys.resource(staffId, path, query),
    queryFn: ({ signal }) => client.get(path, schema, query, { signal }),
    enabled: staffId !== null && (options.enabled ?? true),
  });
}

/** The signed-in staff member, their roles and permissions (`GET /me`). */
export function useStaffSession() {
  const { client, staffId } = useControlServices();
  return useQuery({
    queryKey: controlKeys.me(staffId),
    queryFn: ({ signal }) => client.get("/me", StaffSessionSchema, undefined, { signal }),
    enabled: staffId !== null,
  });
}

/** True when the signed-in staff member has `permission` (deny while loading). */
export function useStaffCan(): (permission: ControlPermission | null) => boolean {
  const session = useStaffSession();
  const granted = new Set(session.data?.permissions ?? []);
  return (permission) => permission === null || granted.has(permission);
}

export const DemoStaffPageSchema = pageSchema(StaffUserSchema);

/** Mock sign-in list (`GET /demo/staff`, no staff header needed). */
export function useDemoStaff() {
  const { client } = useControlServices();
  return useQuery({
    queryKey: controlKeys.demoStaff,
    queryFn: ({ signal }) =>
      client.get("/demo/staff", DemoStaffPageSchema, { pageSize: PAGE_SIZE_MAX }, { signal }),
  });
}
