import type { IssuedDocument, SignatureMethod } from "@nexus/contracts";
import {
  formatDate,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { Badge } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";
import { RevokeDialog } from "./RevokeDialog";

const methodKeys: Readonly<Record<SignatureMethod, MessageKey>> = {
  drawn: "m23.method.drawn",
  digital_certificate: "m23.method.digitalCertificate",
  otp: "m23.method.otp",
};

interface Props {
  readonly document: IssuedDocument;
  readonly showReason: boolean;
  readonly canRevoke: boolean;
}

export function DocumentView({ document, showReason, canRevoke }: Props) {
  const t = useText();
  const { locale } = useRuntime();
  const local = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  return (
    <article className="space-y-4 rounded-lg border border-border-default bg-bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section-title font-semibold">{t(`m23.kind.${document.kind}`)}</h2>
        {document.revoked && <Badge tone="warning">{t("m23.view.revoked")}</Badge>}
      </header>
      <dl className="grid gap-4 break-words sm:grid-cols-2">
        <div>
          <dt>{t("m23.view.number")}</dt>
          <dd>
            <bdi>{document.number}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t("m23.view.issuedOn")}</dt>
          <dd>{formatDate(document.issuedOn, { locale: local })}</dd>
        </div>
        <div>
          <dt>{t("m23.view.code")}</dt>
          <dd>
            <bdi>{document.verificationCode}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t("m23.view.signatures")}</dt>
          <dd>
            {formatNumber(document.signatures.length, local)}
            {document.signatures.length > 0 && (
              <ul>
                {document.signatures.map((signature, index) => (
                  <li key={index}>{t(methodKeys[signature.method])}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        {showReason && document.revoked && document.revokedReason && (
          <div className="sm:col-span-2">
            <dt>{t("m23.revoke.reason")}</dt>
            <dd className="whitespace-pre-wrap">{document.revokedReason}</dd>
          </div>
        )}
      </dl>
      {canRevoke && <RevokeDialog document={document} />}
    </article>
  );
}
