import Link from "next/link";
import { Logo } from "@/components/store/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-6">
        <Logo />
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
