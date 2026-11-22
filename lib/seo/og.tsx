import { ImageResponse } from "next/og";

/**
 * Open Graph / icon art (CMS-03), drawn with next/og — no external image service. Brand colours from
 * DESIGN.md (ink, volt, accent red). Placeholder until real product photography and the logo asset exist.
 * The bundled font has no ₹ glyph, so prices are written "Rs".
 */
export const OG_SIZE = { width: 1200, height: 630 };

export function ogCard({ eyebrow, title, footer }: { eyebrow: string; title: string; footer?: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#111111", color: "#ffffff", padding: 72 }}>
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#f4e04d", fontWeight: 700 }}>{eyebrow.toUpperCase()}</div>
        <div style={{ display: "flex", fontSize: title.length > 40 ? 64 : 84, fontWeight: 800, lineHeight: 1.05, textTransform: "uppercase" }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 30 }}>
          <span style={{ color: "#e4002b", fontWeight: 800 }}>{footer ?? ""}</span>
          <span style={{ fontWeight: 800, letterSpacing: 4 }}>THE ALPHA HOOD</span>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

export function iconImage(size: number) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#111111", color: "#f4e04d", fontSize: size * 0.42, fontWeight: 900, letterSpacing: -2 }}>
        AH
      </div>
    ),
    { width: size, height: size },
  );
}

export function ogPrice(paise: number): string {
  return `Rs ${new Intl.NumberFormat("en-IN").format(Math.round(paise / 100))}`;
}
