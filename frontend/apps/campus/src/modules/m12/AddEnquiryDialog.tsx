import { zodResolver } from "@hookform/resolvers/zod";
import {
  EnquiryInputSchema,
  EnquirySourceSchema,
  type EnquiryInput,
  type EnquirySource,
  type Program,
} from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { ApiRequestError, useCreateEnquiry, useTenant } from "@nexus/services";
import { Button, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useForm } from "react-hook-form";

export const ENQUIRY_SOURCE_KEYS: Readonly<Record<EnquirySource, MessageKey>> = {
  walk_in: "m12.source.walkIn",
  phone: "m12.source.phone",
  website: "m12.source.website",
  public_form: "m12.source.publicForm",
  referral: "m12.source.referral",
  campaign: "m12.source.campaign",
  event: "m12.source.event",
  other: "m12.source.other",
};

const defaults: EnquiryInput = {
  source: "walk_in",
  campusId: null,
  contactName: "",
  contactPhone: null,
  contactEmail: null,
  learnerName: "",
  programId: null,
  followUpOn: null,
};

const fieldErrors: Record<keyof EnquiryInput, MessageKey> = {
  source: "m12.add.invalidSource",
  campusId: "m12.add.invalidCampus",
  contactName: "m12.add.invalidName",
  learnerName: "m12.add.invalidName",
  contactPhone: "m12.add.invalidPhone",
  contactEmail: "m12.add.invalidEmail",
  programId: "m12.add.invalidProgram",
  followUpOn: "m12.add.invalidDate",
};

const optional = { setValueAs: (value: string | null) => value?.trim() || null };

interface AddEnquiryDialogProps {
  readonly online: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: () => void;
  readonly programs: readonly Program[];
}

export function AddEnquiryDialog({
  online,
  onOpenChange,
  onCreated,
  programs,
}: AddEnquiryDialogProps) {
  const t = useText();
  const tenant = useTenant();
  const create = useCreateEnquiry();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EnquiryInput>({
    defaultValues: defaults,
    resolver: zodResolver(EnquiryInputSchema),
  });
  const errorFor = (field: keyof EnquiryInput) => {
    const error = errors[field];
    if (!error) return undefined;
    if (field === "contactPhone" && error.message === "A contact phone or email is required") {
      return t("m12.add.contactRequired");
    }
    return t(fieldErrors[field]);
  };
  const submit = handleSubmit(async (data) => {
    if (!online || create.isPending) return;
    try {
      await create.mutateAsync(data);
      toast.show({ tone: "success", title: t("m12.add.created") });
      onCreated();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.error.code === "invalid_request") {
        let matched = false;
        for (const detail of error.error.details ?? []) {
          if (Object.hasOwn(fieldErrors, detail.path)) {
            setError(detail.path as keyof EnquiryInput, { type: "server" });
            matched = true;
          }
        }
        if (matched) return;
      }
      setError("root", {
        type:
          error instanceof ApiRequestError && error.error.code === "forbidden"
            ? "forbidden"
            : "server",
      });
    }
  });

  const none = { value: "", label: t("m12.add.unassigned") };
  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      size="lg"
      title={t("m12.add.title")}
      description={t("m12.add.description")}
      footer={
        <>
          {!online && <p role="status">{t("common.offline")}</p>}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="m12-enquiry" disabled={!online} loading={create.isPending}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form
        id="m12-enquiry"
        noValidate
        onSubmit={(event) => void submit(event)}
        className="grid gap-4 sm:grid-cols-2"
      >
        {errors.root && (
          <p role="alert" className="text-danger-text sm:col-span-2">
            {t(errors.root.type === "forbidden" ? "common.shell.forbiddenTitle" : "m12.add.failed")}
          </p>
        )}
        <Input
          label={t("m12.add.learner")}
          required
          error={errorFor("learnerName")}
          {...register("learnerName")}
        />
        <Input
          label={t("m12.add.contact")}
          required
          error={errorFor("contactName")}
          {...register("contactName")}
        />
        <Input
          label={t("m12.add.phone")}
          type="tel"
          error={errorFor("contactPhone")}
          {...register("contactPhone", optional)}
        />
        <Input
          label={t("m12.add.email")}
          type="email"
          error={errorFor("contactEmail")}
          {...register("contactEmail", optional)}
        />
        <Select
          label={t("m12.add.source")}
          error={errorFor("source")}
          options={EnquirySourceSchema.options.map((value) => ({
            value,
            label: t(ENQUIRY_SOURCE_KEYS[value]),
          }))}
          {...register("source")}
        />
        <Select
          label={t("m12.add.program")}
          error={errorFor("programId")}
          options={[none, ...programs.map((p) => ({ value: p.id, label: p.name }))]}
          {...register("programId", optional)}
        />
        <Select
          label={t("m12.add.campus")}
          error={errorFor("campusId")}
          options={[
            none,
            ...(tenant.data?.campuses ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
          {...register("campusId", optional)}
        />
        <Input
          label={t("m12.add.followUp")}
          type="date"
          error={errorFor("followUpOn")}
          {...register("followUpOn", optional)}
        />
      </form>
    </Modal>
  );
}
