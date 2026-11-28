"""
Build the self-hosted Inter files in assets/fonts/ from the exact files Google
Fonts serves (the same source next/font/google used), so no glyph changes.

Why: next/font/google ships Google's unicode-range faces, and Google's Inter
"latin-ext" face includes the rupee sign (U+20B9). Every price on the
homepage therefore made each visitor download that whole 83 KB file at high
priority, just for one glyph. The site's other text is in the "latin" face.

What it writes (SIL Open Font License 1.1; copyright/licence name records kept):
  inter-latin.woff2       Google's Inter latin file, byte-for-byte
  inter-rupee.woff2       U+20B9 only (about 2 KB), cut from Google's latin-ext file
  inter-latin-ext.woff2   Google's Inter latin-ext file, byte-for-byte; app/layout.tsx
                          declares it WITHOUT U+20B9, so it still loads (as before)
                          when a page shows a character such as "ā", and not for ₹.
  inter-vietnamese.woff2  Google's Inter vietnamese file, byte-for-byte

Google's Cyrillic and Greek Inter faces are not shipped: the store doesn't use those
scripts, and such characters fall back to "Inter Fallback" (Arial with Inter metrics).
`lib/brand/fonts.test.ts` fails if a page renders a character the faces don't cover.

Usage (from the project folder):  python scripts/build-fonts.py
Needs: Python 3 with fontTools and brotli (`pip install fonttools brotli`).
"""

from __future__ import annotations

import io
import re
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parents[1] / "assets" / "fonts"
# Google picks the file build by user agent. This is the exact UA next/font/google sends
# (node_modules/next/dist/compiled/@next/font/dist/google/fetch-resource.js), so the files
# are byte-identical to the ones the site served before.
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36"
RUPEE = 0x20B9
QUERY = "Inter:wght@100..900"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:  # noqa: S310 - fixed https URLs only
        return res.read()


def faces() -> dict[str, tuple[str, str]]:
    css = fetch(f"https://fonts.googleapis.com/css2?family={QUERY}&display=swap").decode()
    found = {
        name: (url, rng.strip())
        for name, url, rng in re.findall(
            r"/\*\s*([a-z-]+)\s*\*/\s*@font-face\s*{[^}]*?url\((https://[^)]+\.woff2)\)[^}]*?unicode-range:\s*([^;]+);",
            css,
        )
    }
    for need in ("latin", "latin-ext", "vietnamese"):
        if need not in found:
            sys.exit(f"{QUERY}: no '{need}' face in the Google CSS")
    return found


def rupee_only(font: TTFont) -> TTFont:
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.hinting = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[RUPEE])
    sub.subset(font)
    return font


def write(name: str, data: bytes) -> None:
    (OUT / name).write_bytes(data)
    print(f"  {name}: {len(data) / 1024:.1f} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    found = faces()
    for name in ("latin", "latin-ext", "vietnamese"):
        print(f"  google {name} unicode-range: {found[name][1]}")
    write("inter-latin.woff2", fetch(found["latin"][0]))
    ext_raw = fetch(found["latin-ext"][0])
    write("inter-latin-ext.woff2", ext_raw)
    write("inter-vietnamese.woff2", fetch(found["vietnamese"][0]))

    ext = TTFont(io.BytesIO(ext_raw))
    if RUPEE not in ext.getBestCmap():
        sys.exit("latin-ext has no U+20B9")
    rupee = rupee_only(ext)
    rupee.flavor = "woff2"
    buf = io.BytesIO()
    rupee.save(buf)
    write("inter-rupee.woff2", buf.getvalue())


if __name__ == "__main__":
    main()
