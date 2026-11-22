import { iconImage } from "@/lib/seo/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Placeholder brand icon (also the Organization logo in structured data) until the logo asset exists. */
export default function Icon() {
  return iconImage(512);
}
