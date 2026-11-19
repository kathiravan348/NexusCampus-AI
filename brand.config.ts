/**
 * Single source of truth for platform brand names.
 * Renaming the platform = change this file only.
 * An institution's own name, theme, fonts and texts are tenant data, never here.
 */
export const brand = {
  name: "NexusCampus",
  tagline: "Every institution. Every learner. Anywhere.",
  products: {
    campus: { name: "NexusCampus", short: "Campus", description: "The web and mobile app for every role" },
    studio: { name: "Nexus Studio", short: "Studio", description: "Theme, text and configuration studio" },
    assist: { name: "Nexus Assist", short: "Assist", description: "AI helper, optional per institution" },
    edge: { name: "Nexus Edge", short: "Edge", description: "On-campus offline server" },
    control: { name: "Nexus Control", short: "Control", description: "Provider platform: subscribers, licences, releases, support" },
    agent: { name: "Nexus Agent", short: "Agent", description: "Install agent: licence, updates, health" },
    vault: { name: "Nexus Vault", short: "Vault", description: "Per-institution keys and access grants" },
    core: { name: "Nexus Core", short: "Core", description: "Identity, tenancy, audit" },
    ui: { name: "Nexus UI", short: "UI", description: "Shared component library" },
    style: { name: "Nexus Style", short: "Style", description: "Design system and theme tokens" },
  },
} as const;

export type ProductKey = keyof typeof brand.products;
