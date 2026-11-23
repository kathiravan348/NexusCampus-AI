import {
  PAGE_SIZE_MAX,
  PortabilityJobSchema,
  pageSchema,
  type ConfirmMoveStep,
  type PortabilityJob,
  type PortabilityRequest,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useControlQuery } from "./hooks";
import { useControlServices } from "./provider";

export const PortabilityJobPageSchema = pageSchema(PortabilityJobSchema);

/** Tenant moves between SaaS and self-hosted or between regions (`ctl.portability.read`, P18). */
export function usePortabilityJobs() {
  return useControlQuery("/portability-jobs", PortabilityJobPageSchema, {
    pageSize: PAGE_SIZE_MAX,
  });
}

function useRefetchMoves() {
  const { staffId } = useControlServices();
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["/portability-jobs", "/accounts", "/offboarding-jobs"].map((path) =>
        qc.invalidateQueries({ queryKey: ["control", staffId, path] }),
      ),
    );
}

/** Starts a 7-step portability move (`POST /portability-jobs`, `ctl.portability.manage`). */
export function useStartMove() {
  const { client } = useControlServices();
  const refetch = useRefetchMoves();
  return useMutation<PortabilityJob, Error, PortabilityRequest>({
    mutationFn: (request) =>
      client.send("POST", "/portability-jobs", request, PortabilityJobSchema),
    onSuccess: async () => {
      await refetch();
    },
  });
}

/** Confirms the current pending staff step of a move (`POST /portability-jobs/:id/confirm`). */
export function useConfirmMoveStep(jobId: string) {
  const { client } = useControlServices();
  const refetch = useRefetchMoves();
  return useMutation<PortabilityJob, Error, ConfirmMoveStep>({
    mutationFn: (body) =>
      client.send(
        "POST",
        `/portability-jobs/${encodeURIComponent(jobId)}/confirm`,
        body,
        PortabilityJobSchema,
      ),
    onSuccess: async () => {
      await refetch();
    },
  });
}

/** Retries a failed portability move (`POST /portability-jobs/:id/retry`, D63). */
export function useRetryMove(jobId?: string) {
  const { client } = useControlServices();
  const refetch = useRefetchMoves();
  return useMutation<PortabilityJob, Error, string | void>({
    mutationFn: (callJobId) => {
      const id = typeof callJobId === "string" && callJobId ? callJobId : jobId;
      if (!id) throw new Error("Job id is required");
      return client.send(
        "POST",
        `/portability-jobs/${encodeURIComponent(id)}/retry`,
        {},
        PortabilityJobSchema,
      );
    },
    onSuccess: async () => {
      await refetch();
    },
  });
}
