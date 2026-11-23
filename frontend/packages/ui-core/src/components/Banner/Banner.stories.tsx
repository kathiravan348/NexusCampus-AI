import type { Meta, StoryObj } from "@storybook/react-vite";
import { I18nProvider, useText } from "@nexus/i18n";
import { Banner, type BannerTone } from "./Banner";

const meta: Meta<typeof Banner> = {
  title: "Components/Banner",
  component: Banner,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof Banner>;

function BannerView({ tone = "info", long = false }: { tone?: BannerTone; long?: boolean }) {
  const t = useText();
  return (
    <Banner tone={tone} title={t("common.status")}>
      {long ? `${t("common.demoNotice")} ${t("common.demoNotice")}` : t("common.demoNotice")}
    </Banner>
  );
}

export const Default: Story = {
  render: () => <BannerView tone="info" />,
};

export const Warning: Story = {
  render: () => <BannerView tone="warning" />,
};

export const LongText: Story = {
  render: () => (
    <div className="max-w-xs">
      <BannerView tone="warning" long />
    </div>
  ),
};

export const LightAndDark: Story = {
  render: () => (
    <div className="space-y-4">
      <div data-theme="light" className="bg-bg-ground p-2">
        <BannerView tone="warning" />
      </div>
      <div data-theme="dark" className="bg-bg-ground p-2">
        <BannerView tone="warning" />
      </div>
    </div>
  ),
};

export const PseudoLocale: Story = {
  render: () => (
    <I18nProvider locale="en-XA">
      <BannerView tone="warning" long />
    </I18nProvider>
  ),
};

export const Rtl: Story = {
  render: () => (
    <div dir="rtl">
      <BannerView tone="warning" long />
    </div>
  ),
};
