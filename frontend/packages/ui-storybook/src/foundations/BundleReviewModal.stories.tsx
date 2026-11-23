import { useText } from "@nexus/i18n";
import { Button } from "@nexus/ui-core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import {
  BundleReviewModal,
  type BundleDecisionError,
  type BundleReviewModalProps,
} from "../../../../apps/campus/src/modules/m84/BundleReviewModal";

function ReviewExample(props: BundleReviewModalProps) {
  const t = useText();
  const [open, setOpen] = useState(true);
  const [retried, setRetried] = useState(false);
  return open ? (
    <BundleReviewModal
      {...props}
      content={retried ? example : props.content}
      loadError={retried ? null : props.loadError}
      onRetry={() => setRetried(true)}
      onClose={() => setOpen(false)}
    />
  ) : (
    <Button onClick={() => setOpen(true)}>{t("m84.bundle.review")}</Button>
  );
}

const example = JSON.stringify(
  {
    format: "nexus-diagnostics/1",
    id: "dgn-example",
    settings: { installMode: "self_hosted" },
    logs: [
      "INFO path=/api/v1/install/diagnostics/example-with-a-long-line-for-a-small-display status=200",
    ],
  },
  null,
  2,
);

const meta = {
  title: "Campus/Bundle review",
  component: BundleReviewModal,
  render: (args) => <ReviewExample {...args} />,
  args: {
    content: example,
    loadError: null,
    pendingDecision: null,
    onDecide: (): Promise<BundleDecisionError | null> => Promise.resolve(null),
    onRetry: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof BundleReviewModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Loading: Story = { args: { content: undefined } };
export const Empty: Story = { args: { content: "" } };
export const LoadFailed: Story = { args: { content: undefined, loadError: "other" } };
export const Offline: Story = { args: { content: undefined, loadError: "offline" } };
export const Approving: Story = { args: { pendingDecision: "approve" } };
export const AlreadyReviewed: Story = { args: { onDecide: () => Promise.resolve("conflict") } };
