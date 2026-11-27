# Alpha Mascot Tee — source images

Owner-supplied product posters (1254 × 1254 PNG), one per colour:

| File | Colour |
|---|---|
| `olive.png` | Olive |
| `navy.png` | Navy |
| `teal.png` | Teal |
| `black.png` | Black |
| `bone.png` | Bone |

These are **source files only** — the store never serves them from here. `pnpm catalog:add-mascot-tee --apply` turns
each poster into three product photos (front crop, back crop, the full poster; JPEG), sends them through the same
media pipeline as an upload in Admin → Products (type sniffed, metadata stripped, random server-chosen id) and creates
the style with its five colours. After that, everything — photos, colours, price, stock, text — is edited in
Admin → Products like any other product.
