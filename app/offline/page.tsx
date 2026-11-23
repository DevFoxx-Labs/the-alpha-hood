import type { Metadata } from "next";
import { Mascot } from "@/components/brand/mascot";
import { Logo } from "@/components/store/logo";

export const metadata: Metadata = { title: "You're offline", robots: { index: false, follow: false } };

/** PWA offline fallback (pre-cached by /sw.js). Static: no data, no personal content. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-5">
        <Logo />
        <Mascot name="alpha-13-sleeping" sizes="280px" className="w-[260px]" />
        <h1 className="font-display text-[44px] uppercase leading-[0.9] lg:text-[72px]">You&apos;re offline</h1>
        <p className="max-w-[380px] text-[14px] leading-[1.6] text-ink-2">Check your connection and try again. Your bag is saved.</p>
      </div>
    </main>
  );
}
