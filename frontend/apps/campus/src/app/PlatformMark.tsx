import { brand } from "@nexus/brand";

const SIZE_CLASS = { sm: "h-7 w-7", md: "h-10 w-10" } as const;

export interface PlatformMarkProps {
  readonly size?: keyof typeof SIZE_CLASS;
  /** True when the platform name is shown as text next to the mark, so screen readers skip the image. */
  readonly decorative?: boolean;
}

/** The NexusCampus logo mark (D40). Paths come from `brand.logo`; hides itself if the file fails to load. */
export function PlatformMark({ size = "sm", decorative = false }: PlatformMarkProps) {
  return (
    <img
      src={brand.logo.mark}
      alt={decorative ? "" : brand.name}
      className={`${SIZE_CLASS[size]} shrink-0 object-contain`}
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
    />
  );
}
