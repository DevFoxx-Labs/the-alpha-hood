import { STORE_CONFIG } from "@/lib/config/store";
import { OG_SIZE, ogCard } from "@/lib/seo/og";

export const alt = `${STORE_CONFIG.name} — ${STORE_CONFIG.tagline}`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ eyebrow: "Designed in India", title: STORE_CONFIG.tagline, footer: "Streetwear & everyday menswear" });
}
