import { brand } from "@nexus/brand";
import { useControlText } from "@nexus/i18n/control";
import { controlSignInUrl, useControlServices, useDemoStaff } from "@nexus/services/control";
import { Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { ChevronRight, KeyRound } from "lucide-react";
import { Navigate, useNavigate } from "react-router";
import { ROLE_KEY } from "../app/roles";

function Heading() {
  const t = useControlText();
  return (
    <div className="flex items-center gap-3">
      <img src={brand.logo.mark} alt="" className="h-10 w-10" />
      <h1 className="font-sans text-page-title font-semibold text-text-primary">
        {t("ctl.signIn.title", { product: brand.products.control.name })}
      </h1>
    </div>
  );
}

/** Real mode (NEX-100): one link to the control backend — password, then a one-time code (P13). */
function WorkAccountSignIn() {
  const t = useControlText();
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <Heading />
      <p className="text-body text-text-secondary">{t("ctl.signIn.ssoIntro")}</p>
      <Button asChild>
        <a href={controlSignInUrl("/")}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {t("ctl.signIn.sso")}
        </a>
      </Button>
    </main>
  );
}

/** Sign-in: the work account in real mode; in the demo, pick a staff member. */
export function SignIn() {
  const { staffId, mode } = useControlServices();
  if (staffId !== null) return <Navigate to="/" replace />;
  return mode === "real" ? <WorkAccountSignIn /> : <DemoSignIn />;
}

function DemoSignIn() {
  const t = useControlText();
  const navigate = useNavigate();
  const { signIn } = useControlServices();
  const demo = useDemoStaff();

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <Heading />
      <p className="text-body text-text-secondary">{t("ctl.signIn.intro")}</p>
      {demo.isPending ? (
        <Skeleton className="h-40" />
      ) : demo.isError ? (
        <EmptyState tone="error" />
      ) : demo.data.items.length === 0 ? (
        <EmptyState description={t("ctl.signIn.noStaff")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border-default">
            {demo.data.items.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-label={t("ctl.signIn.as", { name: s.displayName })}
                  className="flex w-full items-center gap-3 px-2 py-3 text-start hover:bg-bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  onClick={() => {
                    signIn(s.id);
                    navigate("/", { replace: true });
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium text-text-primary">
                      {s.displayName}
                    </span>
                    <span className="block text-body-sm text-text-secondary">
                      {s.roles.map((r) => t(ROLE_KEY[r])).join(", ")}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 text-text-secondary rtl:-scale-x-100"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
