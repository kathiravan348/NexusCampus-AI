import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges conditional classes and resolves conflicting utilities", () => {
    const showHidden = false;
    expect(cn("px-3 py-2", showHidden && "hidden", "px-4")).toBe("py-2 px-4");
  });

  it("keeps custom font-size tokens alongside text colour tokens", () => {
    expect(cn("text-body-sm", "text-text-muted")).toBe("text-body-sm text-text-muted");
    expect(cn("text-body", "text-body-sm")).toBe("text-body-sm");
  });

  it("resolves custom radius tokens without dropping unrelated utilities", () => {
    expect(cn("rounded-md", "rounded-pill")).toBe("rounded-pill");
  });
});
