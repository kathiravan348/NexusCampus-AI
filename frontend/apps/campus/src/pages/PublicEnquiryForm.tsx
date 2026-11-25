import {
  PublicEnquiryInputSchema,
  type PublicEnquiryForm as PublicEnquiryFormData,
  type PublicEnquiryInput,
} from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { ApiRequestError, useSubmitPublicEnquiry } from "@nexus/services";
import { Banner, Button, Card, Checkbox, Input, Select } from "@nexus/ui-core";
import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { localeName } from "../app/LocaleSwitch";

type FormValues = Omit<PublicEnquiryInput, "consent" | "website"> & {
  consent: boolean;
  website: string;
};

const DEFAULTS: FormValues = {
  learnerName: "",
  contactName: "",
  contactPhone: null,
  contactEmail: null,
  programId: null,
  campusId: null,
  consent: false,
  website: "",
};

const FIELD_ERRORS: Readonly<Record<keyof PublicEnquiryInput, MessageKey>> = {
  learnerName: "m12.add.invalidName",
  contactName: "m12.add.invalidName",
  contactPhone: "m12.add.invalidPhone",
  contactEmail: "m12.add.invalidEmail",
  programId: "m12.add.invalidProgram",
  campusId: "m12.add.invalidCampus",
  consent: "m12.public.consentRequired",
  website: "m12.public.submitFailed",
};

const optional = { setValueAs: (v: string | null) => v?.trim() || null };
const cleanPhone = {
  setValueAs: (v: string | null) => v?.replace(/[\s.()-]/g, "").trim() || null,
};

export interface PublicEnquiryFormProps {
  readonly form: PublicEnquiryFormData;
  readonly online: boolean;
  readonly locale: string;
  readonly onLocaleChange: (locale: string) => void;
}

