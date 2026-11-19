import type { Meta, StoryObj } from "@storybook/react-vite";
import { CONTRAST_PAIRS, contrastRatio, type ThemeName } from "@nexus/ui-core";
import tokens from "../../../ui-core/src/theme/tokens.json";
import { findSampleTheme } from "../sampleThemes";

const TYPE_CLASS: Readonly<Record<string, string>> = {
  display: "font-sans text-display",
  "page-title": "font-sans text-page-title",
  "section-title": "font-sans text-section-title",
  "card-title": "font-sans text-card-title",
  body: "font-sans text-body",
  "body-sm": "font-sans text-body-sm",
  label: "font-sans text-label uppercase",
  "number-lg": "font-mono text-number-lg",
  number: "font-mono text-number",
  "number-sm": "font-mono text-number-sm",
};

function resolvedColorMap(mode: ThemeName, tenantThemeId: string): Record<string, string> {
  const base = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value[mode]]));
  const overrides = findSampleTheme(tenantThemeId)?.theme[mode];
  return overrides ? { ...base, ...overrides } : base;
}

function TokensCatalogue({ tenantThemeId }: { tenantThemeId: string }) {
  const activeSample = findSampleTheme(tenantThemeId);
  const lightColors = resolvedColorMap("light", tenantThemeId);
  const darkColors = resolvedColorMap("dark", tenantThemeId);

  return (
    <main className="mx-auto max-w-5xl space-y-6 text-text-primary">
      <header className="space-y-1">
        <h1 className="text-page-title">Nexus Style — Design Tokens</h1>
        <p className="text-body-sm text-text-secondary">
          Live tokens from <code className="font-mono">tokens.json</code>. Toggle Theme and Tenant
          in the toolbar to preview overrides
          {activeSample ? ` — active tenant: ${activeSample.label}` : " — Nexus Default"}.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="tokens-colors-heading">
        <h2 id="tokens-colors-heading" className="text-section-title">
          Colours
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tokens.color.tokens.map((token) => {
            const lightHex = lightColors[token.name] ?? token.value.light;
            const darkHex = darkColors[token.name] ?? token.value.dark;
            return (
              <div
                key={token.name}
                className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-10 w-10 shrink-0 rounded-md border border-border-strong"
                    style={{ backgroundColor: `var(--${token.name})` }}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-body-sm font-medium text-text-primary">
                      --{token.name}
                    </div>
                    <div className="font-mono text-number-sm text-text-muted">
                      L {lightHex} · D {darkHex}
                    </div>
                  </div>
                </div>
                <p className="text-body-sm text-text-secondary">{token.usage}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="tokens-contrast-heading">
        <h2 id="tokens-contrast-heading" className="text-section-title">
          WCAG 2.2 Contrast Pairs
        </h2>
        <div
          role="region"
          aria-label="WCAG 2.2 contrast pairs table"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard access for scrollable table
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface"
        >
          <table className="w-full border-collapse text-start text-body-sm">
            <thead>
              <tr className="border-b border-border-default bg-bg-raised text-label uppercase text-text-muted">
                <th scope="col" className="px-4 py-3 text-start">
                  Pair (fg / bg)
                </th>
                <th scope="col" className="px-4 py-3 text-start">
                  Preview
                </th>
                <th scope="col" className="px-4 py-3 text-start">
                  Usage
                </th>
                <th scope="col" className="px-4 py-3 text-end">
                  Min
                </th>
                <th scope="col" className="px-4 py-3 text-end">
                  Light
                </th>
                <th scope="col" className="px-4 py-3 text-end">
                  Dark
                </th>
              </tr>
            </thead>
            <tbody>
              {CONTRAST_PAIRS.map((pair) => {
                const lFg = lightColors[pair.fg];
                const lBg = lightColors[pair.bg];
                const dFg = darkColors[pair.fg];
                const dBg = darkColors[pair.bg];
                const lightRatio = lFg && lBg ? contrastRatio(lFg, lBg) : 0;
                const darkRatio = dFg && dBg ? contrastRatio(dFg, dBg) : 0;
                const lightPass = lightRatio >= pair.minRatio;
                const darkPass = darkRatio >= pair.minRatio;

                return (
                  <tr
                    key={`${pair.fg}-${pair.bg}`}
                    className="border-b border-border-default last:border-b-0"
                  >
                    <td className="px-4 py-2 font-mono text-number-sm">
                      {pair.fg} / {pair.bg}
                    </td>
                    <td className="px-4 py-2">
                      {pair.minRatio >= 4.5 ? (
                        <span
                          className="inline-block rounded-xs border border-border-default px-2 py-0.5 text-body-sm font-medium"
                          style={{
                            color: `var(--${pair.fg})`,
                            backgroundColor: `var(--${pair.bg})`,
                          }}
                        >
                          Aa
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="inline-flex items-center justify-center rounded-xs border border-border-default p-1.5"
                          style={{ backgroundColor: `var(--${pair.bg})` }}
                        >
                          <span
                            className="block h-2.5 w-6 rounded-xs"
                            style={{ backgroundColor: `var(--${pair.fg})` }}
                          />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{pair.usage}</td>
                    <td className="px-4 py-2 text-end font-mono text-number-sm text-text-muted">
                      {pair.minRatio}:1
                    </td>
                    <td className="px-4 py-2 text-end font-mono text-number-sm">
                      <span className={lightPass ? "text-success-text" : "text-danger-text"}>
                        {lightRatio.toFixed(2)}:1
                      </span>
                    </td>
                    <td className="px-4 py-2 text-end font-mono text-number-sm">
                      <span className={darkPass ? "text-success-text" : "text-danger-text"}>
                        {darkRatio.toFixed(2)}:1
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="tokens-type-heading">
        <h2 id="tokens-type-heading" className="text-section-title">
          Type Scale
        </h2>
        <div className="space-y-4">
          {tokens.type.groups.map((group) => (
            <div
              key={group.name}
              className="rounded-lg border border-border-default bg-bg-surface p-4"
            >
              <h3 className="mb-3 text-label uppercase text-text-muted">
                {group.name} ({group.family})
              </h3>
              <div className="divide-y divide-border-default">
                {group.styles.map((style) => (
                  <div
                    key={style.name}
                    className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between"
                  >
                    <div className={TYPE_CLASS[style.name] ?? "text-body"}>
                      {group.family === "mono" ? "1,250.00 · 98.4%" : `NexusCampus — ${style.name}`}
                    </div>
                    <div className="font-mono text-number-sm text-text-muted">
                      {style.fontSize} / {style.lineHeight} · w{style.fontWeight}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3" aria-labelledby="tokens-spacing-heading">
          <h2 id="tokens-spacing-heading" className="text-section-title">
            Spacing
          </h2>
          <div className="space-y-2 rounded-lg border border-border-default bg-bg-surface p-4">
            {tokens.spacing.tokens.map((space) => (
              <div key={space.name} className="flex items-center gap-3">
                <span className="w-24 shrink-0 font-mono text-number-sm text-text-primary">
                  --{space.name}
                </span>
                <span className="w-12 shrink-0 font-mono text-number-sm text-text-muted">
                  {space.value}
                </span>
                <span
                  aria-hidden="true"
                  className="h-3 rounded-xs bg-brand-primary"
                  style={{ width: `var(--${space.name})` }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3" aria-labelledby="tokens-radius-heading">
          <h2 id="tokens-radius-heading" className="text-section-title">
            Radius &amp; Density
          </h2>
          <div className="space-y-4 rounded-lg border border-border-default bg-bg-surface p-4">
            <div className="grid grid-cols-2 gap-3">
              {tokens.radius.tokens.map((radius) => (
                <div key={radius.name} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-10 w-10 shrink-0 border-2 border-brand-primary bg-brand-primary-subtle"
                    style={{ borderRadius: `var(--${radius.name})` }}
                  />
                  <div className="min-w-0">
                    <div className="font-mono text-number-sm text-text-primary">
                      --{radius.name}
                    </div>
                    <div className="font-mono text-number-sm text-text-muted">{radius.value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border-default pt-3">
              <h3 className="mb-2 text-label uppercase text-text-muted">Density presets</h3>
              <div className="space-y-2">
                {tokens.density.presets.map((preset) => (
                  <div
                    key={preset.name}
                    className="flex items-center justify-between gap-2 rounded-md border border-border-default bg-bg-raised px-3 py-2"
                  >
                    <div>
                      <span className="font-mono text-body-sm font-medium text-text-primary">
                        {preset.name}
                      </span>
                      <span className="ms-2 text-body-sm text-text-secondary">{preset.usage}</span>
                    </div>
                    <span className="font-mono text-number-sm text-text-muted">
                      ×{preset.scale}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const meta: Meta = {
  title: "Foundations/Tokens",
};

export default meta;

type Story = StoryObj;

export const AllTokens: Story = {
  render: (_args, context) => (
    <TokensCatalogue tenantThemeId={String(context.globals["tenantTheme"] ?? "none")} />
  ),
};
