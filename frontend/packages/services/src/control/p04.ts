import {
  OffboardingJobSchema,
  PAGE_SIZE_MAX,
  ProvisioningJobSchema,
  ShredCertificateSchema,
  pageSchema,
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
      ["/provisioning-jobs", "/accounts"].map((path) =>
        qc.invalidateQueries({ queryKey: ["control", staffId, path] }),
      ),
    );
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
