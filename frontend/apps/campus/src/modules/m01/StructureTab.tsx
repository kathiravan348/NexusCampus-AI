import type { Campus, Institution } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import type { TenantResponse } from "@nexus/services";
import { Badge, Button, Card } from "@nexus/ui-core";
import { Building2, MapPin, Network, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { CampusFormModal } from "./CampusFormModal";
import { REGION_KEY, TYPE_KEY } from "./formErrors";

export interface StructureTabProps {
  readonly tenant: TenantResponse;
  readonly online: boolean;
}

interface ModalState {
  readonly institutionId: string;
  readonly defaultCountryCode: string;
  readonly campus: Campus | null;
}

function formatAddress(campus: Campus): string {
  const { line1, line2, city, region, postalCode, countryCode } = campus.address;
  return [line1, line2, city, region, postalCode, countryCode].filter(Boolean).join(", ");
}

/** Group → institution → campus hierarchy with modal add/edit campus forms (M01, E-6). */
export function StructureTab({ tenant, online }: StructureTabProps) {
  const t = useText();
  const [modal, setModal] = useState<ModalState | null>(null);

  const openAdd = (institution: Institution) =>
    setModal({
      institutionId: institution.id,
      defaultCountryCode: institution.locale.country,
      campus: null,
    });

  const openEdit = (institution: Institution, campus: Campus) =>
    setModal({
      institutionId: institution.id,
      defaultCountryCode: institution.locale.country,
      campus,
    });

  const renderInstitution = (institution: Institution) => {
    const campuses = tenant.campuses.filter((c) => c.institutionId === institution.id);
    return (
      <li key={institution.id} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-bg-raised p-4">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 shrink-0 text-brand-primary-text" aria-hidden="true" />
            <span className="font-sans text-card-title font-semibold text-text-primary">
              {institution.name}
            </span>
            <Badge tone="brand">{t("m01.structure.institutionBadge")}</Badge>
            <Badge tone="neutral">{t(TYPE_KEY[institution.type])}</Badge>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!online}
            onClick={() => openAdd(institution)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("m01.structure.addCampus")}
          </Button>
        </div>

        <div className="ms-4 border-s border-border-default ps-4 sm:ms-6 sm:ps-5">
          {campuses.length === 0 ? (
            <p className="text-body-sm text-text-muted">{t("m01.structure.noCampuses")}</p>
          ) : (
            <ul className="space-y-3">
              {campuses.map((campus) => (
                <li
                  key={campus.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border-default bg-bg-surface p-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                      <span className="text-body font-semibold text-text-primary">
                        {campus.name}
                      </span>
                      <Badge tone="neutral">{campus.code}</Badge>
                    </div>
                    <p className="text-body-sm text-text-secondary">{formatAddress(campus)}</p>
                    <p className="text-body-sm text-text-muted">
                      {campus.timeZone ??
                        t("m01.structure.inheritsTimeZone", {
                          timeZone: institution.locale.timeZone,
                        })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!online}
                    onClick={() => openEdit(institution, campus)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    {t("common.edit")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </li>
    );
  };

  return (
    <>
      <Card title={t("m01.structure.heading")}>
        {tenant.group ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-bg-raised p-4">
              <Network className="h-4 w-4 shrink-0 text-brand-primary-text" aria-hidden="true" />
              <span className="font-sans text-card-title font-semibold text-text-primary">
                {tenant.group.name}
              </span>
              <Badge tone="info">{t("m01.structure.groupBadge")}</Badge>
              <Badge tone="neutral">{t(REGION_KEY[tenant.group.region])}</Badge>
            </div>
            <ul className="ms-4 space-y-4 border-s border-border-default ps-4 sm:ms-6 sm:ps-5">
              {tenant.institutions.map(renderInstitution)}
            </ul>
          </div>
        ) : (
          <ul className="space-y-4">{tenant.institutions.map(renderInstitution)}</ul>
        )}
      </Card>

      {modal && (
        <CampusFormModal
          open
          onOpenChange={(next) => {
            if (!next) setModal(null);
          }}
          institutionId={modal.institutionId}
          defaultCountryCode={modal.defaultCountryCode}
          campus={modal.campus}
          online={online}
        />
      )}
    </>
  );
}
