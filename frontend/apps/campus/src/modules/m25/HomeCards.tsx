import type { HomeCard, HomeCardSeverity } from "@nexus/contracts";
import {
  formatNumber,
  isKnownMessageKey,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { Badge, Card, type BadgeProps } from "@nexus/ui-core";
import { Link } from "react-router";
import { useRuntime } from "../../app/TenantRuntime";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

const SEVERITY_BADGE: Readonly<Record<HomeCardSeverity, readonly [MessageKey, BadgeTone]>> = {
  info: ["m25.severity.info", "info"],
  warning: ["m25.severity.warning", "warning"],
  critical: ["m25.severity.critical", "danger"],
};

const CARD_LINK_CLASS =
  "block h-full min-h-11 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-ground";

const COUNT_CLASS = "block font-mono text-number-lg text-text-primary tabular-nums";

interface HomeCardItemProps {
  readonly card: HomeCard;
  readonly locale: string;
}

function HomeCardItem({ card, locale }: HomeCardItemProps) {
  const t = useText();
  const title = isKnownMessageKey(card.titleKey) ? t(card.titleKey) : card.titleKey;
  const severity = card.severity ? SEVERITY_BADGE[card.severity] : null;

  return (
    <li>
      <Link to={card.href} className={CARD_LINK_CLASS}>
        <Card className="h-full min-h-11 transition-colors hover:bg-bg-raised">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <span className="block break-words text-body font-medium text-text-primary">
                {title}
              </span>
              {card.count !== null && (
                <span className={COUNT_CLASS}>{formatNumber(card.count, locale)}</span>
              )}
            </div>
            {severity && (
              <Badge tone={severity[1]} className="shrink-0">
                {t(severity[0])}
              </Badge>
            )}
          </div>
        </Card>
      </Link>
    </li>
  );
}

export interface HomeCardsProps {
  readonly cards: readonly HomeCard[];
  readonly childCount: number;
}

/** Family home summary cards with localized counts, severity text, and module links. */
export function HomeCards({ cards, childCount }: HomeCardsProps) {
  const t = useText();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  return (
    <div className="space-y-3">
      {childCount > 1 && (
        <p className="text-body-sm text-text-secondary">{t("m25.cards.allChildrenNote")}</p>
      )}
      <ul
        aria-label={t("m25.cards.listLabel")}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cards.map((card) => (
          <HomeCardItem
            key={`${card.kind}-${card.moduleId}-${card.href}`}
            card={card}
            locale={safeLocale}
          />
        ))}
      </ul>
    </div>
  );
}
