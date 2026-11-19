import { zodResolver } from "@hookform/resolvers/zod";
import type { Campus } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { CampusInputSchema, useSaveCampus, type CampusInput } from "@nexus/services";
import { Button, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors, COMMON_COUNTRIES, COMMON_TIME_ZONES, withExtras } from "./formErrors";

export interface CampusFormModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly institutionId: string;
  readonly defaultCountryCode: string;
  readonly campus: Campus | null;
  readonly online: boolean;
}

function defaultsFor(
  institutionId: string,
  defaultCountryCode: string,
  campus: Campus | null,
): CampusInput {
  if (campus) {
    return {
      institutionId: campus.institutionId,
      code: campus.code,
      name: campus.name,
      timeZone: campus.timeZone,
      address: {
        line1: campus.address.line1,
        line2: campus.address.line2 ?? "",
        city: campus.address.city,
        region: campus.address.region ?? "",
        postalCode: campus.address.postalCode ?? "",
        countryCode: campus.address.countryCode,
      },
    };
  }
  return {
    institutionId,
    code: "",
    name: "",
    timeZone: null,
    address: {
      line1: "",
      line2: "",
      city: "",
      region: "",
      postalCode: "",
      countryCode: defaultCountryCode,
    },
  };
}

/** Add or edit a campus inside a modal dialog, validated by `CampusInputSchema`. */
export function CampusFormModal({
  open,
  onOpenChange,
  institutionId,
  defaultCountryCode,
  campus,
  online,
}: CampusFormModalProps) {
  const t = useText();
  const toast = useToast();
  const saveCampus = useSaveCampus();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CampusInput>({
    resolver: zodResolver(CampusInputSchema),
    defaultValues: defaultsFor(institutionId, defaultCountryCode, campus),
  });

  useEffect(() => {
    if (open) reset(defaultsFor(institutionId, defaultCountryCode, campus));
  }, [open, institutionId, defaultCountryCode, campus, reset]);

  const timeZoneOptions = useMemo(
    () => [
      { value: "", label: t("m01.structure.timeZoneDefault") },
      ...withExtras(COMMON_TIME_ZONES, [campus?.timeZone]).map((tz) => ({ value: tz, label: tz })),
    ],
    [campus?.timeZone, t],
  );

  const countryOptions = useMemo(
    () =>
      withExtras(COMMON_COUNTRIES, [defaultCountryCode, campus?.address.countryCode]).map(
        (code) => ({ value: code, label: code }),
      ),
    [defaultCountryCode, campus?.address.countryCode],
  );

  const onSubmit = handleSubmit(async (data) => {
    const cleanAddress = {
      line1: data.address.line1,
      city: data.address.city,
      countryCode: data.address.countryCode,
      ...(data.address.line2 ? { line2: data.address.line2 } : {}),
      ...(data.address.region ? { region: data.address.region } : {}),
      ...(data.address.postalCode ? { postalCode: data.address.postalCode } : {}),
    };
    try {
      await saveCampus.mutateAsync({
        ...(campus ? { id: campus.id } : {}),
        data: { ...data, institutionId, address: cleanAddress },
      });
      toast.show({ tone: "success", title: t("m01.structure.campusSaved") });
      onOpenChange(false);
    } catch (error) {
      if (!applyServerErrors(error, setError)) {
        toast.show({ tone: "danger", title: t("m01.setup.saveFailed") });
      }
    }
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t(campus ? "m01.structure.editCampus" : "m01.structure.addCampus")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="campus-form"
            loading={saveCampus.isPending}
            disabled={!online}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form id="campus-form" onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("m01.structure.code")}
            description={t("m01.structure.codeHint")}
            required
            error={errors.code?.message}
            {...register("code")}
          />
          <Input
            label={t("m01.structure.name")}
            required
            error={errors.name?.message}
            {...register("name")}
          />
        </div>
        <Select
          label={t("m01.structure.timeZone")}
          options={timeZoneOptions}
          error={errors.timeZone?.message}
          {...register("timeZone", { setValueAs: (v: string) => (v === "" ? null : v) })}
        />
        <Input
          label={t("m01.structure.addressLine1")}
          required
          error={errors.address?.line1?.message}
          {...register("address.line1")}
        />
        <Input
          label={t("m01.structure.addressLine2")}
          error={errors.address?.line2?.message}
          {...register("address.line2")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("m01.structure.city")}
            required
            error={errors.address?.city?.message}
            {...register("address.city")}
          />
          <Input
            label={t("m01.structure.stateRegion")}
            error={errors.address?.region?.message}
            {...register("address.region")}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("m01.structure.postalCode")}
            error={errors.address?.postalCode?.message}
            {...register("address.postalCode")}
          />
          <Select
            label={t("m01.structure.countryCode")}
            required
            options={countryOptions}
            error={errors.address?.countryCode?.message}
            {...register("address.countryCode")}
          />
        </div>
      </form>
    </Modal>
  );
}
