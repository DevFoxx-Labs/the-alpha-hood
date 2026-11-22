import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Per-product Open Graph cards (CMS-03), drawn with next/og — no external image service. The site-wide share
 * image, favicon and app icons are the brand-kit files (app/opengraph-image.png, app/icon.svg, …). The kit's
 * horizontal lockup (on-dark) is read from /assets (Next docs: local assets relative to the project root).
 * The bundled font has no ₹ glyph, so prices are written "Rs".
 */
export const OG_SIZE = { width: 1200, height: 630 };

let lockup: Promise<string> | null = null;
function lockupSrc(): Promise<string> {
  lockup ??= readFile(join(process.cwd(), "assets/brand/primary-horizontal_color-on-dark@600.png"), "base64").then((b) => `data:image/png;base64,${b}`);
  return lockup;
}

export async function ogCard({ eyebrow, title, footer }: { eyebrow: string; title: string; footer?: string }) {
  const logo = await lockupSrc();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0A0A0A", color: "#ffffff", padding: 72 }}>
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#F5C80B", fontWeight: 700 }}>{eyebrow.toUpperCase()}</div>
        <div style={{ display: "flex", fontSize: title.length > 40 ? 64 : 84, fontWeight: 800, lineHeight: 1.05, textTransform: "uppercase" }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 34 }}>
          <span style={{ color: "#E4002B", fontWeight: 800 }}>{footer ?? ""}</span>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logo} width={300} height={101} />
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

export function ogPrice(paise: number): string {
  return `Rs ${new Intl.NumberFormat("en-IN").format(Math.round(paise / 100))}`;
}
