import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Field } from "./Field";

const meta: Meta<typeof Field> = {
  title: "Components/Field",
  component: Field,
};

export default meta;
type Story = StoryObj<typeof Field>;

function DefaultView() {
  const t = useText();
  return (
    <div className="max-w-sm space-y-4">
      <Field label={t("common.name")} htmlFor="story-field-1" description={t("common.optional")}>
        <input
          id="story-field-1"
          aria-describedby="story-field-1-description"
          className="h-10 w-full rounded-md border border-border-strong bg-bg-surface px-3 text-body text-text-primary"
        />
      </Field>
      <Field label={t("common.name")} htmlFor="story-field-2" required error={t("common.required")}>
        <input
          id="story-field-2"
          aria-invalid="true"
          aria-describedby="story-field-2-error"
          className="h-10 w-full rounded-md border border-danger bg-bg-surface px-3 text-body text-text-primary"
        />
      </Field>
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
