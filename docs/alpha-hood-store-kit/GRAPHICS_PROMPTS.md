# The Alpha Hood — Graphics Prompt Pack

Prompts for campaign mood images, backgrounds, banners, category cut-out styling, icons, social posts, packaging and logo exploration. They match `DESIGN.md`: monochrome, bold, urban, Alpha Red `#E4002B`, Hood Yellow `#F4E04D`.

> ⚠️ **Read first: honest imagery.** For a fashion store, **real product photography of your real garments is required** for product listings, product pages and ads. AI images can't show your actual fabric, fit or colour accurately, and passing them off as real products misleads customers (and breaks consumer-protection rules). Use AI for: mood/campaign backgrounds, banner textures, set-design ideas, shoot references, icons, social templates, packaging and logo exploration. Label AI campaign visuals internally, and never use AI people as "customer reviews" or UGC.

---

## 0. How to use

### 0.1 Style lock: paste in place of `[STYLE]`
```
Bold Indian streetwear brand aesthetic, editorial fashion campaign look, high-contrast monochrome palette
(deep black #0A0A0A, white, concrete greys) with small accents of signal red #E4002B and electric yellow #F4E04D,
urban Indian city setting (concrete, metro stations, rooftops, street crossings, graffiti-free clean walls),
strong directional light, crisp details, shot on 35mm, modern and premium, no text, no logos, no watermark.
```
**Short version:** `bold monochrome streetwear editorial, black/white/concrete grey, red #E4002B and yellow #F4E04D accents, urban India, strong light, no text`

### 0.2 Negative prompt
```
text, letters, logos, brand names, watermark, other brands' logos or prints, distorted hands, extra fingers, warped clothing,
cartoon, plastic skin, oversaturated, cluttered background, low resolution
```

### 0.3 Tool tips
| Tool | Tip |
|---|---|
| ChatGPT / GPT-Image | Best for campaign mood boards and banners. Upload a photo of **your own** garment and ask "place this exact garment on a model in this setting" for shoot previews (still label them as previews). |
| Midjourney | `--style raw --v 7 --ar 16:7` for desktop heroes, `--ar 4:5` for mobile; reuse a good result with `--sref` for consistency. |
| Ideogram | Social posts with text ("SALE", "NEW DROP"); verify spelling and ₹ amounts. |
| Firefly | Commercially safe backgrounds and textures. |
| Photoroom / remove.bg | Make category cut-outs from your real product photos (transparent PNG). |

### 0.4 Sizes
| Use | Size | Ratio |
|---|---|---|
| Hero desktop | 2880×1260 | 16:7 |
| Hero mobile | 1080×1350 | 4:5 |
| Collection tile | 1200×1560 | 10:13 |
| Offer tile | 1200×1100 | ~1:1 |
| Promo band | 2880×600 | 24:5 |
| Menu promo tile | 800×560 | 10:7 |
| Category cut-out | 1000×1100 PNG | ~1:1.1 |
| Instagram post / story | 1080×1350 / 1080×1920 | 4:5 / 9:16 |
| OG image | 1200×630 | 1.91:1 |
Export WebP/AVIF (≤ 250 KB for heroes) via the image CDN.

---

