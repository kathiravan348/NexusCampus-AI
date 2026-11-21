import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { nexusAliases } from "../../../vite.aliases.ts";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: [
    "../src/**/*.stories.tsx",
    "../../ui-core/src/**/*.stories.tsx",
    "../../ui-edu/src/**/*.stories.tsx",
    "../../ui-control/src/**/*.stories.tsx",
  ],
  addons: ["@storybook/addon-a11y"],
  async viteFinal(config) {
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        alias: nexusAliases,
      },
    });
  },
};

export default config;
