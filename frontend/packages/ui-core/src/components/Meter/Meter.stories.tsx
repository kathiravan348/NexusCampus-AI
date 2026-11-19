import type { Meta, StoryObj } from "@storybook/react-vite";
import { formatNumber, useText } from "@nexus/i18n";
import { Meter } from "./Meter";

const meta: Meta<typeof Meter> = {
  title: "Components/Meter",
  component: Meter,
};

export default meta;
type Story = StoryObj<typeof Meter>;

function States() {
  const t = useText();
  const n = (v: number) => formatNumber(v, "en");
  return (
    <div className="max-w-md space-y-6">
      <Meter
        label={t("common.status")}
        value={420}
        max={1000}
        valueText={`${n(420)} / ${n(1000)}`}
      />
      <Meter
        label={t("common.pending")}
        value={850}
        max={1000}
        valueText={`${n(850)} / ${n(1000)}`}
      />
      <Meter
        label={t("common.error")}
        value={1020}
        max={1000}
        valueText={`${n(1020)} / ${n(1000)}`}
      />
      <Meter label={t("common.active")} value={37} max={null} valueText={n(37)} />
      <Meter label={t("common.loading")} value={0} max={1} valueText="" loading />
    </div>
  );
}

export const AllStates: Story = { render: () => <States /> };
