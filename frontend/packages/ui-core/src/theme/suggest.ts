import {
  CONTRAST_PAIRS,
  DEFAULT_COLORS,
  contrastRatio,
  isHexColor,
  type ContrastFailure,
} from "./contrast";

const WHITE = "#FFFFFF";
const BLACK = "#000000";
const DEFAULT_MIN_RATIO = 4.5;

function parseRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function mixHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = parseRgb(from);
  const [r2, g2, b2] = parseRgb(to);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/**
 * Returns the first hex colour from `candidates` meeting `minRatio` (default 4.5:1) against
 * `background`, falling back to `#000000` or `#FFFFFF` (higher contrast wins if both pass).
 */
export function suggestOnColor(
  background: string,
  candidates: readonly string[] = [],
  minRatio = DEFAULT_MIN_RATIO,
): string {
  if (!isHexColor(background)) throw new Error(`Not a #RRGGBB colour: ${background}`);
  for (const candidate of candidates) {
    if (isHexColor(candidate) && contrastRatio(candidate, background) >= minRatio) {
      return candidate.toUpperCase();
    }
  }
  const whiteRatio = contrastRatio(WHITE, background);
  const blackRatio = contrastRatio(BLACK, background);
  if (whiteRatio >= minRatio && blackRatio < minRatio) return WHITE;
  if (blackRatio >= minRatio && whiteRatio < minRatio) return BLACK;
  return whiteRatio >= blackRatio ? WHITE : BLACK;
}

/**
 * Finds the closest shade of `preferred` (by darkening or lightening) that meets `minRatio`
 * against every background in `backgrounds`, falling back to `#FFFFFF` or `#000000`.
 */
export function suggestAccessibleColor(
  preferred: string,
  backgrounds: readonly string[],
  minRatio = DEFAULT_MIN_RATIO,
): string {
  const validBgs = backgrounds.filter(isHexColor);
  if (validBgs.length === 0) return isHexColor(preferred) ? preferred.toUpperCase() : BLACK;

  const passesAll = (hex: string) => validBgs.every((bg) => contrastRatio(hex, bg) >= minRatio);
  const base = isHexColor(preferred) ? preferred.toUpperCase() : BLACK;
  if (passesAll(base)) return base;

  for (let step = 1; step <= 100; step += 1) {
    const t = step / 100;
    const darker = mixHex(base, BLACK, t);
    const lighter = mixHex(base, WHITE, t);
    const darkOk = passesAll(darker);
    const lightOk = passesAll(lighter);
    if (darkOk && !lightOk) return darker;
    if (lightOk && !darkOk) return lighter;
    if (darkOk && lightOk) {
      const darkMin = Math.min(...validBgs.map((bg) => contrastRatio(darker, bg)));
      const lightMin = Math.min(...validBgs.map((bg) => contrastRatio(lighter, bg)));
      return darkMin >= lightMin ? darker : lighter;
    }
  }

  const whiteMin = Math.min(...validBgs.map((bg) => contrastRatio(WHITE, bg)));
  const blackMin = Math.min(...validBgs.map((bg) => contrastRatio(BLACK, bg)));
  return whiteMin >= blackMin ? WHITE : BLACK;
}

export interface BrandPairSuggestion {
  readonly onBrand: string;
  readonly brandPrimaryText: string;
}

/**
 * Suggests passing `on-brand` and `brand-primary-text` values when `brand-primary` changes.
 */
export function suggestBrandPair(
  brandPrimary: string,
  modeColors: Readonly<Record<string, string>>,
): BrandPairSuggestion {
  const onBrand = suggestOnColor(brandPrimary, [
    WHITE,
    DEFAULT_COLORS.light["text-primary"] ?? BLACK,
    DEFAULT_COLORS.dark["bg-sidebar"] ?? BLACK,
  ]);
  const textBackgrounds = [
    modeColors["bg-surface"],
    modeColors["bg-ground"],
    modeColors["brand-primary-subtle"],
  ].filter((c): c is string => typeof c === "string" && isHexColor(c));
  const brandPrimaryText = suggestAccessibleColor(brandPrimary, textBackgrounds, DEFAULT_MIN_RATIO);
  return { onBrand, brandPrimaryText };
}

export interface ContrastFixSuggestion {
  readonly token: string;
  readonly value: string;
}

/** Suggests a single token change that resolves `failure` while respecting other pairs and locks. */
export function suggestFixForFailure(
  failure: ContrastFailure,
  modeColors: Readonly<Record<string, string>>,
  lockedTokens: ReadonlySet<string> = new Set(),
): ContrastFixSuggestion {
  const fixBg = lockedTokens.has(failure.fg) && !lockedTokens.has(failure.bg);
  const targetToken = fixBg ? failure.bg : failure.fg;
  const relatedPairs = CONTRAST_PAIRS.filter((p) =>
    fixBg ? p.bg === targetToken : p.fg === targetToken,
  );
  const peers = relatedPairs
    .map((p) => modeColors[fixBg ? p.fg : p.bg])
    .filter((c): c is string => typeof c === "string" && isHexColor(c));
  const minRatio = Math.max(failure.minRatio, ...relatedPairs.map((p) => p.minRatio));

  if (!fixBg && targetToken === "on-brand") {
    const bg = modeColors[failure.bg];
    if (bg && isHexColor(bg)) {
      return {
        token: targetToken,
        value: suggestOnColor(
          bg,
          [
            WHITE,
            DEFAULT_COLORS.light["text-primary"] ?? BLACK,
            DEFAULT_COLORS.dark["bg-sidebar"] ?? BLACK,
          ],
          minRatio,
        ),
      };
    }
  }

  const current = modeColors[targetToken] ?? DEFAULT_COLORS[failure.theme][targetToken] ?? BLACK;
  return {
    token: targetToken,
    value: suggestAccessibleColor(current, peers, minRatio),
  };
}
