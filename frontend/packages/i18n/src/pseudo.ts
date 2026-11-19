/**
 * `en-XA` pseudo-locale: accents every letter, makes text ~40 % longer and wraps it in ⟦ ⟧, so
 * hard-coded strings (no accents), truncation (lost padding or ⟧) and concatenation (⟦ in the
 * middle) are easy to spot. ICU syntax is kept intact: argument names, types and plural/select
 * keys are copied; only the text the user reads is changed.
 */

const ACCENTS: Readonly<Record<string, string>> = {
  a: "á",
  b: "ƀ",
  c: "ç",
  d: "ð",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "í",
  j: "ĵ",
  k: "ķ",
  l: "ļ",
  m: "ɱ",
  n: "ñ",
  o: "ó",
  p: "þ",
  q: "ǫ",
  r: "ŕ",
  s: "š",
  t: "ţ",
  u: "ú",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
  A: "Á",
  B: "Ɓ",
  C: "Ç",
  D: "Ð",
  E: "É",
  F: "Ƒ",
  G: "Ĝ",
  H: "Ĥ",
  I: "Í",
  J: "Ĵ",
  K: "Ķ",
  L: "Ļ",
  M: "Ṁ",
  N: "Ñ",
  O: "Ó",
  P: "Þ",
  Q: "Ǫ",
  R: "Ŕ",
  S: "Š",
  T: "Ţ",
  U: "Ú",
  V: "Ṽ",
  W: "Ŵ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ž",
};

const EXPANSION = 0.4;
const PAD = "·";

const PLURAL_TYPES = new Set(["plural", "select", "selectordinal"]);

interface Result {
  text: string;
  /** Count of characters the user reads, for working out the padding. */
  visible: number;
  end: number;
}

function accent(ch: string): string {
  return ACCENTS[ch] ?? ch;
}

/** Copies a `{…}` block verbatim (number/date formats), returning the index after its closing brace. */
function skipBlock(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

/** Transforms message text from `i` until an unmatched `}` (or the end). */
function transformText(src: string, i: number): Result {
  let text = "";
  let visible = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "}") break;
    if (ch === "{") {
      const arg = transformArgument(src, i);
      text += arg.text;
      visible += arg.visible;
      i = arg.end;
      continue;
    }
    if (ch === "'" && src[i + 1] !== undefined && "{}'#".includes(src[i + 1]!)) {
      // ICU quoting: copy the quoted run untouched.
      const close = src.indexOf("'", i + 1);
      const end = close === -1 ? src.length : close + 1;
      text += src.slice(i, end);
      i = end;
      continue;
    }
    text += ch === "#" ? ch : accent(ch);
    if (ch.trim() !== "") visible++;
    i++;
  }
  return { text, visible, end: i };
}

/** Transforms one `{name, type, …}` argument starting at `start` (a `{`). */
function transformArgument(src: string, start: number): Result {
  const header = /^\{\s*[^,{}]+?\s*(?:,\s*([a-zA-Z]+)\s*)?(,|\})/.exec(src.slice(start));
  if (!header) {
    const end = skipBlock(src, start);
    return { text: src.slice(start, end), visible: 0, end };
  }
  const type = header[1];
  if (header[2] === "}" || !type || !PLURAL_TYPES.has(type)) {
    const end = header[2] === "}" ? start + header[0].length : skipBlock(src, start);
    return { text: src.slice(start, end), visible: 0, end };
  }
  // plural / select: `key {text} key {text} … }`
  let i = start + header[0].length;
  let text = header[0];
  let visible = 0;
  while (i < src.length && src[i] !== "}") {
    const open = src.indexOf("{", i);
    if (open === -1) break;
    text += src.slice(i, open + 1); // selector key (e.g. "one", "=0", "offset:1") copied as-is
    const branch = transformText(src, open + 1);
    text += branch.text + "}";
    visible = Math.max(visible, branch.visible);
    i = branch.end + 1;
    while (i < src.length && /\s/.test(src[i]!)) text += src[i++];
  }
  return { text: text + "}", visible, end: i + 1 };
}

export function pseudoLocalize(message: string): string {
  let text = "";
  let visible = 0;
  let i = 0;
  while (i < message.length) {
    const part = transformText(message, i);
    text += part.text;
    visible += part.visible;
    i = part.end;
    // A stray "}" stops transformText; keep it and go on, so no text is ever dropped.
    if (i < message.length) text += message[i++];
  }
  const pad = PAD.repeat(Math.max(1, Math.ceil(visible * EXPANSION)));
  return `⟦${text}${pad}⟧`;
}
