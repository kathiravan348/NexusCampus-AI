import {
  OffboardingJobSchema,
  PAGE_SIZE_MAX,
  ProvisioningJobSchema,
  ShredCertificateSchema,
  pageSchema,
  type OffboardingJob,
  type OffboardingRequest,
  type ProvisioningJob,
  type ProvisioningRequest,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useControlQuery } from "./hooks";
import { useControlServices } from "./provider";

export const ProvisioningJobPageSchema = pageSchema(ProvisioningJobSchema);
export const OffboardingJobPageSchema = pageSchema(OffboardingJobSchema);
export const ShredCertificatePageSchema = pageSchema(ShredCertificateSchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

export function useProvisioningJobs() {
  return useControlQuery("/provisioning-jobs", ProvisioningJobPageSchema, ALL);
}

export function useOffboardingJobs() {
  return useControlQuery("/offboarding-jobs", OffboardingJobPageSchema, ALL);
}

export function useShredCertificates() {
  return useControlQuery("/shred-certificates", ShredCertificatePageSchema, ALL);
}

function useRefetchProvisioning() {
  const { staffId } = useControlServices();
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["/provisioning-jobs", "/offboarding-jobs", "/shred-certificates", "/accounts"].map((path) =>
        qc.invalidateQueries({ queryKey: ["control", staffId, path] }),
      ),
    );
}

function resolveJobId(hookJobId: string | undefined, callJobId: string | void): string {
  const id = typeof callJobId === "string" && callJobId ? callJobId : hookJobId;
  if (!id) throw new Error("Job id is required");
  return id;
}

/** Starts a trial tenant for an account (`ctl.provisioning.manage`). */
export function useStartTrial() {
  const { client } = useControlServices();
  const refetch = useRefetchProvisioning();
  return useMutation<ProvisioningJob, Error, ProvisioningRequest>({
    mutationFn: (request) =>
      client.send("POST", "/provisioning-jobs", request, ProvisioningJobSchema),
    onSuccess: async () => {
      await refetch();
    },
  });
}

/** Demo: completes the next step of a provisioning job. */
export function useAdvanceJob() {
  const { client } = useControlServices();
  const refetch = useRefetchProvisioning();
  return useMutation<ProvisioningJob, Error, string>({
    mutationFn: (id) =>
      client.send(
        "POST",
        `/provisioning-jobs/${encodeURIComponent(id)}/advance`,
        {},
        ProvisioningJobSchema,
      ),
    onSuccess: async () => {
      await refetch();
    },
  });
}

/** Retries a failed provisioning job (`POST /provisioning-jobs/:id/retry`, D63). */
export function useRetryProvisioning(jobId?: string) {
  const { client } = useControlServices();
  const refetch = useRefetchProvisioning();
  return useMutation<ProvisioningJob, Error, string | void>({
    mutationFn: (callId) =>
      client.send(
        "POST",
        `/provisioning-jobs/${encodeURIComponent(resolveJobId(jobId, callId))}/retry`,
        {},
        ProvisioningJobSchema,
      ),
    onSuccess: async () => {
      await refetch();
    },
  });
}

/** Starts offboarding a SaaS tenant (`POST /offboarding-jobs`, D61). */
export function useStartOffboarding() {
  const { client } = useControlServices();
  const refetch = useRefetchProvisioning();
  return useMutation<OffboardingJob, Error, OffboardingRequest>({
    mutationFn: (request) =>
      client.send("POST", "/offboarding-jobs", request, OffboardingJobSchema),
    onSuccess: async () => {
      await refetch();
    },
  });
}

/** Confirms that the institution received its encrypted export (`POST /offboarding-jobs/:id/confirm-download`). */
export function useConfirmDownload(jobId?: string) {
  const { client } = useControlServices();
  const refetch = useRefetchProvisioning();
  return useMutation<OffboardingJob, Error, string | void>({
    mutationFn: (callId) =>
      client.send(
        "POST",
        `/offboarding-jobs/${encodeURIComponent(resolveJobId(jobId, callId))}/confirm-download`,
        {},
        OffboardingJobSchema,
      ),
    onSuccess: async () => {
      await refetch();
    },
  });
}

/** Records one of the two required approvals for key destruction (`POST /offboarding-jobs/:id/approve-destroy`). */
export function useApproveDestroy(jobId?: string) {
  const { client } = useControlServices();
  const refetch = useRefetchProvisioning();
  return useMutation<OffboardingJob, Error, string | void>({
    mutationFn: (callId) =>
      client.send(
        "POST",
        `/offboarding-jobs/${encodeURIComponent(resolveJobId(jobId, callId))}/approve-destroy`,
        {},
        OffboardingJobSchema,
      ),
    onSuccess: async () => {
      await refetch();
    },
  });
}

/** Retries a failed offboarding job (`POST /offboarding-jobs/:id/retry`, D63). */
export function useRetryOffboarding(jobId?: string) {
  const { client } = useControlServices();
  const refetch = useRefetchProvisioning();
  return useMutation<OffboardingJob, Error, string | void>({
    mutationFn: (callId) =>
      client.send(
        "POST",
        `/offboarding-jobs/${encodeURIComponent(resolveJobId(jobId, callId))}/retry`,
        {},
        OffboardingJobSchema,
      ),
    onSuccess: async () => {
      await refetch();
    },
  });
}
