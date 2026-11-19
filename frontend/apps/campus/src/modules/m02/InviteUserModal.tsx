import type { ScopeKind } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { ApiRequestError, useInviteUser, useRoles, useTenant } from "@nexus/services";
import { Button, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "../m01/formErrors";
import { pickableKinds, SCOPE_KEY, scopeOf, scopeTargets } from "./accessShared";

interface FormValues {
  legalName: string;
  email: string;
  roleId: string;
  scopeKind: string;
  targetId: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY: FormValues = { legalName: "", email: "", roleId: "", scopeKind: "", targetId: "" };

export interface InviteUserModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly online: boolean;
}

/** Invite a person by name and email with their first role in a scope (M02). */
export function InviteUserModal({ open, onOpenChange, online }: InviteUserModalProps) {
  const t = useText();
  const toast = useToast();
  const roles = useRoles();
  const tenant = useTenant();
  const invite = useInviteUser();
  const { register, handleSubmit, reset, setError, watch, setValue, formState } =
    useForm<FormValues>({ defaultValues: EMPTY });
  const { errors } = formState;

  useEffect(() => {
    if (open) reset(EMPTY);
  }, [open, reset]);

  const role = roles.data?.items.find((r) => r.id === watch("roleId"));
  const kinds = role ? pickableKinds(role.allowedScopeKinds, tenant.data) : [];
  const kind = watch("scopeKind") as ScopeKind | "";
  const targets = kind ? scopeTargets(kind, tenant.data) : [];
  const required = { required: t("common.required") };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await invite.mutateAsync({
        legalName: values.legalName,
        email: values.email,
        roleId: values.roleId,
        scope: scopeOf(values.scopeKind as ScopeKind, values.targetId),
      });
      toast.show({ tone: "success", title: t("m02.invite.sent") });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.error.code === "conflict") {
        setError("email", { type: "server", message: t("m02.invite.duplicate") });
      } else if (!applyServerErrors(error, setError)) {
        toast.show({ tone: "danger", title: t("m02.access.saveFailed") });
      }
    }
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("m02.invite.title")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="invite-form" loading={invite.isPending} disabled={!online}>
            {t("m02.invite.submit")}
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
        <Input
          label={t("m02.invite.legalName")}
          required
          error={errors.legalName?.message}
          {...register("legalName", {
            ...required,
            validate: (v) => v.trim().length > 0 || t("common.required"),
          })}
        />
        <Input
          type="email"
          label={t("m02.invite.email")}
          required
          error={errors.email?.message}
          {...register("email", {
            ...required,
            pattern: { value: EMAIL, message: t("m02.invite.emailInvalid") },
          })}
        />
        <Select
          label={t("m02.invite.role")}
          required
          placeholder={t("m02.invite.pick")}
          options={(roles.data?.items ?? []).map((r) => ({ value: r.id, label: r.name }))}
          error={errors.roleId?.message}
          {...register("roleId", {
            ...required,
            onChange: () => {
              setValue("scopeKind", "");
              setValue("targetId", "");
            },
          })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("m02.invite.scopeKind")}
            required
            placeholder={t("m02.invite.pick")}
            disabled={!role}
            options={kinds.map((k) => ({ value: k, label: t(SCOPE_KEY[k]) }))}
            error={errors.scopeKind?.message}
            {...register("scopeKind", { ...required, onChange: () => setValue("targetId", "") })}
          />
          {kind !== "own" && (
            <Select
              label={t("m02.invite.scopeTarget")}
              required
              placeholder={t("m02.invite.pick")}
              disabled={!kind}
              options={targets}
              error={errors.targetId?.message}
              {...register("targetId", {
                validate: (v) => v !== "" || t("common.required"),
              })}
            />
          )}
        </div>
      </form>
    </Modal>
  );
}
