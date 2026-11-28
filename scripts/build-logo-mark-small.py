"""
Small logo-mark copies for the hero word marquee (components/home/brand-marquee.tsx).

The marquee shows the mark at about 24 px, many times. The SVG masters are about 20 KB each gzipped, which is too much for
a separator. This script resizes the kit's own 600 px PNG masters (public/brand/logo/mark_*@600.png). It only resizes
them, with no redrawing or recolouring (logo-kit rule), and saves 72 px lossless WebP (3x of 24 px).

Run:  python -I scripts/build-logo-mark-small.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public" / "brand" / "logo"
SIZE = 72

for name in ("mark_color", "mark_white"):
    src = LOGO / f"{name}@600.png"
    out = LOGO / f"{name}@{SIZE}.webp"
    with Image.open(src) as im:
        im.convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS).save(out, "WEBP", lossless=True, method=6)
    print(f"{out.relative_to(ROOT)}  {out.stat().st_size} bytes")
