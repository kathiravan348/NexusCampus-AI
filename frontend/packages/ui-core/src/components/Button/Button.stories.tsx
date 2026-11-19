import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
};

export default meta;
type Story = StoryObj<typeof Button>;

function VariantsView() {
  const t = useText();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">{t("common.save")}</Button>
      <Button variant="secondary">{t("common.edit")}</Button>
      <Button variant="ghost">{t("common.cancel")}</Button>
      <Button variant="danger">{t("common.delete")}</Button>
    </div>
  );
}

function SizesView() {
  const t = useText();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">{t("common.save")}</Button>
      <Button size="md">{t("common.save")}</Button>
      <Button size="lg">{t("common.save")}</Button>
    </div>
  );
}

function StatesView() {
  const t = useText();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button loading>{t("common.loading")}</Button>
      <Button disabled>{t("common.save")}</Button>
      <Button variant="secondary" disabled>
        {t("common.edit")}
      </Button>
    </div>
  );
}

export const Default: Story = {
  render: () => <VariantsView />,
};

export const Sizes: Story = {
  render: () => <SizesView />,
};

export const LoadingAndDisabled: Story = {
  render: () => <StatesView />,
};
