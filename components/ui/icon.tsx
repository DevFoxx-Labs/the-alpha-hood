import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";

/**
 * Hugeicons (free, stroke rounded) — the only icon set in this project.
 * Decorative by default (hidden from screen readers); give the parent control an aria-label.
 */
export function Icon({ size = 20, strokeWidth = 1.6, ...props }: HugeiconsIconProps) {
  return <HugeiconsIcon aria-hidden="true" focusable="false" size={size} strokeWidth={strokeWidth} {...props} />;
}
