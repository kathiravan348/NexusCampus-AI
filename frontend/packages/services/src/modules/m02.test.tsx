import { act, renderHook, waitFor } from "@testing-library/react";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import {
  useInviteUser,
  usePermissions,
  useRevokeSession,
  useRoles,
  useSaveRole,
  useSessions,
  useUsers,
  useMe,
} from "./m02";

startMockServer();

describe("m02 hooks", () => {
  it("loads the signed-in user with resolved permissions", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(() => useMe(), { wrapper: wrapper({ db: freshDb() }) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.user.id).toBe(ADMIN.userId);
    expect(result.current.data?.person.id).toBe(result.current.data?.user.personId);
    expect(result.current.data?.permissions).toContain("m05.plan.read");
  });

  it("invites a user and refetches the users list", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({ users: useUsers(), roles: useRoles(), invite: useInviteUser() }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() =>
      expect(result.current.users.isSuccess && result.current.roles.isSuccess).toBe(true),
    );
    const before = result.current.users.data!.items.length;
    const role = result.current.roles.data!.items.find((r) => r.allowedScopeKinds.includes("own"))!;
    await act(() =>
      result.current.invite.mutateAsync({
        legalName: "Test Guardian",
        email: "test.guardian@example.org",
        roleId: role.id,
        scope: { kind: "own", targetId: null },
      }),
    );
    await waitFor(() => expect(result.current.users.data!.items.length).toBe(before + 1));
  });

  it("saves a custom role and loads the permission catalogue", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(() => ({ perms: usePermissions(), save: useSaveRole() }), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(result.current.perms.isSuccess).toBe(true));
    const role = await act(() =>
      result.current.save.mutateAsync({
        data: {
          name: "Reader",
          permissions: ["m01.institution.read"],
          allowedScopeKinds: ["campus"],
        },
      }),
    );
    expect(role.system).toBe(false);
  });

  it("revokes a session", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(() => ({ sessions: useSessions(), revoke: useRevokeSession() }), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(result.current.sessions.isSuccess).toBe(true));
    const open = result.current.sessions.data!.items.find((s) => s.revokedAt === null)!;
    const revoked = await act(() => result.current.revoke.mutateAsync(open.id));
    expect(revoked.revokedAt).not.toBeNull();
  });
});
