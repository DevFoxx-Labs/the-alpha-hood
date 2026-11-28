import Link from "next/link";
import { Mascot } from "@/components/brand/mascot";
import { OutlineMarquee } from "@/components/brand/outline-marquee";
import { Logo } from "@/components/store/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-6 py-16 text-center">
      {/* Light variant of the brand-video outline text (black stroke at 8%, fades to white). */}
      <OutlineMarquee theme="light" rows={5} />
      <div className="relative z-[1] flex flex-col items-center gap-6">
        <Logo />
        {/* MASCOT_PROMPTS #14 "Peek from the side" — curious, never alarming. */}
        <Mascot name="alpha-14-peek" sizes="(min-width: 1024px) 420px, 80vw" className="w-[min(420px,80vw)]" />
        <h1 className="font-display text-[56px] uppercase leading-[0.9] lg:text-[96px]">Page not found</h1>
        <p className="max-w-[420px] text-[14px] leading-[1.6] text-ink-2">
          This page doesn&apos;t exist or has moved. Head back to the homepage to keep shopping.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/">Go to homepage</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/privacy">Privacy &amp; legal</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
