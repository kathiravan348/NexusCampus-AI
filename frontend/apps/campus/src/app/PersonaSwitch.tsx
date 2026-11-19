import { MESSAGE_KEYS, useText, type MessageKey } from "@nexus/i18n";
import { useDemoTenants, useSession } from "@nexus/services";
import { Badge, Button, IconButton, Modal, useToast } from "@nexus/ui-core";
import { Building2, Users } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

const KNOWN_KEYS: ReadonlySet<string> = new Set(MESSAGE_KEYS);

/** A persona's label key from the server, or the generic one if the catalogue lacks it. */
export function personaLabelKey(labelKey: string): MessageKey {
  return KNOWN_KEYS.has(labelKey) ? (labelKey as MessageKey) : "m02.persona.user";
}

/**
 * Signs out the current user (refused while writes wait to sync, O-3) and signs in as another.
 * Returns `false` when sign-out was blocked; the user sees why.
 */
export function useSwitchUser(): (tenantId: string, userId: string) => Promise<boolean> {
  const { session, signIn, signOut } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useText();
  return useCallback(
    async (tenantId, userId) => {
      if (session?.tenantId === tenantId && session.userId === userId) {
        navigate("/", { replace: true });
        return true;
      }
      if (session) {
        const result = await signOut();
        if (result.blocked) {
          toast.show({
            tone: "danger",
            title: t("common.shell.signOutBlocked", { count: result.pending }),
          });
          return false;
        }
      }
      signIn(tenantId, userId);
      navigate("/", { replace: true });
      return true;
    },
    [session, signIn, signOut, navigate, toast, t],
  );
}

/** Demo only: switch to another persona of this tenant, or go back to pick another institution. */
export function PersonaSwitch() {
  const t = useText();
  const { session } = useSession();
  const tenants = useDemoTenants();
  const switchUser = useSwitchUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const personas = tenants.data?.find((d) => d.tenantId === session?.tenantId)?.personas ?? [];

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={t("common.shell.switchPersona")}
      trigger={
        <IconButton
          icon={<Users className="h-4 w-4" />}
          aria-label={t("common.shell.switchPersona")}
          variant="ghost"
          size="sm"
        />
      }
      footer={
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(false);
            navigate("/sign-in");
          }}
        >
          <Building2 className="h-4 w-4" aria-hidden="true" />
          {t("common.shell.switchInstitution")}
        </Button>
      }
    >
      {tenants.isPending ? (
        <p role="status" className="text-body text-text-secondary">
          {t("common.loading")}
        </p>
      ) : (
        <ul className="space-y-2">
          {personas.map((p) => {
            const current = p.userId === session?.userId;
            return (
              <li key={p.userId}>
                <Button
                  variant={current ? "secondary" : "ghost"}
                  className="w-full justify-between"
                  disabled={current}
                  onClick={() => {
                    if (!session) return;
                    void switchUser(session.tenantId, p.userId).then((done) => {
                      if (done) setOpen(false);
                    });
                  }}
                >
                  {t(personaLabelKey(p.labelKey))}
                  {current && <Badge tone="brand">{t("common.shell.current")}</Badge>}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
