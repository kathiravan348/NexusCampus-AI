import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import controlHi from "../control/hi.json";
import controlTa from "../control/ta.json";
import {
  CONTROL_MESSAGE_KEYS,
  CONTROL_SOURCE,
  ControlI18nProvider,
  controlMessages,
  useControlText,
} from "./control";
import { MESSAGE_KEYS } from "./resolve";

const KEY_PATTERN = /^(ctl|p\d{2})\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/;

function argNames(nodes: MessageFormatElement[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (
      node.type === TYPE.argument ||
      node.type === TYPE.number ||
      node.type === TYPE.date ||
      node.type === TYPE.time
    ) {
      out.add(node.value);
    } else if (node.type === TYPE.plural || node.type === TYPE.select) {
      out.add(node.value);
      for (const opt of Object.values(node.options)) argNames(opt.value, out);
    }
  }
  return out;
}
const names = (message: string) => [...argNames(parse(message))].sort().join();

describe("Control text catalogue (D53)", () => {
  it("uses ctl.* and p<NN>.* keys only, none shared with the tenant catalogue", () => {
    const platform = new Set<string>(MESSAGE_KEYS);
    for (const key of CONTROL_MESSAGE_KEYS) {
      expect(key, key).toMatch(KEY_PATTERN);
      expect(platform.has(key), key).toBe(false);
    }
  });

  it("describes every English message for translators", () => {
    for (const key of CONTROL_MESSAGE_KEYS) {
      expect(CONTROL_SOURCE[key].description.length, key).toBeGreaterThan(10);
    }
  });

  it("is complete in Hindi and Tamil with the same placeholders (D42)", () => {
    for (const [locale, catalog] of Object.entries({ hi: controlHi, ta: controlTa } as Record<
      string,
      Record<string, string>
    >)) {
      expect(Object.keys(catalog).sort(), locale).toEqual([...CONTROL_MESSAGE_KEYS].sort());
      for (const key of CONTROL_MESSAGE_KEYS) {
        expect(names(catalog[key] ?? ""), `${locale} ${key}`).toBe(
          names(CONTROL_SOURCE[key].message),
        );
      }
    }
  });

  it("merges platform common texts with Control texts per locale, and pseudo-localises", () => {
    const ta = controlMessages("ta-IN");
    expect(ta["ctl.role.sales"]).toBe(controlTa["ctl.role.sales"]);
    expect(ta["common.save"]).toBeTruthy();
    expect(controlMessages("fr")["ctl.role.sales"]).toBe("Sales");
    expect(controlMessages("en-XA")["ctl.role.sales"]).not.toBe("Sales");
  });

  it("renders through the provider and hook", () => {
    function Probe() {
      const t = useControlText();
      return <p>{t("ctl.signIn.as", { name: "Meera" })}</p>;
    }
    render(
      <ControlI18nProvider locale="hi-IN">
        <Probe />
      </ControlI18nProvider>,
    );
    expect(screen.getByText("Meera के रूप में साइन इन करें")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("hi-IN");
  });
});