/** Public admissions enquiry form body with language switcher and thank-you state (M12, D79). */
export function PublicEnquiryForm({
  form,
  online,
  locale,
  onLocaleChange,
}: PublicEnquiryFormProps) {
  const t = useText();
  const submitEnquiry = useSubmitPublicEnquiry(form.id);
  const [submitted, setSubmitted] = useState(false);
  const rhf = useForm<FormValues>({ defaultValues: DEFAULTS });
  const { errors } = rhf.formState;
  const consent = rhf.watch("consent");

  const languageOptions = useMemo(
    () => form.supportedLocales.map((code) => ({ value: code, label: localeName(code, locale) })),
    [form.supportedLocales, locale],
  );

  const errorFor = (field: keyof PublicEnquiryInput) => {
    const error = errors[field];
    if (!error) return undefined;
    if (field === "contactPhone" && error.message === "A contact phone or email is required") {
      return t("m12.add.contactRequired");
    }
    return t(FIELD_ERRORS[field]);
  };

  const onSubmit = rhf.handleSubmit(async (values) => {
    if (!online || submitEnquiry.isPending) return;
    rhf.clearErrors();
    const parsed = PublicEnquiryInputSchema.safeParse({ ...values, website: "" });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (Object.hasOwn(FIELD_ERRORS, key)) {
          const field = key as keyof PublicEnquiryInput;
          rhf.setError(field, { type: "validate", message: issue.message });
        }
      }
      if (values.contactPhone === null && values.contactEmail === null) {
        rhf.setError("contactPhone", {
          type: "validate",
          message: "A contact phone or email is required",
        });
      }
      return;
    }
    try {
      await submitEnquiry.mutateAsync({ ...parsed.data, website: values.website });
      setSubmitted(true);
    } catch (error) {
      if (error instanceof ApiRequestError && error.error.code === "invalid_request") {
        const details = error.error.details ?? [];
        const matched = details.filter((d) => Object.hasOwn(FIELD_ERRORS, d.path));
        for (const d of matched) {
          rhf.setError(d.path as keyof PublicEnquiryInput, { type: "server" });
        }
        if (matched.length > 0) return;
      }
      rhf.setError("root", {
        type: error instanceof ApiRequestError && error.offline ? "offline" : "server",
      });
    }
  });

  const none = { value: "", label: t("m12.public.noPreference") };
  const programs = [none, ...form.programs.map((p) => ({ value: p.id, label: p.name }))];
  const campuses = [none, ...form.campuses.map((c) => ({ value: c.id, label: c.name }))];
  const rootKey: MessageKey =
    errors.root?.type === "offline" ? "m12.public.offlineNotice" : "m12.public.submitFailed";

  return (
    <>
      <header className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="font-sans text-page-title font-semibold break-words text-text-primary">
              {form.institutionName}
            </h1>
            <p className="text-body text-text-secondary">{t("m12.public.title")}</p>
          </div>
          {languageOptions.length >= 2 && (
            <div className="w-full sm:w-48 sm:shrink-0">
              <Select
                label={t("m04.localeSwitch.label")}
                options={languageOptions}
                value={locale}
                onChange={(event) => onLocaleChange(event.target.value)}
              />
            </div>
          )}
        </div>
        {!submitted && <p className="text-body-sm text-text-secondary">{t("m12.public.intro")}</p>}
      </header>

      {submitted ? (
        <Card>
          <div role="status" className="flex flex-col items-center space-y-3 py-6 text-center">
            <span className="rounded-pill bg-success-subtle p-3" aria-hidden="true">
              <CheckCircle2 className="h-6 w-6 text-success-text" />
            </span>
            <h2 className="font-sans text-section-title font-semibold text-text-primary">
              {t("m12.public.thankYouTitle")}
            </h2>
            <p className="text-body text-text-secondary">
              {t("m12.public.thankYouBody", { institution: form.institutionName })}
            </p>
          </div>
        </Card>
      ) : (
        <>
          {!online && (
            <Banner tone="warning" title={t("common.shell.offlineTitle")}>
              {t("m12.public.offlineNotice")}
            </Banner>
          )}
          <Card>
            <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
              {errors.root && (
                <p role="alert" className="text-body-sm font-medium text-danger-text">
                  {t(rootKey)}
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label={t("m12.add.learner")}
                  required
                  error={errorFor("learnerName")}
                  {...rhf.register("learnerName")}
                />
                <Input
                  label={t("m12.add.contact")}
                  required
                  error={errorFor("contactName")}
                  {...rhf.register("contactName")}
                />
                <Input
                  label={t("m12.add.phone")}
                  type="tel"
                  error={errorFor("contactPhone")}
                  {...rhf.register("contactPhone", cleanPhone)}
                />
                <Input
                  label={t("m12.add.email")}
                  type="email"
                  error={errorFor("contactEmail")}
                  {...rhf.register("contactEmail", optional)}
                />
                {form.programs.length > 0 && (
                  <Select
                    label={t("m12.add.program")}
                    error={errorFor("programId")}
                    options={programs}
                    {...rhf.register("programId", optional)}
                  />
                )}
                {form.campuses.length > 0 && (
                  <Select
                    label={t("m12.add.campus")}
                    error={errorFor("campusId")}
                    options={campuses}
                    {...rhf.register("campusId", optional)}
                  />
                )}
              </div>
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="m12-public-website">{t("m12.public.website")}</label>
                <input
                  id="m12-public-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  {...rhf.register("website")}
                />
              </div>
              <Checkbox
                label={t("m12.public.consent", { institution: form.institutionName })}
                required
                checked={consent}
                onCheckedChange={(checked) => {
                  rhf.setValue("consent", checked === true);
                  if (checked === true) rhf.clearErrors("consent");
                }}
                error={errorFor("consent")}
              />
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={!online}
                loading={submitEnquiry.isPending}
              >
                {t("m12.public.submit")}
              </Button>
            </form>
          </Card>
        </>
      )}
    </>
  );
}
