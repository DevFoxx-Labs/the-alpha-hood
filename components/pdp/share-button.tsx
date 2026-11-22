"use client";

import { Copy01Icon, Share08Icon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { showMessageToast } from "@/components/store/toast";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * PDP-12 share: the native share sheet where available (mobile), otherwise WhatsApp + copy link. The URL is
 * built from the current origin + the product path only (no tracking parameters, no personal data).
 */
export function ShareButton({ title, path, className }: { title: string; path: string; className?: string }) {
  const url = () => `${window.location.origin}${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      showMessageToast("Link copied");
    } catch {
      showMessageToast("Couldn't copy the link");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Share"
          className={cn("grid size-10 place-items-center", className)}
          onClick={async (e) => {
            if (typeof navigator.share === "function") {
              e.preventDefault();
              try {
                await navigator.share({ title, url: url() });
              } catch {
                // Dismissed by the user — nothing to do.
              }
            }
          }}
        >
          <Icon icon={Share08Icon} size={20} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[220px] p-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${title} `)}`}
          onClick={(e) => {
            e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(`${title} ${url()}`)}`;
          }}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 items-center gap-2.5 px-2 text-[13px] hover:bg-soft"
        >
          <Icon icon={WhatsappIcon} size={18} />
          Share on WhatsApp
        </a>
        <button type="button" onClick={copy} className="flex h-10 w-full items-center gap-2.5 px-2 text-left text-[13px] hover:bg-soft">
          <Icon icon={Copy01Icon} size={18} />
          Copy link
        </button>
      </PopoverContent>
    </Popover>
  );
}
