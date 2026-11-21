/**
 * Builds docs/manual/USER-MANUAL.md from the screenshots `e2e/manual/manual.spec.ts` captured
 * (docs/manual/.parts/*.json). Run through `pnpm --dir frontend manual` (capture + build) or `manual:build`.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Part {
  readonly order: number;
  readonly section: "screens" | "flows" | "platform" | "control";
  readonly title: string;
  readonly intro: string;
  /** Platform tools: how to open it (command or address). */
  readonly how?: string;
  /** Set when the tool was not running during the capture. */
  readonly skipped?: string;
  readonly shots: { readonly file: string; readonly caption: string }[];
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/manual");
const partsDir = path.join(OUT, ".parts");
const parts: Part[] = readdirSync(partsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(partsDir, f), "utf-8")) as Part)
  .sort((a, b) => a.order - b.order);

const anchor = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

const flows = parts.filter((p) => p.section === "flows");
const screens = parts.filter((p) => p.section === "screens");
const platform = parts.filter((p) => p.section === "platform");
const control = parts.filter((p) => p.section === "control");
const today = new Date().toISOString().slice(0, 10);
const lines: string[] = [
  "# NexusCampus — User manual",
  "",
  `> Pictures first. Every screenshot is taken automatically from the demo (sample data), so this manual always`,
  `> matches the app. Updated ${today} · ${parts.reduce((n, p) => n + p.shots.length, 0)} screenshots.`,
  "",
  "## Contents",
  "",
  "**Step by step (end to end)**",
  "",
  ...flows.map((p) => `- [${p.title}](#${anchor(p.title)})`),
  "",
  "**Every screen**",
  "",
  ...screens.map((p) => `- [${p.title}](#${anchor(p.title)})`),
  "",
  "**Nexus Control** (our provider staff app)",
  "",
  ...control.map((p) => `- [${p.title}](#${anchor(p.title)})`),
  "",
  "**Platform & tools** (for support, IT and the team)",
  "",
  ...platform.map((p) => `- [${p.title}](#${anchor(p.title)})`),
  "",
  "---",
  "",
  "# Step by step",
  "",
];
for (const p of flows) {
  lines.push(`## ${p.title}`, "");
  if (p.intro) lines.push(`*${p.intro}*`, "");
  for (const s of p.shots)
    lines.push(`**${s.caption}**`, "", `![${s.caption}](screens/${s.file})`, "");
}
lines.push("---", "", "# Every screen", "");
for (const p of screens) {
  lines.push(`## ${p.title}`, "");
  for (const s of p.shots)
    lines.push(`**${s.caption}**`, "", `![${s.caption}](screens/${s.file})`, "");
}
lines.push("---", "", "# Nexus Control", "");
for (const p of control) {
  lines.push(`## ${p.title}`, "");
  if (p.intro) lines.push(`*${p.intro}*`, "");
  for (const s of p.shots)
    lines.push(`**${s.caption}**`, "", `![${s.caption}](screens/${s.file})`, "");
}
lines.push("---", "", "# Platform & tools", "");
for (const p of platform) {
  lines.push(`## ${p.title}`, "");
  if (p.intro) lines.push(`*${p.intro}*`, "");
  if (p.how) lines.push(`Open: ${p.how}`, "");
  if (p.skipped) lines.push(`> Not captured in this run: ${p.skipped}.`, "");
  for (const s of p.shots)
    lines.push(`**${s.caption}**`, "", `![${s.caption}](screens/${s.file})`, "");
}
lines.push(
  "---",
  "",
  "## Keeping this manual up to date",
  "",
  "Run `fnm exec --using=24 -- pnpm --dir frontend manual`. It retakes every screenshot and rewrites this file.",
  "For the *Platform & tools* part, start the dev stack first: `uv run --project backend nexus-compose-up`,",
  "`uv run --project backend nexus-dev` and `pnpm --dir frontend dev:real`; tools that are not running are listed",
  "as not captured.",
  "",
  "- A new module or tab appears under *Every screen* by itself.",
  "- To add a step-by-step example for a new feature, add one `flow` test to `frontend/e2e/manual/manual.spec.ts`:",
  "  a title, a one-line intro, and a `shot(...)` after each step.",
  "",
);
writeFileSync(path.join(OUT, "USER-MANUAL.md"), lines.join("\n"));
console.log(
  `USER-MANUAL.md: ${flows.length} examples, ${screens.length} screens, ${control.length} Control pages, ${platform.length} platform tools` +
    ` (${platform.filter((p) => p.skipped).length} not captured)`,
);
