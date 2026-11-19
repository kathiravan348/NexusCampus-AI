import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Tabs } from "./Tabs";

const meta: Meta<typeof Tabs> = {
  title: "Components/Tabs",
  component: Tabs,
};

export default meta;
type Story = StoryObj<typeof Tabs>;

function DefaultView() {
  const t = useText();
  return (
    <Tabs
      ariaLabel={t("common.details")}
      items={[
        {
          value: "learners",
          label: t("term.learners"),
          content: <p className="text-body text-text-secondary">{t("term.learners")}</p>,
        },
        {
          value: "class",
          label: t("term.class"),
          content: <p className="text-body text-text-secondary">{t("term.class")}</p>,
        },
        {
          value: "disabled",
          label: t("common.disabled"),
          content: <p className="text-body text-text-secondary">{t("common.disabled")}</p>,
          disabled: true,
        },
      ]}
    />
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
