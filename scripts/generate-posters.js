#!/usr/bin/env node
/*
 * Generates Open Graph posters for the /apps index and every individual app site.
 *
 * - Reads the app list (order + icon) from apps/index.html so the main poster's
 *   "prominence" reflects the page order (first app is centered and largest).
 * - Produces a floating/flying-toward-the-viewer composite for /apps.
 * - Produces a single-icon randomized fly-in poster for every app site.
 * - Caches by hashing the app list + icon files; skips work when nothing changed.
 *
 * Usage: node scripts/generate-posters.js [--force]
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const APPS_DIR = path.join(ROOT, "apps");
const APPS_INDEX = path.join(APPS_DIR, "index.html");
const MAIN_POSTER_PATH = path.join(APPS_DIR, "apps-by-blaine-miller.jpg");
const CACHE_PATH = path.join(APPS_DIR, ".poster-cache.json");
const PREVIEW_DIR = path.join(APPS_DIR, ".poster-previews");

const FORCE = process.argv.includes("--force");

// Bump when the layout/tilt algorithm changes in any way that would alter
// the rendered output. The cache fingerprint folds this in, so a checkout
// with stale `apps-by-blaine-miller.jpg` from before the change will
// regenerate on the next local run even though no app icon files changed.
// CI runs with --force and ignores the cache, so this only affects local
// dev workflows — but it keeps repo state internally consistent.
const ALGORITHM_VERSION = "shrapnel-v2";
// --prototype renders test posters at varying app counts so the layout can be
// validated visually before regenerating the real posters. Counts can be
// supplied as a comma-separated list (e.g. --prototype 3,5,7,10,14,18,24,28)
// or omitted to use a sensible default series.
const PROTOTYPE_FLAG_INDEX = process.argv.indexOf("--prototype");
const PROTOTYPE = PROTOTYPE_FLAG_INDEX !== -1;
const PROTOTYPE_COUNTS = (() => {
  if (!PROTOTYPE) return null;
  const arg = process.argv[PROTOTYPE_FLAG_INDEX + 1];
  if (!arg || arg.startsWith("--")) return [3, 5, 7, 10, 14, 18, 24, 28];
  return arg
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1);
})();

// Poster canvas matches the current posters: 2000x1571 (ratio ~1.273).
const POSTER_W = 2000;
const POSTER_H = 1571;

// ---------- Helpers ----------

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// Deterministic PRNG (mulberry32) seeded from a hex string.
function seededRng(seedHex) {
  let h = 0;
  for (let i = 0; i < seedHex.length; i++) {
    h = (h * 31 + seedHex.charCodeAt(i)) >>> 0;
  }
  let a = h || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Parse ordered list of {slug, iconPath} from apps/index.html.
function parseApps() {
  const html = fs.readFileSync(APPS_INDEX, "utf8");
  // Matches each app card anchor (order-preserving) and the first icon <img>
  // that appears before its closing </a>.
  const cardRe =
    /<a\b[^>]*\bdata-app="([^"]+)"[^>]*>[\s\S]*?<img\s+src="([^"]+)"[^>]*alt="[^"]*"[^>]*>[\s\S]*?<\/a>/g;
  const apps = [];
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const slug = m[1];
    const rel = m[2];
    const iconPath = path.join(APPS_DIR, rel);
    if (!fs.existsSync(iconPath)) {
      throw new Error(`Icon not found for ${slug}: ${iconPath}`);
    }
    apps.push({ slug, iconPath });
  }
  if (apps.length === 0) {
    throw new Error("No apps parsed from apps/index.html");
  }
  return apps;
}

// Color helpers.
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function toHex({ r, g, b }) {
  const p = (n) => n.toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

// Extract a representative hue from an icon by sampling a downscaled image
// and averaging reasonably saturated pixels.
async function dominantHue(iconPath) {
  const { data, info } = await sharp(iconPath)
    .resize(48, 48, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sumX = 0,
    sumY = 0,
    count = 0,
    sumL = 0,
    totalL = 0,
    total = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    totalL += l;
    total++;
    if (s > 0.25 && l > 0.15 && l < 0.9) {
      const rad = (h * Math.PI) / 180;
      sumX += Math.cos(rad) * s;
      sumY += Math.sin(rad) * s;
      sumL += l;
      count++;
    }
  }
  if (count === 0) {
    return { h: 220, l: totalL / Math.max(total, 1) };
  }
  const h = ((Math.atan2(sumY, sumX) * 180) / Math.PI + 360) % 360;
  return { h, l: sumL / count };
}

// Pick a pleasant dark background palette for a given icon hue. Two issues to
// solve: (a) many of the real icons cluster in the blue family, so a pure
// "hue + 150°" rule collapses their complements into a narrow orange slice;
// (b) a true diametric complement can feel harsh. We map each 30° hue slice
// to a hand-picked companion hue inspired by the original hand-tuned
// posters, then offset by a slug-derived jitter so adjacent-hue icons still
// look distinct from each other.
const HUE_COMPANIONS = [
  // family center (deg) -> companion hue (deg). Covers 12 slices, 30° each.
  { family: 0, companion: 205 }, // red        -> deep teal
  { family: 30, companion: 215 }, // orange     -> ocean blue
  { family: 60, companion: 255 }, // yellow     -> indigo
  { family: 90, companion: 280 }, // lime       -> violet
  { family: 120, companion: 295 }, // green      -> purple
  { family: 150, companion: 320 }, // emerald    -> magenta
  { family: 180, companion: 345 }, // cyan       -> rose
  { family: 210, companion: 25 }, // azure      -> burnt orange
  { family: 240, companion: 290 }, // blue       -> deep purple
  { family: 270, companion: 155 }, // violet     -> emerald
  { family: 300, companion: 120 }, // magenta    -> grass green
  { family: 330, companion: 180 }, // rose       -> cyan
];

function companionHue(hue) {
  const h = ((hue % 360) + 360) % 360;
  // Interpolate between the two nearest family anchors so neighboring icons
  // flow smoothly rather than snapping bin-to-bin.
  const slot = h / 30;
  const i0 = Math.floor(slot) % 12;
  const i1 = (i0 + 1) % 12;
  const t = slot - Math.floor(slot);
  const a = HUE_COMPANIONS[i0].companion;
  let b = HUE_COMPANIONS[i1].companion;
  // Shortest arc around the colour wheel.
  if (b - a > 180) b -= 360;
  if (a - b > 180) b += 360;
  return ((a + (b - a) * t) % 360 + 360) % 360;
}

function pleasantPalette(hue, seedStr) {
  // Slug-based jitter (±18°) so similar-hue icons still get distinct bgs.
  const rng = seededRng("palette:" + (seedStr || ""));
  const jitter = (rng() - 0.5) * 36;
  const comp = (companionHue(hue) + jitter + 360) % 360;
  const inner = hslToRgb(comp, 0.78, 0.32); // saturated focal highlight
  const mid = hslToRgb(comp, 0.72, 0.13);
  const outer = hslToRgb(comp, 0.55, 0.035); // near-black with hue tint
  return { inner, mid, outer };
}

function backgroundSvg(palette, seed = 0) {
  const { inner, mid, outer } = palette;
  // Focal point is randomized a bit; matches current posters where the bright
  // blob sits slightly off-center.
  const rng = seededRng(String(seed));
  const cx = 18 + rng() * 20; // 18%..38%
  const cy = 22 + rng() * 18; // 22%..40%
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_W}" height="${POSTER_H}" viewBox="0 0 ${POSTER_W} ${POSTER_H}">
  <defs>
    <radialGradient id="bg" cx="${cx}%" cy="${cy}%" r="95%" fx="${cx}%" fy="${cy}%">
      <stop offset="0%" stop-color="${toHex(inner)}" stop-opacity="1"/>
      <stop offset="45%" stop-color="${toHex(mid)}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${toHex(outer)}" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${POSTER_W}" height="${POSTER_H}" fill="${toHex(outer)}"/>
  <rect x="0" y="0" width="${POSTER_W}" height="${POSTER_H}" fill="url(#bg)"/>
</svg>`;
}

async function renderBackground(palette, seed) {
  return sharp(Buffer.from(backgroundSvg(palette, seed)))
    .png()
    .toBuffer();
}

// ---------- Perspective warp (real depth-of-field tilt) ----------
//
// Sharp's `affine` only does parallel-preserving transforms (rotate / shear /
// scale), so a "3D tilt" through it just foreshortens the icon symmetrically
// — it reads as squashed, not as a card tipped into depth. For the shrapnel
// look we need a true projective transform: the icon's inner edge (the one
// facing the canvas center) recedes into depth while the outer edge stays
// closer to the viewer. That's a homography, which means a 3×3 matrix and a
// manual pixel-by-pixel warp.

// Solve an n×n linear system via Gaussian elimination with partial pivoting.
function gaussianSolve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(M[j][i]) > Math.abs(M[pivot][i])) pivot = j;
    }
    [M[i], M[pivot]] = [M[pivot], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) throw new Error("Singular matrix in homography solve");
    for (let j = i + 1; j < n; j++) {
      const factor = M[j][i] / M[i][i];
      for (let k = i; k <= n; k++) M[j][k] -= factor * M[i][k];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }
  return x;
}

// Compute the 3×3 homography H (flat 9-element array, row-major) that maps the
// 4 source points to the 4 destination points. Uses DLT with h22 fixed at 1.
function computeHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i];
    const [dx, dy] = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }
  const h = gaussianSolve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function invert3x3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("Singular homography");
  const inv = 1 / det;
  return [
    A * inv,
    (c * h - b * i) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    (c * d - a * f) * inv,
    C * inv,
    (b * g - a * h) * inv,
    (a * e - b * d) * inv,
  ];
}

// Compute destination corners for a "shrapnel tilt": the icon's edge facing
// the canvas center (the inner edge along `outwardAngle`) recedes into depth,
// while the outer edge stays closer to the viewer. Uses a proper viewer-
// distance perspective so the near edge gets visibly larger and the far edge
// visibly smaller — a real trapezoid, not just a parallelogram.
function shrapnelCorners(iconW, iconH, outwardAngle, tiltStrength) {
  const halfW = iconW / 2;
  const halfH = iconH / 2;
  const sourceCorners = [
    [-halfW, -halfH],
    [+halfW, -halfH],
    [+halfW, +halfH],
    [-halfW, +halfH],
  ];
  const ox = Math.cos(outwardAngle);
  const oy = Math.sin(outwardAngle);
  const px = -oy;
  const py = ox;
  // Tilt up to ~54°: enough to read as a hard tip toward the viewer without
  // foreshortening icons past recognition.
  const tiltAngle = tiltStrength * Math.PI * 0.3;
  const cosT = Math.cos(tiltAngle);
  const sinT = Math.sin(tiltAngle);
  const avgSize = (iconW + iconH) / 2;
  // Closer viewer distance = more dramatic perspective. 1.4× icon size gives
  // a strong but not warped-fisheye-like effect.
  const viewDist = 1.4 * avgSize;
  return sourceCorners.map(([sx, sy]) => {
    const o = sx * ox + sy * oy;
    const p = sx * px + sy * py;
    // Tip around the perpendicular axis through icon center: the outward
    // component foreshortens, and out-of-plane z emerges.
    const oPrime = o * cosT;
    // Sign convention: outer corner (o > 0) moves toward viewer (z negative),
    // inner corner (o < 0) recedes (z positive). Pinhole-style scaling then
    // magnifies near corners and shrinks far corners.
    const z = -o * sinT;
    const persp = viewDist / (viewDist + z);
    const oFinal = oPrime * persp;
    const pFinal = p * persp;
    const fx = oFinal * ox + pFinal * px;
    const fy = oFinal * oy + pFinal * py;
    return [fx + halfW, fy + halfH];
  });
}

// Inverse-map a destination quad back to a source rectangle, bilinear sample.
function perspectiveWarpRgba(srcBuf, srcW, srcH, dstCorners) {
  const xs = dstCorners.map((c) => c[0]);
  const ys = dstCorners.map((c) => c[1]);
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  const outW = Math.max(1, maxX - minX);
  const outH = Math.max(1, maxY - minY);
  const srcCorners = [
    [0, 0],
    [srcW, 0],
    [srcW, srcH],
    [0, srcH],
  ];
  const H = computeHomography(srcCorners, dstCorners);
  const Hi = invert3x3(H);
  const out = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const dy = y + minY;
    for (let x = 0; x < outW; x++) {
      const dx = x + minX;
      const wDen = Hi[6] * dx + Hi[7] * dy + Hi[8];
      const sx = (Hi[0] * dx + Hi[1] * dy + Hi[2]) / wDen;
      const sy = (Hi[3] * dx + Hi[4] * dy + Hi[5]) / wDen;
      const ofs = (y * outW + x) * 4;
      if (sx < 0 || sx > srcW - 1 || sy < 0 || sy > srcH - 1) {
        out[ofs] = 0;
        out[ofs + 1] = 0;
        out[ofs + 2] = 0;
        out[ofs + 3] = 0;
        continue;
      }
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const y0 = Math.floor(sy);
      const y1 = Math.min(srcH - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w01 = fx * (1 - fy);
      const w10 = (1 - fx) * fy;
      const w11 = fx * fy;
      const i00 = (y0 * srcW + x0) * 4;
      const i01 = (y0 * srcW + x1) * 4;
      const i10 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;
      out[ofs] = Math.round(
        srcBuf[i00] * w00 +
          srcBuf[i01] * w01 +
          srcBuf[i10] * w10 +
          srcBuf[i11] * w11,
      );
      out[ofs + 1] = Math.round(
        srcBuf[i00 + 1] * w00 +
          srcBuf[i01 + 1] * w01 +
          srcBuf[i10 + 1] * w10 +
          srcBuf[i11 + 1] * w11,
      );
      out[ofs + 2] = Math.round(
        srcBuf[i00 + 2] * w00 +
          srcBuf[i01 + 2] * w01 +
          srcBuf[i10 + 2] * w10 +
          srcBuf[i11 + 2] * w11,
      );
      out[ofs + 3] = Math.round(
        srcBuf[i00 + 3] * w00 +
          srcBuf[i01 + 3] * w01 +
          srcBuf[i10 + 3] * w10 +
          srcBuf[i11 + 3] * w11,
      );
    }
  }
  return { data: out, width: outW, height: outH, offsetX: minX, offsetY: minY };
}

// Apple-style "squircle" (continuous-corner superellipse) alpha mask.
// Formula: (|x|/r)^n + (|y|/r)^n <= 1 with n≈5 matches the iOS 13+ icon
// silhouette more faithfully than a plain rounded-rect radius would.
// 4x4 supersampling gives a clean anti-aliased edge; results are memoized
// per-size because every app at the same ring shares a mask.
const SQUIRCLE_EXPONENT = 5;
const squircleMaskCache = new Map();
function squircleMaskBuffer(size) {
  const cached = squircleMaskCache.get(size);
  if (cached) return cached;
  const n = SQUIRCLE_EXPONENT;
  const ss = 4; // supersample factor
  const r = size / 2;
  const buf = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        const yy = (y + (sy + 0.5) / ss - r) / r;
        const ay = Math.pow(Math.abs(yy), n);
        for (let sx = 0; sx < ss; sx++) {
          const xx = (x + (sx + 0.5) / ss - r) / r;
          const v = Math.pow(Math.abs(xx), n) + ay;
          if (v <= 1) hits++;
        }
      }
      buf[y * size + x] = Math.round((hits / (ss * ss)) * 255);
    }
  }
  squircleMaskCache.set(size, buf);
  return buf;
}

// Multiply the existing alpha channel by the squircle mask so icons whose
// source PNG is a full-bleed square get clipped to the iOS silhouette.
// Icons that already have rounded alpha (e.g. a transparent squircle PNG)
// stay unchanged because the mask is 1.0 over the interior.
function applySquircleMask(rgbaBuffer, size) {
  const mask = squircleMaskBuffer(size);
  const out = Buffer.from(rgbaBuffer);
  for (let i = 0, j = 0; j < mask.length; i += 4, j++) {
    out[i + 3] = (out[i + 3] * mask[j] + 127) >> 8;
  }
  return out;
}

// Prepare a single icon: resize, clip to an iOS-style squircle silhouette,
// apply an in-plane rotation (rotZ) for organic variety, then warp through a
// real perspective transform so the inner edge recedes into depth and the
// outer edge stays toward the viewer — the shrapnel tilt. Finally drop a
// soft shadow behind it.
async function tiltedIconWithShadow(iconPath, size, tilt) {
  const { rotZ, outwardAngle, tiltStrength } = tilt;

  // 1. Flat, squircle-clipped icon.
  const iconRaw = await sharp(iconPath)
    .resize(size, size, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const maskedRgba = applySquircleMask(iconRaw.data, size);

  // 2. In-plane rotation (rotZ). Sharp's affine handles the resampling, then
  //    we pull the raw buffer back out for the perspective warp.
  let flatBuf = maskedRgba;
  let flatW = size;
  let flatH = size;
  if (Math.abs(rotZ) > 0.001) {
    const c = Math.cos(rotZ);
    const s = Math.sin(rotZ);
    const rotated = await sharp(maskedRgba, {
      raw: { width: size, height: size, channels: 4 },
    })
      .affine([c, -s, s, c], {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        interpolator: "bicubic",
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    flatBuf = rotated.data;
    flatW = rotated.info.width;
    flatH = rotated.info.height;
  }

  // 3. Perspective warp toward the canvas center.
  const dstCorners = shrapnelCorners(flatW, flatH, outwardAngle, tiltStrength);
  const warped = perspectiveWarpRgba(flatBuf, flatW, flatH, dstCorners);

  // 4. Soft drop shadow from the warped silhouette.
  const shadowBlur = Math.max(8, Math.round(size * 0.07));
  const shadowOffsetX = Math.round(size * 0.02);
  const shadowOffsetY = Math.round(size * 0.06);
  const shadowOpacity = 0.55;
  const shadowRaw = Buffer.alloc(warped.data.length);
  for (let i = 0; i < warped.data.length; i += 4) {
    shadowRaw[i] = 0;
    shadowRaw[i + 1] = 0;
    shadowRaw[i + 2] = 0;
    shadowRaw[i + 3] = Math.round(warped.data[i + 3] * shadowOpacity);
  }
  const shadow = await sharp(shadowRaw, {
    raw: { width: warped.width, height: warped.height, channels: 4 },
  })
    .blur(shadowBlur)
    .png()
    .toBuffer();

  const iconPng = await sharp(warped.data, {
    raw: { width: warped.width, height: warped.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const padX = shadowBlur * 2 + Math.abs(shadowOffsetX);
  const padY = shadowBlur * 2 + Math.abs(shadowOffsetY);
  const finalW = warped.width + padX * 2;
  const finalH = warped.height + padY * 2;

  const buffer = await sharp({
    create: {
      width: finalW,
      height: finalH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadow, left: padX + shadowOffsetX, top: padY + shadowOffsetY },
      { input: iconPng, left: padX, top: padY },
    ])
    .png()
    .toBuffer();

  return { buffer, width: finalW, height: finalH };
}

// ---------- Adaptive layout ----------
//
// The goal is a "shrapnel from an explosion behind the center" look that works
// at any total app count: each icon should remain mostly visible (≥60% of its
// face), tilted just enough to feel airborne but not so much that the artwork
// becomes unrecognizable. The old fixed two-ring layout crowded the inner ring
// (e.g. 8 icons at 408px on a circumference of ~3.6k → adjacent icons sat
// inside each other's bbox) and then jitter pushed adjacent icons further in.
// This replacement picks ring counts/sizes so each ring's circumference can
// hold its icons with breathing room, then degrades smoothly as the total
// grows.

// Center icon size scales down modestly as more apps share the frame. The
// hero stays clearly dominant at low counts and never shrinks past the
// point where it can anchor the composition.
function centerSizeForTotal(total, canvasH) {
  const t = Math.max(0, Math.min(1, (total - 3) / 25));
  const factor = 0.4 - 0.08 * t; // 0.40 -> 0.32
  return Math.round(factor * canvasH);
}

// Pick how many rings to use and how many icons per ring. The analytical
// layout solver picks the biggest icon size that satisfies the 20%-coverage
// rule across every pair; ring counts here are chosen so the resulting
// icons stay generous at low counts and degrade gracefully at high counts.
function distributionForRemaining(remaining) {
  if (remaining <= 0) return [];
  if (remaining <= 7) return [remaining];
  if (remaining <= 16) {
    const inner = Math.ceil(remaining / 2);
    return [inner, remaining - inner];
  }
  // 3 rings for high counts — gives the cross-ring constraint more places
  // to spread the icons without packing each ring beyond its arc capacity.
  const inner = Math.max(3, Math.round(remaining * 0.32));
  const mid = Math.max(3, Math.round(remaining * 0.35));
  const outer = remaining - inner - mid;
  return [inner, mid, outer];
}

// Hero ratio (center icon size = HERO_RATIO × ring icon size). At 1-ring
// counts the hero can be slightly less dominant since rings sit further
// out; at multi-ring counts a stronger hero anchors the composition.
function heroRatioForRingCount(ringCount) {
  return ringCount === 1 ? 1.5 : 2.0;
}

// For a ring with `n` evenly-spaced slots, the maximum |sin(angle)| over
// slots — i.e. how close any slot can sit to the canvas top/bottom (where
// sin = ±1). Determines how big the ring's vertical semi-axis can be
// without an icon clipping the canvas edge.
function ringMaxAbsSinForCount(n) {
  // For even n with slot/2 phase offset, no slot lies on the vertical axis,
  // and max|sin| = cos(π/n). For odd n we can't avoid having some slot
  // close to ±π/2; the best phase gives max|sin| = sin(π/2 - π/(2n)) ≈
  // cos(π/(2n)). Use the looser bound for both — slightly conservative.
  return Math.cos(Math.PI / (2 * n));
}

// Phase offset per ring. Even rings get a half-slot offset (so no slot sits
// at the very top or bottom of the canvas); odd rings get no offset because
// half-slot offset puts a slot directly at ±π/2. Then we stack a per-ring
// stagger so adjacent rings don't share radial spokes (which would let one
// ring's icon hide directly behind another).
function ringPhaseForCount(n, ringIndex) {
  const slot = (2 * Math.PI) / n;
  const evenOffset = n % 2 === 0 ? slot / 2 : 0;
  // 0.21 rad ≈ 12° per ring index. With at most 4 rings we stagger up to 36°
  // total, more than enough to break radial alignment between any two rings
  // at all the slot counts we use.
  const stagger = ringIndex * 0.21;
  return -Math.PI / 2 + evenOffset + stagger;
}

// Ramanujan approximation of an ellipse perimeter. Good enough for capacity.
function ellipsePerimeter(rx, ry) {
  const h = Math.pow(rx - ry, 2) / Math.pow(rx + ry, 2);
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

// Analytical layout solver. We pick the LARGEST uniform ring icon size S
// that satisfies every 20%-coverage constraint, then derive ring radii to
// place icons exactly at the SPACING threshold. No iteration — the answer
// follows from solving the binding inequalities.
//
// With center size C = c × S (hero ratio), SPACING between any pair of
// adjacent rings (and center↔inner) of 0.85 × avgSize (this is the
// 20%-coverage threshold for diagonal-aligned equal squares), and the
// outermost ring needing to leave half an icon of canvas margin:
//
//   R_inner   ≥ 0.85 × (C + S) / 2 = 0.85 × (c+1)/2 × S           (center↔inner)
//   R_inner   ≥ 0.85 × S / (2 sin(π/innerCount))                   (inner same-ring)
//   R_{i+1}   ≥ R_i + 0.85 × S                                     (cross-ring)
//   R_outer + S/2 ≤ canvasH/2                                      (canvas fit)
//
// Substituting through gives:
//   S × (A + (rings-1)×0.85 + 0.5) ≤ canvasH/2
// where A is the max of the center↔inner and inner-same-ring coefficients,
// also checked against same-ring coefficients on the outer rings (which
// can bind too if the outer ring has many icons).
function planLayout(total, canvasW, canvasH) {
  const remaining = Math.max(0, total - 1);
  if (remaining === 0) {
    return {
      centerSize: Math.round(0.4 * canvasH),
      rings: [],
    };
  }

  const distribution = distributionForRemaining(remaining);
  const ringCount = distribution.length;
  const aspect = canvasW / canvasH;
  const stretch = 1 + (aspect - 1) * 0.55;
  // SPACING is the minimum D / avgSize ratio between adjacent icons. For
  // axis-aligned overlap (worst case at our slot positions), coverage of the
  // smaller icon hits exactly 20% at SPACING = (c + 0.6) / (c + 1). For
  // c = 2 (multi-ring hero ratio) that's 0.867; we round up to 0.90 to
  // leave headroom for per-icon angular/radial jitter applied at render
  // time, which can pull adjacent icons a few percent closer.
  const SPACING = 0.9;
  const c = heroRatioForRingCount(ringCount);

  // A = the smallest viable R_inner expressed as a multiple of S.
  // Start with the center↔inner constraint.
  let A = (SPACING * (c + 1)) / 2;
  // Then check the same-ring constraint on every ring; for ring index i
  // (0=innermost), R_i = R_inner + i × SPACING × S, so R_inner ≥
  // (coeff - i × SPACING) × S, where coeff = SPACING / (2 sin(π/count)).
  for (let i = 0; i < ringCount; i++) {
    const n = distribution[i];
    if (n < 2) continue;
    const coeff = SPACING / (2 * Math.sin(Math.PI / n));
    const requiredA = coeff - i * SPACING;
    if (requiredA > A) A = requiredA;
  }
  const totalCoef = A + (ringCount - 1) * SPACING + 0.5;
  const S = Math.max(80, Math.floor(canvasH / 2 / totalCoef));
  const C = Math.max(120, Math.round(c * S));

  const R_inner = A * S;
  const rings = distribution.map((count, i) => {
    const ry = R_inner + i * SPACING * S;
    // Horizontal radius gets the canvas-aspect stretch but is capped so the
    // icon doesn't clip the left/right edge.
    let rx = ry * stretch;
    const maxRx = canvasW / 2 - S / 2;
    if (rx > maxRx) rx = maxRx;
    return { count, iconSize: S, rx, ry };
  });

  return { centerSize: C, rings };
}

// Produce ordered placements (one per app). Index 0 is centered; subsequent
// placements walk ring-by-ring with evenly-spaced angles plus modest jitter
// that stays well inside the per-ring slot so neighbours can't collide.
function placementsForLayout(layout, rng, canvasW, canvasH) {
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const out = [
    {
      ring: 0,
      pos: { x: cx, y: cy },
      size: layout.centerSize,
      angleFromCenter: 0,
      outward: 0,
    },
  ];
  for (let r = 0; r < layout.rings.length; r++) {
    const ring = layout.rings[r];
    const { count } = ring;
    if (count === 0) continue;
    const slot = (2 * Math.PI) / count;
    // Per-ring phase picked so (a) no slot lands at ±π/2 when avoidable
    // (canvas top/bottom clipping) and (b) adjacent rings are staggered so
    // their spokes don't align (which would let one ring's icon hide
    // directly behind another's).
    const ringPhase = ringPhaseForCount(count, r) + (rng() - 0.5) * 0.3;
    for (let k = 0; k < count; k++) {
      const base = ringPhase + k * slot;
      // Angular jitter capped at 18% of the slot so neighbours stay safely
      // separated even when both wander toward each other.
      const aJit = (rng() - 0.5) * slot * 0.18;
      // Radial jitter ±5% — breaks the perfect-circle silhouette without
      // letting an outer icon drift onto the inner ring's track.
      const rScale = 1 + (rng() - 0.5) * 0.1;
      const a = base + aJit;
      const x = cx + Math.cos(a) * ring.rx * rScale;
      const y = cy + Math.sin(a) * ring.ry * rScale;
      const dxN = x - cx;
      const dyN = y - cy;
      const mag = Math.hypot(dxN, dyN) || 1;
      out.push({
        ring: r + 1,
        pos: { x, y },
        size: ring.iconSize,
        angleFromCenter: Math.atan2(dyN, dxN),
        outward: Math.min(1, mag / (canvasH * 0.55)),
      });
    }
  }
  return out;
}

// Pick a tilt that reads as "shrapnel from an explosion behind the center,
// each fragment caught mid-flight." Two pieces:
//   - `outwardAngle` + `tiltStrength`: a real perspective warp where the
//     inner edge (the side of the icon facing the canvas center) recedes
//     into depth, like the back-side of a tumbling fragment tipped past the
//     viewer.
//   - `rotZ`: an in-plane rotation that varies per-icon so the field doesn't
//     read as "tidy iOS grid." Magnitude is large enough to look like the
//     fragments are tumbling, but kept under ~25° so we don't read as
//     "icons rotated for design fun."
function tiltForPlacement(placement, rng, deg) {
  if (placement.ring === 0) {
    // Center: the focal point of the explosion. A small perspective hint and
    // very slight rotation so it isn't dead-flat next to its tumbling
    // neighbours.
    return {
      rotZ: (rng() - 0.5) * 6 * deg,
      // Radial direction is arbitrary at the center; pick one and let the
      // tiny tiltStrength sell a touch of depth.
      outwardAngle: rng() * Math.PI * 2,
      tiltStrength: 0.08 + rng() * 0.05,
    };
  }
  const ringStep = Math.min(placement.ring - 1, 3);
  // Tilt strength grows with ring — outer fragments have traveled farther
  // since the explosion and so are more tipped past the viewer.
  const baseStrength = 0.45 + ringStep * 0.08;
  const tiltStrength = Math.max(
    0.3,
    Math.min(0.75, baseStrength + (rng() - 0.5) * 0.18),
  );
  // In-plane rotation: per-fragment tumble. Bias slightly outward so the
  // rotation feels coupled to the radial direction rather than random.
  const tumble = (rng() - 0.5) * 36 * deg; // ±18°
  return {
    rotZ: tumble,
    outwardAngle: placement.angleFromCenter,
    tiltStrength,
  };
}

// ---------- Main poster (multi-icon fly-towards-viewer) ----------

async function renderMainPosterTo(apps, seedHex, outputPath) {
  const rng = seededRng(seedHex + ":main");
  const deg = Math.PI / 180;

  // Background hue comes from the centered app blended with the runner-up so
  // the palette feels related to the focal icon without locking to a single
  // hue when neighbouring icons are very different.
  const primaryHue = (await dominantHue(apps[0].iconPath)).h;
  const secondaryHue =
    apps.length > 1 ? (await dominantHue(apps[1].iconPath)).h : primaryHue;
  const blendedHue =
    (((primaryHue + secondaryHue) / 2) % 360 + 360) % 360;
  const palette = pleasantPalette(blendedHue, "main");
  const bg = await renderBackground(palette, seedHex + ":main");

  const layout = planLayout(apps.length, POSTER_W, POSTER_H);
  const slots = placementsForLayout(layout, rng, POSTER_W, POSTER_H);

  const placements = apps.map((app, i) => {
    const slot = slots[i];
    return {
      app,
      order: i,
      ring: slot.ring,
      size: slot.size,
      pos: slot.pos,
      tilt: tiltForPlacement(slot, rng, deg),
    };
  });

  const rendered = await Promise.all(
    placements.map((p) =>
      tiltedIconWithShadow(p.app.iconPath, p.size, p.tilt).then((res) => ({
        ...p,
        ...res,
      })),
    ),
  );

  // Draw order: outer rings (back) first, inner toward center on top, and
  // within each ring the later apps in the page order draw first so the more
  // prominent (earlier) apps end up on top of any partial overlap. This keeps
  // the page-order "prominence" intact while making the most-likely-overlapped
  // ring the back layer.
  const drawOrder = [...rendered].sort((a, b) => {
    if (b.ring !== a.ring) return b.ring - a.ring;
    return b.order - a.order;
  });
  const composites = drawOrder.map((p) => {
    let left = Math.round(p.pos.x - p.width / 2);
    let top = Math.round(p.pos.y - p.height / 2);
    left = Math.max(0, Math.min(POSTER_W - p.width, left));
    top = Math.max(0, Math.min(POSTER_H - p.height, top));
    return { input: p.buffer, left, top, blend: "over" };
  });

  const jpg = await sharp(bg)
    .composite(composites)
    .jpeg({ quality: 88, progressive: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
  fs.writeFileSync(outputPath, jpg);
  return outputPath;
}

async function renderMainPoster(apps, seedHex) {
  return renderMainPosterTo(apps, seedHex, MAIN_POSTER_PATH);
}

// ---------- Per-app poster (single icon fly-in) ----------

async function renderAppPoster(app, seedHex) {
  const posterPath = path.join(
    APPS_DIR,
    app.slug,
    "assets",
    "images",
    "poster.jpg",
  );
  // Only generate posters for apps that actually have a hosted landing page
  // under /apps/<slug>/ (blip/glint are external and don't need one).
  const appIndex = path.join(APPS_DIR, app.slug, "index.html");
  if (!fs.existsSync(appIndex)) return null;
  const posterDir = path.dirname(posterPath);
  if (!fs.existsSync(posterDir)) return null;

  const rng = seededRng(seedHex + ":" + app.slug);
  const { h } = await dominantHue(app.iconPath);
  const palette = pleasantPalette(h, app.slug);
  const bg = await renderBackground(palette, seedHex + ":" + app.slug);

  // Single large, dramatically tilted icon — the per-app poster is meant to
  // feel like that icon is the one flying past, so push the angles further
  // than on the composite. Size is held under ~0.46×H so the perspective
  // warp (which can expand the bbox along the tilt axis by ~30%) + rotZ
  // (another ~28%) + shadow padding still produces an image smaller than
  // the canvas — Sharp's composite rejects inputs larger than the base.
  const size = Math.round(POSTER_H * 0.46);
  const deg = Math.PI / 180;
  const tilt = {
    rotZ: (rng() - 0.5) * 36 * deg, // ±18° tumble
    outwardAngle: rng() * Math.PI * 2,
    tiltStrength: 0.45 + (rng() - 0.5) * 0.15, // 0.375..0.525
  };
  const icon = await tiltedIconWithShadow(app.iconPath, size, tilt);

  const offsetX = (rng() - 0.5) * POSTER_W * 0.12;
  const offsetY = (rng() - 0.5) * POSTER_H * 0.08;
  let left = Math.round(POSTER_W / 2 + offsetX - icon.width / 2);
  let top = Math.round(POSTER_H / 2 + offsetY - icon.height / 2);
  // Keep the composite fully on-canvas — Sharp rejects overflowing inputs.
  left = Math.max(0, Math.min(POSTER_W - icon.width, left));
  top = Math.max(0, Math.min(POSTER_H - icon.height, top));

  const jpg = await sharp(bg)
    .composite([{ input: icon.buffer, left, top, blend: "over" }])
    .jpeg({ quality: 88, progressive: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
  fs.writeFileSync(posterPath, jpg);
  return posterPath;
}

// ---------- Cache / driver ----------

function buildFingerprint(apps) {
  const parts = [ALGORITHM_VERSION];
  for (const a of apps) {
    parts.push(a.slug);
    parts.push(sha256(fs.readFileSync(a.iconPath)));
  }
  return sha256(Buffer.from(parts.join("|")));
}

function readCache() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(fingerprint, apps) {
  const data = {
    fingerprint,
    apps: apps.map((a) => a.slug),
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2) + "\n");
}

// Build a synthetic apps list of length `n` by cycling through the real apps.
// Used by --prototype to validate layouts at counts above the actual app
// inventory (e.g. doubling to ~28) without inventing fake icons.
function cyclicApps(apps, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(apps[i % apps.length]);
  }
  return out;
}

async function renderPrototypes(apps, counts) {
  if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const seed = buildFingerprint(apps);
  const written = [];
  for (const n of counts) {
    const subset = cyclicApps(apps, n);
    const out = path.join(PREVIEW_DIR, `preview-${String(n).padStart(2, "0")}.jpg`);
    // Seed per count so each preview is deterministic but distinct.
    await renderMainPosterTo(subset, seed + ":proto:" + n, out);
    written.push(out);
    console.log(`[posters] prototype n=${n} -> ${path.relative(ROOT, out)}`);
  }
  return written;
}

async function main() {
  const apps = parseApps();

  if (PROTOTYPE) {
    console.log(
      `[posters] Prototype mode — rendering counts: ${PROTOTYPE_COUNTS.join(", ")}`,
    );
    await renderPrototypes(apps, PROTOTYPE_COUNTS);
    return;
  }

  const fingerprint = buildFingerprint(apps);
  const cache = readCache();
  if (!FORCE && cache && cache.fingerprint === fingerprint) {
    console.log(
      `[posters] Up-to-date (fingerprint ${fingerprint.slice(0, 12)}…); skipping.`,
    );
    return;
  }
  console.log(
    `[posters] Regenerating — fingerprint ${fingerprint.slice(0, 12)}…` +
      (FORCE ? " (forced)" : ""),
  );

  const written = [];
  written.push(await renderMainPoster(apps, fingerprint));
  for (const app of apps) {
    const p = await renderAppPoster(app, fingerprint);
    if (p) written.push(p);
  }
  writeCache(fingerprint, apps);
  for (const w of written) {
    console.log(`[posters]  wrote ${path.relative(ROOT, w)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
