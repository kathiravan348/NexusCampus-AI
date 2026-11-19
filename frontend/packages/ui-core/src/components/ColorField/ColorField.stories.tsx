import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { DEFAULT_COLORS } from "../../theme/contrast";
import { ColorField } from "./ColorField";

const meta: Meta<typeof ColorField> = {
  title: "Components/ColorField",
  component: ColorField,
};

export default meta;
type Story = StoryObj<typeof ColorField>;

function DefaultView() {
  const t = useText();
  const [value, setValue] = useState(DEFAULT_COLORS.light["brand-primary"] ?? "");
  return (
    <div className="max-w-sm">
      <ColorField
        label={t("common.colorPicker")}
        description={t("common.optional")}
        value={value}
        pickerAriaLabel={t("common.colorPicker")}
        onChange={setValue}
      />
    </div>
  );
}

function ErrorView() {
  const t = useText();
  const [value, setValue] = useState("");
  return (
    <div className="max-w-sm">
      <ColorField
        label={t("common.colorPicker")}
        value={value}
        required
        error={t("common.required")}
        pickerAriaLabel={t("common.colorPicker")}
        onChange={setValue}
      />
    </div>
  );
}

function DisabledView() {
  const t = useText();
  return (
    <div className="max-w-sm">
      <ColorField
        label={t("common.colorPicker")}
        description={t("common.disabled")}
        value={DEFAULT_COLORS.light["brand-accent"] ?? ""}
        pickerAriaLabel={t("common.colorPicker")}
        disabled
        onChange={() => undefined}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};

export const Error: Story = {
  render: () => <ErrorView />,
};

export const Disabled: Story = {
  render: () => <DisabledView />,
};
