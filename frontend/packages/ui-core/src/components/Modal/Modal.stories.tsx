import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Button } from "../Button/Button";
import { Modal } from "./Modal";

const meta: Meta<typeof Modal> = {
  title: "Components/Modal",
  component: Modal,
};

export default meta;
type Story = StoryObj<typeof Modal>;

function DefaultView() {
  const t = useText();
  const [open, setOpen] = React.useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={<Button>{t("common.details")}</Button>}
      title={t("common.details")}
      description={t("common.notes")}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => setOpen(false)}>{t("common.save")}</Button>
        </>
      }
    >
      <p className="text-body text-text-secondary">{t("term.learners")}</p>
    </Modal>
  );
}

function SizesView() {
  const t = useText();
  const [size, setSize] = React.useState<"md" | "lg" | "xl" | null>(null);

  return (
    <div className="flex flex-wrap gap-3">
      {(["md", "lg", "xl"] as const).map((variant) => (
        <Button key={variant} variant="secondary" onClick={() => setSize(variant)}>
          {variant.toUpperCase()}
        </Button>
      ))}
      <Modal
        open={size !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSize(null);
        }}
        size={size ?? "md"}
        title={t("common.details")}
        footer={<Button onClick={() => setSize(null)}>{t("common.close")}</Button>}
      >
        <p className="text-body text-text-secondary">{t("common.notes")}</p>
      </Modal>
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};

export const Sizes: Story = {
  render: () => <SizesView />,
};