## 1. Campaign & hero mood images
Use these as **mood references for your photoshoot** or as hero backgrounds. Put your real product photos in front, or composite your real garments onto them.
- **Winter drop hero (desktop):** `Editorial street fashion photo, young Indian man in a black puffer jacket and dark jeans walking across a zebra crossing at dusk in Mumbai, cinematic low angle, strong rim light, empty space on the left third for a headline. [STYLE] --ar 16:7`
- **Same, mobile crop:** `Vertical editorial street fashion photo, young Indian man in a black puffer jacket on a concrete rooftop at dusk, city lights blurred behind, empty space at the top for a headline. [STYLE] --ar 4:5`
- **Summer/linen drop:** `Editorial photo, Indian man in a loose cream linen shirt and beige trousers in a sunlit old Delhi lane with warm stone walls, soft hard-light shadows, relaxed pose, space on the left. [STYLE] --ar 16:7`
- **Denim drop:** `Editorial photo, Indian man in a baggy light-wash denim jacket and jeans sitting on metal stairs in a metro station, cool blue fluorescent light, space on the left. [STYLE] --ar 16:7`
- **Party / night edit:** `Editorial night photo, Indian man in a black shirt with subtle shine, neon red light from the side, dark background, confident gaze, space on the left. [STYLE] --ar 16:7`
- **Sale campaign:** `Bold studio photo, three Indian models in monochrome streetwear standing against a seamless signal red #E4002B background, hard flash light, high fashion energy, centred composition with space on the sides. [STYLE] --ar 16:7`

