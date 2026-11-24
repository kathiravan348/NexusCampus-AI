import type { Kpi } from "@nexus/contracts";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  isKnownMessageKey,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
} from "@nexus/i18n";
import { Card } from "@nexus/ui-core";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";

const trendIcons = { up: TrendingUp, down: TrendingDown, flat: Minus };

function formatValue(kpi: Kpi, locale: string, t: ReturnType<typeof useText>) {
  switch (kpi.unit) {
    case "count":
      return formatNumber(kpi.value, locale);
    case "percent":
      return t("m28.unit.percent", { value: formatNumber(kpi.value, locale) });
    case "minor_units":
      return kpi.currency === null ? null : formatMoney(kpi.value, kpi.currency, locale);
    case "days":
      return t("m28.unit.days", { value: kpi.value });
  }
}

export function KpiTile({ kpi }: { readonly kpi: Kpi }) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const displayLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const time = formatDateTime(kpi.asOf, { locale: displayLocale, timeZone });
  const TrendIcon = kpi.trend && trendIcons[kpi.trend];

  return (
    <li className="min-w-0">
      <Card className="h-full space-y-2">
        <h2 className="break-words text-body font-medium text-text-primary">
          {isKnownMessageKey(kpi.labelKey) ? t(kpi.labelKey) : t("m28.page.unknownKpi")}
        </h2>
        <p className="break-words font-mono text-number-lg text-text-primary tabular-nums">
          {formatValue(kpi, displayLocale, t)}
        </p>
        {TrendIcon && kpi.trend && (
          <p className="flex items-center gap-2 text-body-sm text-text-secondary">
            <TrendIcon aria-hidden="true" className="size-4 shrink-0" />
            {t(`m28.trend.${kpi.trend}`)}
          </p>
        )}
        <p className="text-body-sm text-text-secondary">
          <time dateTime={kpi.asOf}>{t("m28.page.asOf", { time })}</time>
        </p>
      </Card>
    </li>
  );
}
