import type { Meta, StoryObj } from "@storybook/react-vite";
import { BookOpen, GraduationCap, Users } from "lucide-react";
import { useText } from "@nexus/i18n";
import { NavItem } from "./NavItem";

const meta: Meta<typeof NavItem> = {
  title: "Components/NavItem",
  component: NavItem,
};

export default meta;
type Story = StoryObj<typeof NavItem>;

function DefaultView() {
  const t = useText();
  return (
    <nav
      aria-label={t("common.mainNavigation")}
      className="w-60 space-y-1 bg-bg-sidebar p-3 rounded-lg border border-border-default"
    >
      <NavItem icon={<Users className="h-4 w-4" />} active>
        {t("term.learners")}
      </NavItem>
      <NavItem icon={<BookOpen className="h-4 w-4" />}>{t("term.class")}</NavItem>
      <NavItem icon={<GraduationCap className="h-4 w-4" />} disabled>
        {t("term.teacher")}
      </NavItem>
    </nav>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
