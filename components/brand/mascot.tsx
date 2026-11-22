import Image from "next/image";
import { MASCOT, type MascotName } from "@/lib/brand/mascot";
import { cn } from "@/lib/utils";

/**
 * One mascot image (MASCOT_PROMPTS.md §7). Decorative by default (alt="", hidden from screen readers) — the
 * text next to it carries the meaning. next/image serves AVIF/WebP at the right width; lazy unless `priority`.
 *
 * Non-transparent images sit on their own sampled background colour (`MASCOT[name].bg`), so pass `blend` to
 * paint the wrapper in that colour and the image edge disappears into the panel.
 */
export function Mascot({
  name,
  sizes,
  className,
  imgClassName,
  priority = false,
  blend = false,
  alt = "",
}: {
  name: MascotName;
  /** Rendered width hint, e.g. "(min-width: 1024px) 320px, 160px". */
  sizes: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  blend?: boolean;
  alt?: string;
}) {
  const m = MASCOT[name];
  return (
    <span className={cn("block", className)} style={blend && m.bg ? { backgroundColor: m.bg } : undefined}>
      <Image
        src={m.src}
        width={m.width}
        height={m.height}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        sizes={sizes}
        priority={priority}
        className={cn("h-auto w-full select-none", imgClassName)}
        draggable={false}
      />
    </span>
  );
}

/** Background colour for a panel that holds a non-transparent mascot image. */
export function mascotBg(name: MascotName): string | undefined {
  return MASCOT[name].bg ?? undefined;
}
