import { useControlText } from "@nexus/i18n/control";
import { ApiRequestError } from "@nexus/services";
import { useControlServices, useStaffCan, useStaffSession } from "@nexus/services/control";
import { Button, EmptyState } from "@nexus/ui-core";
import { ShieldOff } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, Navigate } from "react-router";
import type { ControlModuleEntry } from "./modules";

function Loading() {
  const t = useControlText();
  return (
    <p role="status" className="text-body text-text-secondary">
      {t("common.loading")}
    </p>
  );
}

/** Shown when the staff member's roles do not include a page (deny by default, V-1). */
export function NoAccess() {
  const t = useControlText();
  return (
    <EmptyState
      icon={<ShieldOff className="h-6 w-6" />}
      title={t("common.shell.forbiddenTitle")}
      description={t("common.shell.forbiddenBody")}
      action={
        <Button asChild variant="secondary">
          <Link to="/">{t("common.shell.goHome")}</Link>
        </Button>
      }
    />
  );
}

/**
 * Without a signed-in staff member → sign-in. An expired or unknown staff session (401) signs out.
 * With `module`, the page opens only when the staff member has its permission.
 */
export function StaffGuard({
  module,
  children,
}: {
  readonly module?: ControlModuleEntry;
  readonly children: ReactNode;
}) {
  const { staffId, signOut } = useControlServices();
  const session = useStaffSession();
  const can = useStaffCan();
  const unauthorized = session.error instanceof ApiRequestError && session.error.status === 401;

  useEffect(() => {
    if (unauthorized) signOut();
  }, [unauthorized, signOut]);

  if (staffId === null || unauthorized) return <Navigate to="/sign-in" replace />;
  if (session.isPending) return <Loading />;
  if (session.isError) return <EmptyState tone="error" />;
  if (module && !can(module.permission)) return <NoAccess />;
  return <>{children}</>;
}
