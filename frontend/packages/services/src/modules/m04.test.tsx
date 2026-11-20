import { DEMO_PERSONAS, TENANT, USER } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import {
  useDeleteOverride,
  useImportOverrides,
  useRevisions,
  useRollbackOverride,
  useSaveOverride,
  TextBundleSchema,
  bundleFromOverrides,
  useTextOverrides,
} from "./m04";

startMockServer();

const NB_ADMIN = DEMO_PERSONAS.find(
  (p) => p.tenantId === TENANT.northbridge && p.userId === USER.nbRobert,
)!;

describe("m04 hooks", () => {
  it("loads only the asked locale's overrides for this tenant", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(() => useTextOverrides("en-GB"), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const items = result.current.data?.items ?? [];
    expect(items.every((o) => o.locale === "en-GB" && o.tenantId === ADMIN.tenantId)).toBe(true);
    expect(result.current.data?.total).toBe(items.length);
  });

  it("saves, updates, rolls back, and deletes an override while invalidating cached queries", async () => {
    signInAs(NB_ADMIN);
    const db = freshDb();
    const { result } = renderHook(
      () => ({
        overrides: useTextOverrides("en-US"),
        revisions: useRevisions("term.learner", "en-US"),
        save: useSaveOverride(),
        remove: useDeleteOverride(),
        rollback: useRollbackOverride(),
      }),
      { wrapper: wrapper({ db }) },
    );

    await waitFor(() => expect(result.current.overrides.isSuccess).toBe(true));
    expect(result.current.overrides.data?.items).toEqual([]);

    await act(async () => {
      const res = await result.current.save.mutateAsync({
        key: "term.learner",
        locale: "en-US",
        message: "Scholar",
      });
      expect(res.queued).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.overrides.data?.items[0]?.message).toBe("Scholar");
      expect(result.current.revisions.data?.items.length).toBe(1);
    });

    await act(async () => {
      await result.current.save.mutateAsync({
        key: "term.learner",
        locale: "en-US",
        message: "Fellow",
      });
    });

    await waitFor(() => {
      expect(result.current.overrides.data?.items[0]?.message).toBe("Fellow");
      expect(result.current.revisions.data?.items.length).toBe(2);
    });

    await act(async () => {
      await result.current.rollback.mutateAsync({
        key: "term.learner",
        locale: "en-US",
        version: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.overrides.data?.items[0]?.message).toBe("Scholar");
      expect(result.current.revisions.data?.items.length).toBe(3);
    });

    await act(async () => {
      await result.current.remove.mutateAsync({ key: "term.learner", locale: "en-US" });
    });

    await waitFor(() => {
      expect(result.current.overrides.data?.items).toEqual([]);
      expect(result.current.revisions.data?.items.length).toBe(4);
    });
  });

  it("previews and applies JSON imports and invalidates overrides on apply", async () => {
    signInAs(NB_ADMIN);
    const db = freshDb();
    const { result } = renderHook(
      () => ({
        overrides: useTextOverrides("en-US"),
        importOverrides: useImportOverrides(),
      }),
      { wrapper: wrapper({ db }) },
    );

    await waitFor(() => expect(result.current.overrides.isSuccess).toBe(true));

    await act(async () => {
      const preview = await result.current.importOverrides.mutateAsync({
        locale: "en-US",
        dryRun: true,
        entries: {
          "common.save": "Store",
          "common.badKey": "Nope",
        },
      });
      expect(preview.queued).toBe(false);
      if (!preview.queued) {
        expect(preview.data.added.length).toBe(1);
        expect(preview.data.rejected.length).toBe(1);
      }
    });

    // Dry run must not mutate overrides
    expect(result.current.overrides.data?.items).toEqual([]);

    await act(async () => {
      const applied = await result.current.importOverrides.mutateAsync({
        locale: "en-US",
        dryRun: false,
        entries: { "common.save": "Store" },
      });
      expect(applied.queued).toBe(false);
      if (!applied.queued) expect(applied.data.appliedCount).toBe(1);
    });

    await waitFor(() => {
      expect(
        result.current.overrides.data?.items.find((o) => o.key === "common.save")?.message,
      ).toBe("Store");
    });
  });

  it("builds the runtime bundle layers from overrides (mock mode) like the backend bundle", () => {
    const at = "2026-09-01T00:00:00Z";
    const o = (
      kind: "group" | "institution" | "campus",
      targetId: string,
      key: string,
      message: string,
    ) => ({
      id: `tov-${key}-${kind}`,
      tenantId: "ten-rv",
      scope: { kind, targetId },
      locale: "en-GB",
      key,
      message,
      version: 1,
      updatedBy: "usr-rv-helen",
      updatedAt: at,
    });
    const bundle = bundleFromOverrides("en-GB", [
      o("group", "grp-rv", "term.learner", "Pupil"),
      o("institution", "ins-rv", "term.class", "Form"),
      o("campus", "cmp-rv-north", "term.class", "Set"),
    ]);
    expect(TextBundleSchema.parse(bundle)).toEqual({
      locale: "en-GB",
      etag: "mock",
      group: { "term.learner": "Pupil" },
      institutions: { "ins-rv": { "term.class": "Form" } },
      campuses: { "cmp-rv-north": { "term.class": "Set" } },
    });
  });
});
