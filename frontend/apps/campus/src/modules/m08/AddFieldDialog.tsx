import {
  ConfigEntitySchema,
  CustomFieldInputSchema,
  type ConfigEntity,
  type CustomFieldInput,
} from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useCreateCustomField,
  useCustomFields,
  useLocaleSettings,
} from "@nexus/services";
import { Button, Input, Modal, Select, Skeleton } from "@nexus/ui-core";
import { useFieldArray, useForm } from "react-hook-form";

interface AddFieldDialogProps {
  readonly entity: ConfigEntity;
  readonly typeOptions: { value: CustomFieldInput["type"]; label: string }[];
  readonly online: boolean;
  readonly onClose: () => void;
  readonly onCreated: (entity: ConfigEntity) => void;
}

function filledLabels(labels: Record<string, string>) {
  return Object.fromEntries(Object.entries(labels).filter(([, text]) => text.trim() !== ""));
}

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

export function AddFieldDialog({
  entity,
  typeOptions,
  online,
  onClose,
  onCreated,
}: AddFieldDialogProps) {
  const t = useText();
  const settings = useLocaleSettings();
  const create = useCreateCustomField();
  const {
    register,
    control,
    watch,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<CustomFieldInput>({
    defaultValues: {
      entity,
      key: "",
      label: {},
      type: "text",
      required: false,
      sensitive: false,
      options: [],
    },
  });
  const options = useFieldArray({ control, name: "options" });
  const fields = useCustomFields(watch("entity"));
  const type = watch("type");
  const choice = type === "choice" || type === "multi_choice";
  const defaultLocale = settings.data?.defaultLocale;
  const busy = isSubmitting || create.isPending;
  const submit = handleSubmit(async (draft) => {
    if (!online || !defaultLocale || !fields.data || busy) return;
    clearErrors();
    const label = filledLabels(draft.label);
    if (!label[defaultLocale]) {
      setError(`label.${defaultLocale}`, { message: t("common.required") }, { shouldFocus: true });
      return;
    }
    const input = CustomFieldInputSchema.safeParse({
      entity: draft.entity,
      type,
      key: draft.key,
      required: draft.required,
      sensitive: draft.sensitive,
      label,
      order: fields.data.items.reduce((next, field) => Math.max(next, field.order + 1), 0),
      ...(choice && {
        options: draft.options?.map((option) => ({ ...option, label: filledLabels(option.label) })),
      }),
      ...(type === "number" && { min: draft.min, max: draft.max }),
    });
    if (!input.success) {
      for (const issue of input.error.issues) {
        const [field, locale] = issue.path;
        if (field === "key") setError("key", { message: t("m08.dialog.keyHint") });
        else if (field === "label" && typeof locale === "string") {
          setError(`label.${locale}`, { message: t("m08.dialog.labelHint") });
        } else if (field === "options")
          setError("root.options", { message: t("m08.dialog.optionsHint") });
        else if (field === "max" || field === "min")
          setError(field, { message: t("m08.dialog.boundsHint") });
        else setError("root.form", { message: t("common.error") });
      }
      return;
    }
    try {
      const created = await create.mutateAsync(input.data);
      onCreated(created.entity);
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError && error.error.code === "conflict") {
        setError("key", { message: t("m08.dialog.duplicate") }, { shouldFocus: true });
      } else if (
        error instanceof ApiRequestError &&
        error.error.details?.some((detail) => detail.path === "label")
      ) {
        setError(
          `label.${defaultLocale}`,
          { message: t("m08.dialog.labelHint") },
          { shouldFocus: true },
        );
      } else {
        setError("root.form", { message: t("common.error") });
      }
    }
  });

  return (
    <Modal
      open
      size="lg"
      title={t("m08.field.add")}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      footer={
        <>
          {!online && (
            <span id="m08-save-offline" role="status">
              {t("common.offline")}
            </span>
          )}
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="m08-create-field"
            disabled={!online || !settings.data || !fields.data || busy}
            aria-describedby={online ? undefined : "m08-save-offline"}
            loading={busy}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      {settings.data ? (
        <form
          id="m08-create-field"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          {errors.root?.["form"] && <p role="alert">{errors.root["form"].message}</p>}
          {!fields.data && fields.isError && (
            <Button type="button" variant="secondary" onClick={() => void fields.refetch()}>
              {t("common.retry")}
            </Button>
          )}
          <Select
            label={t("m08.field.entity")}
            {...register("entity")}
            options={ConfigEntitySchema.options.map((value) => ({
              value,
              label: t(`m08.entity.${value}`),
            }))}
          />
          <Input
            required
            label={t("m08.dialog.key")}
            description={t("m08.dialog.keyHint")}
            error={errors.key?.message}
            {...register("key")}
          />
          {settings.data.supportedLocales.map((locale) => (
            <Input
              key={locale}
              label={t("m08.dialog.label", { locale })}
              required={locale === defaultLocale}
              maxLength={120}
              error={errors.label?.[locale]?.message}
              {...register(`label.${locale}`)}
            />
          ))}
          <Select label={t("m08.field.type")} {...register("type")} options={typeOptions} />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" {...register("required")} />
              {t("m08.field.required")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" {...register("sensitive")} />
              {t("m08.field.sensitive")}
            </label>
          </div>
          {choice && (
            <fieldset className="min-w-0 space-y-3">
              <legend className="font-semibold">{t("m08.dialog.options")}</legend>
              {errors.root?.["options"] && <p role="alert">{errors.root["options"].message}</p>}
              {options.fields.map((option, index) => (
                <fieldset
                  key={option.id}
                  className="min-w-0 space-y-2 rounded-md border border-border-default p-3"
                >
                  <legend>{t("m08.dialog.option", { count: index + 1 })}</legend>
                  <Input
                    required
                    label={t("m08.dialog.optionKey")}
                    {...register(`options.${index}.value`)}
                  />
                  {settings.data.supportedLocales.map((locale) => (
                    <Input
                      key={locale}
                      label={t("m08.dialog.label", { locale })}
                      maxLength={120}
                      {...register(`options.${index}.label.${locale}`)}
                    />
                  ))}
                  <Button type="button" variant="secondary" onClick={() => options.remove(index)}>
                    {t("m08.dialog.removeOption")}
                  </Button>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={options.fields.length >= 100}
                onClick={() => options.append({ value: "", label: {} })}
              >
                {t("m08.dialog.addOption")}
              </Button>
            </fieldset>
          )}
          {type === "number" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                type="number"
                step="any"
                label={t("m08.dialog.min")}
                error={errors.min?.message}
                {...register("min", { setValueAs: optionalNumber })}
              />
              <Input
                type="number"
                step="any"
                label={t("m08.dialog.max")}
                error={errors.max?.message}
                {...register("max", { setValueAs: optionalNumber })}
              />
            </div>
          )}
        </form>
      ) : settings.isError ? (
        <div role="alert" className="space-y-2">
          <p>{t("common.error")}</p>
          <Button variant="secondary" onClick={() => void settings.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-24 w-full" />
      )}
    </Modal>
  );
}
