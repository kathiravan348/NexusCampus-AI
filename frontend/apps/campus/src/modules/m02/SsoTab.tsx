import type { SsoProvider } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { SsoProviderInputSchema, useSaveSsoProvider, useSsoProviders } from "@nexus/services";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@nexus/ui-core";
import { KeyRound, Lock } from "lucide-react";
import { useEffect, useState } from "react";

interface Draft {
  protocol: "oidc" | "saml2";
  name: string;
  issuerUrl: string;
  clientId: string;
  domains: string;
  scimEnabled: boolean;
  enabled: boolean;
}

const NEW = "new";
const EMPTY: Draft = {
  protocol: "oidc",
  name: "",
  issuerUrl: "https://",
  clientId: "",
  domains: "",
  scimEnabled: false,
  enabled: false,
};

function draftOf(p: SsoProvider | undefined): Draft {
  if (!p) return EMPTY;
  return { ...p, domains: p.domains.join(", ") };
}

type Field = "name" | "issuerUrl" | "clientId" | "domains";

/** SSO provider settings (OIDC / SAML 2). The client secret is never shown or stored here (E-1). */
export function SsoTab({ online }: { readonly online: boolean }) {
  const t = useText();
  const toast = useToast();
  const providers = useSsoProviders();
  const save = useSaveSsoProvider();
  const [selected, setSelected] = useState<string>("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const items = providers.data?.items ?? [];
  const current = items.find((p) => p.id === selected);
  const selectedId = selected || items[0]?.id || NEW;

  useEffect(() => {
    setDraft(draftOf(items.find((p) => p.id === selectedId)));
    setErrors({});
    // Reset the form when the chosen provider (or its saved data) changes.
  }, [selectedId, providers.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (providers.isPending) return <Skeleton className="h-64 w-full" />;
  if (providers.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m02.access.error")}
        action={
          <Button variant="secondary" onClick={() => void providers.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const onSave = async () => {
    const parsed = SsoProviderSchemaFor(draft, current);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]) as Field;
        next[field] = t(
          field === "issuerUrl"
            ? "m02.sso.httpsOnly"
            : field === "domains"
              ? "m02.sso.domainsInvalid"
              : "common.required",
        );
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      const saved = await save.mutateAsync({
        ...(current ? { id: current.id } : {}),
        data: parsed.data,
      });
      setSelected(saved.id);
      toast.show({ tone: "success", title: t("m02.sso.saved") });
    } catch {
      toast.show({ tone: "danger", title: t("m02.access.saveFailed") });
    }
  };

  return (
    <Card title={t("m02.sso.title")}>
      <div className="space-y-4">
        <Select
          label={t("m02.sso.provider")}
          options={[
            ...items.map((p) => ({ value: p.id, label: p.name })),
            { value: NEW, label: t("m02.sso.add") },
          ]}
          value={selectedId}
          onChange={(e) => setSelected(e.target.value)}
          containerClassName="max-w-md"
        />
        {items.length === 0 && (
          <EmptyState icon={<KeyRound className="h-6 w-6" />} title={t("m02.sso.empty")} />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("m02.sso.protocol")}
            options={[
              { value: "oidc", label: t("m02.sso.protocolOidc") },
              { value: "saml2", label: t("m02.sso.protocolSaml") },
            ]}
            value={draft.protocol}
            onChange={(e) => set("protocol", e.target.value as Draft["protocol"])}
          />
          <Input
            label={t("common.name")}
            required
            value={draft.name}
            error={errors.name}
            onChange={(e) => set("name", e.target.value)}
          />
          <Input
            label={t("m02.sso.issuerUrl")}
            required
            inputMode="url"
            value={draft.issuerUrl}
            error={errors.issuerUrl}
            onChange={(e) => set("issuerUrl", e.target.value)}
          />
          <Input
            label={t("m02.sso.clientId")}
            required
            value={draft.clientId}
            error={errors.clientId}
            onChange={(e) => set("clientId", e.target.value)}
          />
          <Input
            label={t("m02.sso.domains")}
            description={t("m02.sso.domainsHint")}
            required
            value={draft.domains}
            error={errors.domains}
            onChange={(e) => set("domains", e.target.value)}
            containerClassName="sm:col-span-2"
          />
        </div>
        <div className="flex flex-wrap gap-6">
          <Switch
            label={t("m02.sso.scim")}
            checked={draft.scimEnabled}
            onCheckedChange={(v) => set("scimEnabled", v)}
          />
          <Switch
            label={t("common.enabled")}
            checked={draft.enabled}
            onCheckedChange={(v) => set("enabled", v)}
          />
        </div>
        <p className="flex items-start gap-2 rounded-md border border-border-default bg-bg-raised px-4 py-3 text-body-sm text-text-secondary">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("m02.sso.secretNote")}
        </p>
        <Button loading={save.isPending} disabled={!online} onClick={() => void onSave()}>
          {t("common.save")}
        </Button>
      </div>
    </Card>
  );
}

function SsoProviderSchemaFor(draft: Draft, current: SsoProvider | undefined) {
  return SsoProviderInputSchema.safeParse({
    institutionId: current?.institutionId ?? null,
    protocol: draft.protocol,
    name: draft.name,
    issuerUrl: draft.issuerUrl.trim(),
    clientId: draft.clientId,
    domains: draft.domains
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    scimEnabled: draft.scimEnabled,
    enabled: draft.enabled,
  });
}
