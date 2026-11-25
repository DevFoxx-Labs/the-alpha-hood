/**
 * Image URLs the storefront renders as product photos. Only our own sources: uploaded media (`/api/media/<id>`,
 * own backend) and the demo cutouts shipped in `public/demo/products/` for the mock catalogue. Anything else
 * (a remote URL, a path with `..`) falls back to the placeholder drawing — no fetching of arbitrary URLs.
 * Client-safe (no Node imports), so cards, the rail and the PDP share one rule.
 */
export const PRODUCT_PHOTO_URL_RE = /^(?:\/api\/media\/med_[a-f0-9]{32}|\/demo\/products\/[a-z0-9-]{1,80}\.(?:webp|png|jpg))$/;

export const isProductPhotoUrl = (url: string | undefined): url is string => !!url && PRODUCT_PHOTO_URL_RE.test(url);
