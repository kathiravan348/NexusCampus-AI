import type { Meta, StoryObj } from "@storybook/react-vite";
import { formatNumber, isPseudoLocale, useText } from "@nexus/i18n";
import { StatCard } from "./StatCard";

const meta: Meta<typeof StatCard> = {
  title: "Components/StatCard",
  component: StatCard,
};

export default meta;
type Story = StoryObj<typeof StatCard>;

function DefaultView({ locale }: { locale: string }) {
  const t = useText();
  const fmtLocale = isPseudoLocale(locale) ? "en" : locale;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label={t("term.learners")}
        value={formatNumber(1240, fmtLocale)}
        caption={t("common.active")}
        captionTone="positive"
      />
      <StatCard
        label={t("term.class")}
        value={formatNumber(36, fmtLocale)}
        caption={t("common.status")}
        captionTone="neutral"
      />
      <StatCard
        label={t("common.pending")}
        value={formatNumber(4, fmtLocale)}
        caption={t("common.error")}
        captionTone="negative"
      />
    </div>
  );
}

function LoadingView() {
  const t = useText();
  return (
    <div className="max-w-xs">
      <StatCard label={t("term.learners")} value="0" caption={t("common.loading")} loading />
    </div>
  );
}

export const Default: Story = {
  render: (_args, context) => <DefaultView locale={String(context.globals["locale"] ?? "en")} />,
};

export const Loading: Story = {
  render: () => <LoadingView />,
};
