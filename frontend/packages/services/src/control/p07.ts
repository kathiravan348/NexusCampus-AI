import {
  PAGE_SIZE_MAX,
  ReleaseSchema,
  RolloutSchema,
  pageSchema,
  type Release,
  type Rollout,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useControlQuery } from "./hooks";
import { useControlServices } from "./provider";

export const ReleasePageSchema = pageSchema(ReleaseSchema);
export const RolloutPageSchema = pageSchema(RolloutSchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

export function useReleases() {
  return useControlQuery("/releases", ReleasePageSchema, ALL);
}

export function useRollouts() {
  return useControlQuery("/rollouts", RolloutPageSchema, ALL);
}

function useRefetchReleases() {
  const { staffId } = useControlServices();
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["/releases", "/rollouts", "/deployments"].map((path) =>
        qc.invalidateQueries({ queryKey: ["control", staffId, path] }),
      ),
    );
}

/** Signs and publishes a draft; AI-drafted notes need `notesReviewed: true` (A-1). */
export function usePublishRelease() {
  const { client } = useControlServices();
  const refetch = useRefetchReleases();
  return useMutation<Release, Error, { id: string; notesReviewed: boolean }>({
    mutationFn: ({ id, notesReviewed }) =>
      client.send(
        "POST",
        `/releases/${encodeURIComponent(id)}/publish`,
        { notesReviewed },
        ReleaseSchema,
      ),
    onSuccess: async () => {
      await refetch();
    },
  });
}

/** Starts the next pending ring of a rollout (demo: it completes at once). */
export function useStartRollout() {
  const { client } = useControlServices();
  const refetch = useRefetchReleases();
  return useMutation<Rollout, Error, string>({
    mutationFn: (id) =>
      client.send("POST", `/rollouts/${encodeURIComponent(id)}/start`, {}, RolloutSchema),
    onSuccess: async () => {
      await refetch();
    },
  });
}