## 2. Backgrounds & textures (UI)
- **Promo band background:** `Seamless light concrete grey studio backdrop with soft vignette and very subtle texture, empty. [STYLE] --ar 24:5`
- **Dark tile background:** `Deep black textured concrete wall with a faint diagonal light streak, empty, moody. [STYLE] --ar 1:1`
- **Zebra-crossing texture strip:** `Top-down close-up of a worn white zebra crossing on dark asphalt, high contrast, abstract. [STYLE] --ar 16:5`
- **Alpha Club band:** `Black background with subtle gold-yellow #F4E04D light leaks and fine film grain, premium members-only feel, empty. [STYLE] --ar 16:5`
- **Gift card art (3 variants):** `Minimal gift card design background, black with a large abstract yellow #F4E04D hood-shaped pentagon outline, film grain, no text. --ar 16:10` (variants: red #E4002B, concrete grey)

## 3. Category & collection tiles
For **category cut-outs**, shoot your real products on white and remove the background (Photoroom). If you want a consistent styled look:
- **Ghost-mannequin style reference:** `Ghost mannequin product photo style reference of a men's heavyweight black oversized t-shirt, front view, perfectly centred, soft shadow on pure white, e-commerce standard. --ar 1:1.1` (use only as a shooting reference; photograph your own product the same way)
- **Collection tile mood (Puffer season / Smart casuals / Knit club):** `Tall editorial fashion photo, Indian male model in a [maroon puffer jacket / black shirt with beige trousers / cream cable-knit sweater], standing against a plain [concrete grey / warm stone / beige] wall, full body, centred, strong side light. [STYLE] --ar 10:13`

## 4. Offer & combo tiles
- **"Any 2 bottoms" tile:** `Two folded men's trousers (beige and black) stacked neatly on a light grey surface, top-down studio product shot, soft shadow, lots of empty space on the right. [STYLE] --ar 1:1`
- **"Combo hoodies" tile:** `Two hoodies (charcoal and stone) hanging on a matte black rail against a dark wall, studio light, empty space on the right. [STYLE] --ar 1:1`
- **"Sunglasses ₹999" tile:** `Black square sunglasses on a light grey concrete block, hard shadow, minimal product shot, empty space right. [STYLE] --ar 1:1`
- **"3 tees" tile:** `Three folded oversized t-shirts (black, white, olive) stacked, top-down, light grey background, empty space right. [STYLE] --ar 1:1`
(Final versions should use **your** products photographed in the same way.)

## 5. Icons & badges
- **Trust icons set:** `Set of 8 minimal line icons, 1.6px black strokes, square-ish geometric style: delivery truck, cash note, return arrows, shield with check, ruler, gift box, coin, lightning bolt. Evenly spaced grid, transparent background, flat vector. --ar 2:1` (or use lucide-react icons, already in the prototype)
- **Alpha Club tier badges:** `Three minimal badge emblems shaped like a hood pentagon: Member (white outline), Elite (silver), Legend (yellow #F4E04D on black), bold and simple, flat vector, transparent background. --ar 3:1`
- **Payment & COD badge strip:** use the official payment network logos only as their brand guidelines allow; otherwise text badges (UPI, VISA, RUPAY, COD).

## 6. Social media & ads
- **New drop announcement post:** `Instagram post, black background, huge bold condensed white text "NEW DROP" with "WINTER 26" in yellow #F4E04D below, a cut-out of a black puffer jacket in the centre, minimal streetwear poster style. --ar 4:5` (Ideogram)
- **Sale story:** `Vertical story poster, signal red #E4002B background, giant black condensed text "UP TO 40% OFF", small white text "THE ALPHA HOOD · ENDS SUNDAY", minimal. --ar 9:16` (Ideogram; verify text)
- **Combo offer post:** `Instagram post, light grey background, three folded tees fanned out, bold black condensed text "ANY 3 TEES ₹1,999" with the price in red. --ar 4:5`
- **Lookbook carousel cover:** `Editorial carousel cover, two Indian models in monochrome streetwear on a rooftop at golden hour, empty top area for a title. [STYLE] --ar 4:5`
- **Meta ad background template:** `Clean ad background, half light-grey seamless studio, half black, sharp vertical split, empty for product photos and text. --ar 1:1`
- **OG image:** `Black background, large bold condensed white wordmark area left (empty), a monochrome streetwear model photo on the right, red thin line accent. --ar 1.91:1`

## 7. Packaging & brand world
- **Mailer box mockup:** `Matte black e-commerce mailer box mockup, slightly open, white minimal hood pentagon logo area on the lid (blank), yellow tissue paper inside, studio light on concrete. --ar 4:3`
- **Polybag / garment tag:** `Matte black clothing hang tag with a white minimal geometric mark area (blank) and a red string, on a folded black tee, close-up. --ar 4:5`
- **Store / pop-up concept (future):** `Minimal streetwear store interior concept, raw concrete, black metal rails, one signal red wall, yellow neon accent line, monochrome clothes. [STYLE] --ar 16:9`

## 8. Logo exploration (refine in a vector tool afterwards)
```
Logo design for a men's streetwear brand called "THE ALPHA HOOD".
Mark: a bold geometric pentagon shaped like a hood/house (square body with a pointed top), solid black, with a strong
white capital letter "A" cut out in the centre; sharp corners, minimal, works at 16px.
Wordmark: "THE ALPHA HOOD" in an ultra-bold condensed sans-serif, all caps, wide letter spacing, black.
Show: (1) mark + wordmark horizontal, (2) mark alone, (3) white-on-black version, (4) mark in red #E4002B.
Flat vector, white background, no mockups, no other text.
```
Then redraw the chosen version as a clean SVG (Figma/Illustrator) or with a designer, and run a trademark search before using it.

## 9. Photoshoot shot list (for the real photos, not AI)
| Shot | Where used | Spec |
|---|---|---|
| On-model front (light grey seamless) | Card image 1, PDP 1 | 3:4, same framing for all |
| On-model back / side | PDP | 3:4 |
| Ghost mannequin / flat lay | Card image 2, category cut-outs | 1:1.1 on white |
| Fabric & detail close-ups | PDP | 3:4 |
| Full look styled | PDP, Shop the look | 3:4 / 4:5 |
| 10–15 s on-model video | PDP, ads | 9:16 + 3:4 |
| Campaign location shots | Hero, tiles, social | 16:7 + 4:5 crops |

## 10. Prompt for Claude Code (after assets are ready)
```
I've added assets to /public/images: hero/*-desktop.webp & *-mobile.webp, tiles/*.webp, offers/*.webp,
textures/*.webp, badges/*.svg, og/default.jpg. Wire them in per DESIGN.md §4 and GRAPHICS_PROMPTS.md:
use next/image (or the image CDN) with art-direction (<picture> desktop vs mobile crops), priority only for the
first hero slide, explicit sizes, alt text from the CMS, lazy loading below the fold. Product images come from
the commerce backend, not from /public.
```
