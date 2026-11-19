import type { Meta, StoryObj } from "@storybook/react-vite";
import { BookOpen, GraduationCap, Users } from "lucide-react";
import { useText } from "@nexus/i18n";
import { Card } from "../Card/Card";
import { DemoBanner } from "../DemoBanner/DemoBanner";
import { NavItem } from "../NavItem/NavItem";
import { SyncStatus } from "../SyncStatus/SyncStatus";
import { AppShell } from "./AppShell";

const meta: Meta<typeof AppShell> = {
  title: "Components/AppShell",
  component: AppShell,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof AppShell>;

function DefaultView() {
  const t = useText();
  return (
    <AppShell
      brand={
        <span className="font-sans text-card-title font-semibold text-text-primary">
          NexusCampus
        </span>
      }
      banner={<DemoBanner />}
      title={t("term.learners")}
      actions={<SyncStatus state="synced" lastSyncedAt="10:42" />}
      nav={
        <>
          <NavItem icon={<Users className="h-4 w-4" />} active>
            {t("term.learners")}
          </NavItem>
          <NavItem icon={<BookOpen className="h-4 w-4" />}>{t("term.class")}</NavItem>
          <NavItem icon={<GraduationCap className="h-4 w-4" />}>{t("term.teacher")}</NavItem>
        </>
      }
      navFooter={<span className="text-body-sm text-text-muted">{t("common.active")}</span>}
    >
      <Card title={t("common.details")}>
        <p className="text-body text-text-secondary">{t("term.learners")}</p>
      </Card>
    </AppShell>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
