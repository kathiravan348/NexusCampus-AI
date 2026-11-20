import { describe, expect, it } from "vitest";
import { explainMessage, formatMessagePreview, MESSAGE_LAYERS } from "./layers";
import { resolveMessages } from "./resolve";

describe("explainMessage", () => {
  it("explains all 5 layers and picks the highest non-null winner", () => {
    const base = explainMessage("term.learner", { locale: "en-US" });
    expect(MESSAGE_LAYERS).toEqual(["platform", "terminology", "group", "institution", "campus"]);
    expect(base.layers).toEqual({
      platform: "Learner",
      terminology: null,
      group: null,
      institution: null,
      campus: null,
    });
    expect(base.winner).toBe("platform");
    expect(base.resolved).toBe("Learner");

    const withPack = explainMessage("term.learner", { locale: "en-GB", typePack: "ey" });
    expect(withPack.layers.platform).toBe("Learner");
    expect(withPack.layers.terminology).toBe("Child");
    expect(withPack.winner).toBe("terminology");
    expect(withPack.resolved).toBe("Child");

    const allLayers = explainMessage("term.learner", {
      locale: "en-GB",
      typePack: "k12",
      group: { "term.learner": "Pupil" },
      institution: { "term.learner": "Scholar" },
      campus: { "term.learner": "House Member" },
    });
    expect(allLayers.layers).toEqual({
      platform: "Learner",
      terminology: "Student",
      group: "Pupil",
      institution: "Scholar",
      campus: "House Member",
    });
    expect(allLayers.winner).toBe("campus");
    expect(allLayers.resolved).toBe("House Member");
  });

  it("matches resolveMessages for Tamil, fallback locales, invalid ICU, and pseudo-locale", () => {
    const taOptions = {
      locale: "ta-IN",
      typePack: "voc" as const,
      institution: { "term.learner": "பயிற்சியாளர்" },
    };
    const taExplained = explainMessage("term.learner", taOptions);
    expect(taExplained.layers.platform).toBe("மாணவர்");
    expect(taExplained.layers.terminology).toBe("பயிற்சி பெறுபவர்");
    expect(taExplained.layers.institution).toBe("பயிற்சியாளர்");
    expect(taExplained.winner).toBe("institution");
    expect(taExplained.resolved).toBe(resolveMessages(taOptions)["term.learner"]);

    const invalidOptions = {
      locale: "en",
      typePack: "ey" as const,
      group: { "term.learner": "Pupil" },
      institution: { "term.learner": "Broken {count, plural, one {x}" },
    };
    const invalidExplained = explainMessage("term.learner", invalidOptions);
    expect(invalidExplained.layers.institution).toBeNull();
    expect(invalidExplained.winner).toBe("group");
    expect(invalidExplained.resolved).toBe(resolveMessages(invalidOptions)["term.learner"]);

    const pseudoOptions = { locale: "en-XA", institution: { "common.save": "Store" } };
    const pseudoExplained = explainMessage("common.save", pseudoOptions);
    expect(pseudoExplained.winner).toBe("institution");
    expect(pseudoExplained.resolved).toBe(resolveMessages(pseudoOptions)["common.save"]);

    const fallbackOptions = { locale: "fr-FR", typePack: "ey" as const };
    const fallbackExplained = explainMessage("term.learner", fallbackOptions);
    expect(fallbackExplained.layers.platform).toBe("Learner");
    expect(fallbackExplained.layers.terminology).toBe("Child");
    expect(fallbackExplained.winner).toBe("terminology");
    expect(fallbackExplained.resolved).toBe(resolveMessages(fallbackOptions)["term.learner"]);
  });
});

describe("formatMessagePreview", () => {
  it("renders ICU placeholders with sample values and rejects invalid ICU", () => {
    const plural = formatMessagePreview(
      "{count, plural, one {# item} other {# items}} for {name}",
      "en-US",
    );
    expect(plural).toEqual({
      ok: true,
      rendered: "3 items for [name]",
      placeholders: ["count", "name"],
    });

    const hindi = formatMessagePreview("स्वागत है, {name}", "hi-IN");
    expect(hindi).toEqual({
      ok: true,
      rendered: "स्वागत है, [name]",
      placeholders: ["name"],
    });

    const broken = formatMessagePreview("Hello {count, plural, one {x}", "en-US");
    expect(broken.ok).toBe(false);
  });
});
