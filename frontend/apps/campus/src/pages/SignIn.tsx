import { brand } from "@nexus/brand";
import { useText } from "@nexus/i18n";
import { DATA_MODE, useDemoTenants, useSession } from "@nexus/services";
import { Button, Card, DemoBanner, EmptyState } from "@nexus/ui-core";
import { Building2 } from "lucide-react";
import { useState } from "react";
import { personaLabelKey, useSwitchUser } from "../app/PersonaSwitch";
import { PlatformMark } from "../app/PlatformMark";
import { localeName } from "../app/LocaleSwitch";
import { RealSignIn } from "../app/RealSignIn";
import { useRuntime } from "../app/TenantRuntime";

/** Real installs sign in through Keycloak (NEX-060); mock builds pick a demo persona. */
export function SignIn() {
  return DATA_MODE === "real" ? <RealSignIn /> : <DemoSignIn />;
}

/** Demo sign-in: pick an institution and a persona; the prototype needs no password. */
function DemoSignIn() {
  const t = useText();
  const { locale } = useRuntime();
  const { session } = useSession();
  const tenants = useDemoTenants();
  const switchUser = useSwitchUser();
  const [busy, setBusy] = useState<string | null>(null);

  let body;
  if (tenants.isPending) {
    body = (
      <p role="status" className="text-body text-text-secondary">
        {t("common.loading")}
      </p>
    );
  } else if (tenants.isError) {
    body = (
      <EmptyState
        tone="error"
        title={t("m02.signIn.error")}
        action={
          <Button variant="secondary" onClick={() => void tenants.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  } else if (tenants.data.length === 0) {
    body = <EmptyState icon={<Building2 className="h-6 w-6" />} title={t("m02.signIn.empty")} />;
  } else {
    body = (
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tenants.data.map((tenant) => (
          <li key={tenant.tenantId}>
            <Card title={tenant.name} className="h-full">
              <p className="mb-3 text-body-sm text-text-secondary">
                {localeName(tenant.defaultLocale, locale)}
              </p>
              <div className="flex flex-wrap gap-2">
                {tenant.personas.map((p) => {
                  const role = t(personaLabelKey(p.labelKey));
                  const current = session?.userId === p.userId;
                  return (
                    <Button
                      key={p.userId}
                      size="sm"
                      variant={current ? "primary" : "secondary"}
                      loading={busy === p.userId}
                      aria-label={t("m02.signIn.signInAs", { institution: tenant.name, role })}
                      onClick={() => {
                        setBusy(p.userId);
                        void switchUser(tenant.tenantId, p.userId).finally(() => setBusy(null));
                      }}
                    >
                      {role}
                    </Button>
                  );
                })}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="min-h-screen bg-bg-ground text-text-primary">
      {DATA_MODE === "mock" && <DemoBanner />}
      <main id="main-content" className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-7">
        <header className="space-y-2">
          <div className="flex items-center gap-3 pb-2">
            <PlatformMark size="md" decorative />
            <span className="font-sans text-section-title font-semibold text-text-primary">
              {brand.name}
            </span>
          </div>
          <h1 className="font-sans text-page-title font-semibold">{t("m02.signIn.title")}</h1>
          <p className="text-body text-text-secondary">{t("m02.signIn.intro")}</p>
        </header>
        {body}
      </main>
    </div>
  );
}
