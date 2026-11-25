import { useText, type MessageKey } from "@nexus/i18n";
import { ApiRequestError, useCalendars, useStartRollover, useTenant } from "@nexus/services";
import { Button, Checkbox, Modal, Select, useToast } from "@nexus/ui-core";
import { useEffect, useState } from "react";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly online: boolean;
  readonly onStarted: (runId: string) => void;
}

type Field = "institutionId" | "fromAcademicYearId" | "toAcademicYearId";

/** Starts a rollover run with its dry run (M86, D84; online only). Nothing moves until it is confirmed. */
export function StartRolloverDialog({ open, onOpenChange, online, onStarted }: Props) {
  const t = useText();
  const toast = useToast();
  const tenant = useTenant();
  const start = useStartRollover();
  const institutions = tenant.data?.institutions ?? [];
  const [institutionId, setInstitutionId] = useState("");
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [carryFees, setCarryFees] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field | "root", MessageKey>>>({});
  const calendars = useCalendars(institutionId || null);
  const years = [...(calendars.data?.items ?? [])].sort((a, b) =>
    a.startsOn.localeCompare(b.startsOn),
  );

  const firstInstitution = institutions[0]?.id ?? "";
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setCarryFees(false);
    setInstitutionId((current) => current || firstInstitution);
  }, [open, firstInstitution]);

  const firstYear = years[0]?.id ?? "";
  const secondYear = years[1]?.id ?? "";
  useEffect(() => {
    if (!open) return;
    setFromYear((current) => current || firstYear);
    setToYear((current) => current || secondYear);
  }, [open, firstYear, secondYear]);

  const submit = async () => {
    if (!institutionId || !fromYear || !toYear) {
      setErrors({
        institutionId: institutionId ? undefined : "common.required",
        fromAcademicYearId: fromYear ? undefined : "common.required",
        toAcademicYearId: toYear ? undefined : "common.required",
      });
      return;
    }
    if (fromYear === toYear) {
      setErrors({ toAcademicYearId: "m86.start.sameYear" });
      return;
    }
    setErrors({});
    try {
      const run = await start.mutateAsync({
        institutionId,
        fromAcademicYearId: fromYear,
        toAcademicYearId: toYear,
        carryForwardFees: carryFees,
      });
      toast.show({ tone: "success", title: t("m86.start.created") });
      onStarted(run.id);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.error.code === "conflict") {
        setErrors({ root: "m86.start.alreadyOpen" });
      } else if (error instanceof ApiRequestError && error.error.code === "invalid_request") {
        const next: Partial<Record<Field | "root", MessageKey>> = {};
        for (const detail of error.error.details ?? []) {
          if (
            detail.path === "institutionId" ||
            detail.path === "fromAcademicYearId" ||
            detail.path === "toAcademicYearId"
          ) {
            next[detail.path] = "common.required";
          }
        }
        setErrors(Object.keys(next).length ? next : { root: "m86.actionFailed" });
      } else {
        setErrors({ root: "m86.actionFailed" });
      }
    }
  };

  const yearOptions = years.map((year) => ({ value: year.id, label: year.academicYear }));
  const error = (field: Field | "root") => (errors[field] ? t(errors[field]) : undefined);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("m86.start.title")}
      description={t("m86.start.description")}
      footer={
        <>
          {!online && (
            <p role="status" className="me-auto text-body-sm text-text-secondary">
              {t("common.offline")}
            </p>
          )}
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            loading={start.isPending}
            disabled={!online}
            onClick={() => void submit()}
          >
            {t("m86.start.open")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errors.root && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm font-medium text-danger-text"
          >
            {error("root")}
          </p>
        )}
        <Select
          label={t("m86.start.institution")}
          required
          placeholder={t("common.selectOption")}
          options={institutions.map((row) => ({ value: row.id, label: row.name }))}
          value={institutionId}
          error={error("institutionId")}
          onChange={(event) => {
            setInstitutionId(event.target.value);
            setFromYear("");
            setToYear("");
          }}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("m86.start.fromYear")}
            required
            placeholder={t("common.selectOption")}
            options={yearOptions}
            value={fromYear}
            error={error("fromAcademicYearId")}
            onChange={(event) => setFromYear(event.target.value)}
          />
          <Select
            label={t("m86.start.toYear")}
            required
            placeholder={t("common.selectOption")}
            options={yearOptions}
            value={toYear}
            error={error("toAcademicYearId")}
            onChange={(event) => setToYear(event.target.value)}
          />
        </div>
        <Checkbox
          label={t("m86.start.carryFees")}
          checked={carryFees}
          onCheckedChange={(value) => setCarryFees(value === true)}
        />
      </div>
    </Modal>
  );
}
