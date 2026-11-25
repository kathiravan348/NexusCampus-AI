import type { PublicEnquiryForm as PublicEnquiryFormData } from "@nexus/contracts";
import {
  applyDirection,
  baseLanguage,
  I18nProvider,
  isPseudoLocale,
  LOCALE_CATALOGS,
  SOURCE_LOCALE,
  useText,
} from "@nexus/i18n";
import { ApiRequestError, DATA_MODE, usePublicEnquiryForm } from "@nexus/services";
import { Button, DemoBanner, EmptyState, Skeleton } from "@nexus/ui-core";
import { SearchX, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useOnline } from "../app/RouteGuard";
import { useRuntime } from "../app/TenantRuntime";
import { PublicEnquiryForm } from "./PublicEnquiryForm";

export const PUBLIC_LOCALE_KEY_PREFIX = "nexus.publicLocale.";

function readSavedLocale(formId: string | undefined): string | null {
  if (!formId) return null;
  try {
    return localStorage.getItem(`${PUBLIC_LOCALE_KEY_PREFIX}${formId}`);
  } catch {
    return null;
  }
}

function writeSavedLocale(formId: string, locale: string): void {
  try {
    localStorage.setItem(`${PUBLIC_LOCALE_KEY_PREFIX}${formId}`, locale);
  } catch {
    // Not remembered; the pick still applies in this tab.
  }
}

function detectBrowserLocale(): string {
  if (typeof navigator === "undefined") return SOURCE_LOCALE;
  let candidates: readonly string[] = [];
  if (navigator.languages?.length) candidates = navigator.languages;
  else if (navigator.language) candidates = [navigator.language];
  for (const candidate of candidates) {
    try {
      const canonical = Intl.getCanonicalLocales(candidate)[0];
      if (!canonical || isPseudoLocale(canonical)) continue;
      const lang = baseLanguage(canonical);
      if (lang === SOURCE_LOCALE || Object.hasOwn(LOCALE_CATALOGS, lang)) return canonical;
    } catch {
      // Ignore malformed browser language tags.
    }
  }
  return SOURCE_LOCALE;
}

function resolveFormLocale(
  form: PublicEnquiryFormData | undefined,
  saved: string | null,
  fallback: string,
): string {
  if (!form) return fallback;
  return saved !== null && form.supportedLocales.includes(saved) ? saved : form.defaultLocale;
}

/** Public admissions enquiry page at `/apply/:formId` — no sign-in required (M12, D79). */
export function PublicEnquiry() {
  const { locale: runtimeLocale } = useRuntime();
  const online = useOnline();
  const { formId } = useParams<{ formId: string }>();
  const query = usePublicEnquiryForm(formId);
  const [fallbackLocale] = useState(detectBrowserLocale);
  const [pickedByForm, setPickedByForm] = useState<Readonly<Record<string, string>>>({});

  const notFound =
    !formId ||
    (query.isError &&
      query.error instanceof ApiRequestError &&
      (query.error.status === 404 || query.error.error.code === "not_found"));
  const form = notFound ? undefined : query.data;
  let saved: string | null = null;
  if (formId) saved = pickedByForm[formId] ?? readSavedLocale(formId);
  const locale = resolveFormLocale(form, saved, fallbackLocale);

  const runtimeLocaleRef = useRef(runtimeLocale);
  useEffect(() => {
    runtimeLocaleRef.current = runtimeLocale;
    applyDirection(locale);
  }, [locale, runtimeLocale]);
  useEffect(() => {
    return () => {
      applyDirection(runtimeLocaleRef.current);
    };
  }, []);

  const selectLocale = (next: string) => {
    if (!form || !form.supportedLocales.includes(next)) return;
    applyDirection(next);
    writeSavedLocale(form.id, next);
    setPickedByForm((prev) => ({ ...prev, [form.id]: next }));
  };

  return (
    <I18nProvider locale={locale} {...(form ? { typePack: form.institutionType } : {})}>
      <PublicEnquiryView
        notFound={notFound}
        form={form}
        isPending={query.isPending}
        error={query.isError ? query.error : null}
        onRetry={() => void query.refetch()}
        online={online}
        locale={locale}
        onLocaleChange={selectLocale}
      />
    </I18nProvider>
  );
}

interface PublicEnquiryViewProps {
  readonly notFound: boolean;
  readonly form: PublicEnquiryFormData | undefined;
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly online: boolean;
  readonly locale: string;
  readonly onLocaleChange: (locale: string) => void;
}

function PublicEnquiryView({
  notFound,
  form,
  isPending,
  error,
  onRetry,
  online,
  locale,
  onLocaleChange,
}: PublicEnquiryViewProps) {
  const t = useText();

  let body;
  if (notFound) {
    body = (
      <EmptyState
        icon={<SearchX className="h-6 w-6" />}
        title={t("m12.public.notFoundTitle")}
        description={t("m12.public.notFoundBody")}
      />
    );
  } else if (isPending) {
    body = (
      <div role="status" aria-busy="true" className="space-y-4">
        <p className="sr-only">{t("common.loading")}</p>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else if (error || !form) {
    const offline = !online || (error instanceof ApiRequestError && error.offline);
    body = (
      <EmptyState
        tone={offline ? "neutral" : "error"}
        icon={offline ? <WifiOff className="h-6 w-6" /> : undefined}
        title={t(offline ? "common.shell.offlineTitle" : "m12.public.loadError")}
        description={offline ? t("m12.public.offlineNotice") : undefined}
        action={
          <Button variant="secondary" disabled={!online} onClick={onRetry}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  } else {
    body = (
      <PublicEnquiryForm
        key={form.id}
        form={form}
        online={online}
        locale={locale}
        onLocaleChange={onLocaleChange}
      />
    );
  }

  return (
    <div className="min-h-screen bg-bg-ground text-text-primary">
      {DATA_MODE === "mock" && <DemoBanner />}
      <main id="main-content" className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        {!form && <h1 className="sr-only">{t("m12.public.title")}</h1>}
        {body}
      </main>
    </div>
  );
}
