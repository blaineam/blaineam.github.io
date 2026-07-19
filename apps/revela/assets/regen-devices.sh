#!/usr/bin/env bash
#
# Regenerates the transparent-background iPhone renders used by the Revela
# filmstrip section (assets/devices/*.webp).
#
# These are a VARIANT of the App Store screenshot project, not a separate
# design. The framing is read straight out of
#
#     <Apps>/Revela/docs/appstore-screenshots/Revela-iphone.monkr
#
# and only three things are changed:
#
#   1. background  →  type "transparent"   (App Store uses the "Darkroom Amber"
#                                           gradient; the site supplies its own
#                                           background, so the frame must be a
#                                           clean cut with real alpha)
#   2. shadow      →  disabled             (a baked rgba(0,0,0,0.4) halo reads
#                                           as a dirty smudge against the site's
#                                           dark brown; CSS owns the shadow now
#                                           — see .shot img in index.html)
#   3. screenshots →  stripped             (the CLI swaps fresh ones in via
#                                           --screenshots, so the derived file
#                                           stays a few KB instead of 30 MB)
#
# Device, colour, canvas, padding, scale, tilt and border radius are all
# inherited untouched, so the phones on the site are framed identically to the
# ones on the App Store listing.
#
# Source screenshots come from Revela's own demo-mode rig:
#     cd <Apps>/Revela && ./Tools/capture_screenshots.sh
# which seeds RVDemo (bundled art only — no user data, no PII) and drives each
# scene via -RVRoute. Never hand-capture these.
#
# Usage: ./regen-devices.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MONKR="${MONKR_ROOT:-$HOME/Documents/scripts/monkr}"
REVELA="${REVELA_ROOT:-$HOME/Documents/mine/Personal/Apps/Revela}"
APPSTORE_MONKR="$REVELA/docs/appstore-screenshots/Revela-iphone.monkr"
SHOTS="${REVELA_SHOTS:-$REVELA/screenshots/iphone-6.9}"
VARIANT="$HERE/Revela-iphone-web.monkr"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$APPSTORE_MONKR" ] || { echo "✗ No App Store project at $APPSTORE_MONKR"; exit 1; }
[ -d "$SHOTS" ] || { echo "✗ No screenshots at $SHOTS — run Revela's Tools/capture_screenshots.sh first"; exit 1; }

echo "==> Deriving web variant from the App Store project"
python3 - "$APPSTORE_MONKR" "$VARIANT" <<'PY'
import json, sys

src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    p = json.load(f)

before_bg = p['background'].get('gradientName') or p['background']['type']

# 1. Clean-cut alpha instead of the listing's gradient.
p['background'] = {
    'type': 'transparent',
    'solidColor': p['background'].get('solidColor', '#000000'),
    'gradientCss': None,
    'gradientName': None,
    'imageUrl': None,
}

# 2. No baked shadow — the site's CSS applies its own, tuned to the page.
for o in p['sceneObjects']:
    o['shadow'] = {**o.get('shadow', {}), 'enabled': False}
    # 3. Screenshots are supplied at render time.
    o['screenshotUrl'] = None
    o['screenshotFile'] = None
    o['extraScreenshots'] = []

p['exportConfig'] = {**p.get('exportConfig', {}), 'format': 'png'}

with open(dst, 'w') as f:
    json.dump(p, f, indent=2)

o = p['sceneObjects'][0]
print(f"    background : {before_bg} -> transparent")
print(f"    shadow     : disabled (CSS owns it)")
print(f"    inherited  : {o['deviceId']} / {o['deviceColorId']} / scale {o['scale']} / "
      f"canvas {p['canvasSize']['width']}x{p['canvasSize']['height']} / padding {p['padding']}")
PY

echo "==> Rendering framed devices via Monkr"
node "$MONKR/bin/monkr.mjs" render "$VARIANT" --out "$TMP" --screenshots "$SHOTS"

echo "==> Encoding alpha WebP (PNG masters are ~1.8 MB each; WebP is ~50 KB)"
mkdir -p "$HERE/devices"
rm -f "$HERE/devices"/*.webp
for f in "$TMP"/*.png; do
    base="$(basename "$f" .png)"
    cwebp -quiet -q 82 -alpha_q 100 -m 6 "$f" -o "$HERE/devices/$base.webp"
done

echo "==> Done:"
ls -la "$HERE/devices"
echo "    total: $(du -sh "$HERE/devices" | cut -f1)"
echo ""
echo "Sanity check — corners must be fully transparent, and with the shadow"
echo "disabled the alpha edge should be hard (no semi-opaque halo):"
python3 - "$HERE/devices" <<'PY'
import sys, glob, os
from PIL import Image
bad = 0
for p in sorted(glob.glob(os.path.join(sys.argv[1], '*.webp'))):
    im = Image.open(p).convert('RGBA')
    a = im.split()[3]
    corner = im.getpixel((3, 3))
    # Fraction of pixels that are partially transparent. A baked drop shadow
    # pushes this well up; a clean cut leaves only antialiased frame edges.
    hist = a.histogram()
    partial = sum(hist[8:248]) / float(im.width * im.height)
    ok = corner[3] == 0 and partial < 0.02
    bad += 0 if ok else 1
    print(f"  {'OK  ' if ok else 'FAIL'} {os.path.basename(p)} corner={corner} partial-alpha={partial:.4%}")
sys.exit(1 if bad else 0)
PY
