import { I18nProvider } from "@nexus/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssetsPanel } from "./AssetsPanel";

describe("AssetsPanel", () => {
  it("previews valid URLs and flags invalid asset URLs", () => {
    const onLogo = vi.fn();
    const onFavicon = vi.fn();

    const { rerender } = render(
      <I18nProvider locale="en">
        <AssetsPanel
          logoUrl="/demo/riverside/logo.svg"
          faviconUrl=""
          onLogoUrlChange={onLogo}
          onFaviconUrlChange={onFavicon}
        />
      </I18nProvider>,
    );

    expect(screen.getByAltText("Institution logo preview")).toHaveAttribute(
      "src",
      "/demo/riverside/logo.svg",
    );

    fireEvent.change(screen.getByLabelText("Favicon URL"), {
      target: { value: "http://insecure.example/icon.png" },
    });
    expect(onFavicon).toHaveBeenCalledWith("http://insecure.example/icon.png");

    rerender(
      <I18nProvider locale="en">
        <AssetsPanel
          logoUrl="/demo/riverside/logo.svg"
          faviconUrl="http://insecure.example/icon.png"
          onLogoUrlChange={onLogo}
          onFaviconUrlChange={onFavicon}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Must be an https:// URL or a path starting with /.",
    );
  });
});
