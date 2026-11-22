import type { MetadataRoute } from "next";
import { STORE_CONFIG } from "@/lib/config/store";

/** Web app manifest from the brand kit (docs/brand/logo-kit/icons/site.webmanifest). Icons in /public/icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: STORE_CONFIG.name,
    short_name: "Alpha Hood",
    description: "Bold streetwear and everyday menswear, designed in India.",
    start_url: "/",
    display: "standalone",
    theme_color: "#0A0A0A",
    background_color: "#0A0A0A",
    icons: [
      { src: "/icons/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
