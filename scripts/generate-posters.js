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

const FORCE = process.argv.includes("--force");

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

// Pick a pleasant dark background palette given an icon hue. We use the soft
// complement (+150°) so the bg does not share the icon's hue, but we keep it
// dark and only moderately saturated so the composite stays "space-like" and
// the icons pop — matches the original hand-tuned posters.
function complementaryPalette(hue) {
  const comp = (hue + 150) % 360;
  const inner = hslToRgb(comp, 0.7, 0.22); // dim focal highlight
  const mid = hslToRgb(comp, 0.65, 0.09); // fall-off
  const outer = hslToRgb(comp, 0.55, 0.03); // near-black with hue tint
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

// Builds the 2D affine matrix that represents the orthographic projection of a
// 3D rotation Rx(rotX) · Ry(rotY) · Rz(rotZ). This is what gives icons the
// "flying toward the viewer" look — X/Y rotations foreshorten the icon on one
// side, while Z rotation is the existing in-plane tilt.
function tilt3DMatrix({ rotX, rotY, rotZ }) {
  const ca = Math.cos(rotX),
    sa = Math.sin(rotX);
  const cb = Math.cos(rotY),
    sb = Math.sin(rotY);
  const cg = Math.cos(rotZ),
    sg = Math.sin(rotZ);
  // Rows 0 & 1 of Rx · Ry · Rz.
  const a = cb * cg;
  const b = -cb * sg;
  const c = ca * sg + sa * sb * cg;
  const d = ca * cg - sa * sb * sg;
  return [a, b, c, d];
}

// Prepare a single icon: resize, apply a 3D-ish tilt (rotX/rotY/rotZ via affine
// projection), then render a soft drop-shadow beneath. Returns the composite
// bitmap + its dimensions (which include shadow padding).
async function tiltedIconWithShadow(iconPath, size, tilt) {
  const iconBuf = await sharp(iconPath)
    .resize(size, size, { fit: "cover" })
    .ensureAlpha()
    .png()
    .toBuffer();

  const [a, b, c, d] = tilt3DMatrix(tilt);
  const rotated = await sharp(iconBuf)
    .affine([a, b, c, d], {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      interpolator: "bicubic",
    })
    .png()
    .toBuffer();
  const rawRotated = await sharp(rotated)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rw = rawRotated.info.width;
  const rh = rawRotated.info.height;

  // Shadow parameters — kept modest so we don't blow out the canvas bounds.
  const shadowBlur = Math.max(8, Math.round(size * 0.07));
  const shadowOffsetX = Math.round(size * 0.02);
  const shadowOffsetY = Math.round(size * 0.06);
  const shadowOpacity = 0.55; // 0..1

  // Build a black-on-transparent silhouette from the rotated alpha channel.
  const shadowRaw = Buffer.alloc(rawRotated.data.length);
  for (let i = 0; i < rawRotated.data.length; i += 4) {
    shadowRaw[i] = 0;
    shadowRaw[i + 1] = 0;
    shadowRaw[i + 2] = 0;
    shadowRaw[i + 3] = Math.round(rawRotated.data[i + 3] * shadowOpacity);
  }
  const shadow = await sharp(shadowRaw, {
    raw: { width: rw, height: rh, channels: 4 },
  })
    .blur(shadowBlur)
    .png()
    .toBuffer();

  const padX = shadowBlur * 2 + Math.abs(shadowOffsetX);
  const padY = shadowBlur * 2 + Math.abs(shadowOffsetY);
  const finalW = rw + padX * 2;
  const finalH = rh + padY * 2;

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
      { input: rotated, left: padX, top: padY },
    ])
    .png()
    .toBuffer();

  return { buffer, width: finalW, height: finalH };
}

// Ease-out that keeps the first few icons notably larger than the tail.
function prominenceSize(index, total, maxSize, minSize) {
  if (total === 1) return maxSize;
  // index 0 -> maxSize, later indices drop off, but floor at minSize.
  const t = index / Math.max(1, total - 1);
  const eased = 1 - Math.pow(t, 0.55);
  return Math.round(minSize + (maxSize - minSize) * eased);
}

// Phyllotaxis / sunflower spiral placement so N icons fill the frame gracefully.
// Index 0 is the centered icon; subsequent indices spiral outward.
function spiralPosition(index, total, canvasW, canvasH) {
  if (index === 0) {
    return { x: canvasW / 2, y: canvasH / 2 };
  }
  const golden = Math.PI * (3 - Math.sqrt(5)); // ~2.39996
  // Normalize radius so the outermost index sits near the frame edge.
  const maxR = Math.min(canvasW, canvasH) * 0.52;
  const minR = Math.min(canvasW, canvasH) * 0.33;
  const t = (index - 1) / Math.max(1, total - 1);
  const r = minR + (maxR - minR) * Math.sqrt(t);
  // Slight horizontal stretch because the canvas is wider than tall.
  const stretchX = canvasW / Math.min(canvasW, canvasH);
  const stretchY = canvasH / Math.min(canvasW, canvasH);
  const angle = index * golden + 0.7; // offset so ring 1 isn't at 3-o'clock
  const x = canvasW / 2 + Math.cos(angle) * r * stretchX * 0.92;
  const y = canvasH / 2 + Math.sin(angle) * r * stretchY * 0.86;
  return { x, y };
}

// ---------- Main poster (multi-icon fly-towards-viewer) ----------

async function renderMainPoster(apps, seedHex) {
  const rng = seededRng(seedHex + ":main");

  // Derive background from the first (most prominent) app, blended with runner-up.
  const primaryHue = (await dominantHue(apps[0].iconPath)).h;
  const secondaryHue =
    apps.length > 1 ? (await dominantHue(apps[1].iconPath)).h : primaryHue;
  const blendedHue =
    (((primaryHue + secondaryHue) / 2) % 360 + 360) % 360;
  const palette = complementaryPalette(blendedHue);
  const bg = await renderBackground(palette, seedHex + ":main");

  const total = apps.length;
  // Size ranges expressed as a fraction of canvas height so the layout scales.
  // The spiral radius grows with total count, so shrink surrounding icons a
  // bit when we have lots of apps to fit.
  const density = Math.max(0.6, Math.min(1, 10 / Math.max(total, 1)));
  const centerSize = Math.round(POSTER_H * 0.38);
  const tailSize = Math.round(POSTER_H * 0.16 * density);

  // Build placements in order but composite with larger icons last so the
  // most prominent apps sit on top (front-and-center depth feel).
  const placements = [];
  for (let i = 0; i < total; i++) {
    const app = apps[i];
    const size = prominenceSize(i, total, centerSize, tailSize);
    const pos = spiralPosition(i, total, POSTER_W, POSTER_H);
    // Small positional jitter so the spiral doesn't look mechanical.
    const jitter = Math.min(POSTER_W, POSTER_H) * 0.03;
    pos.x += (rng() - 0.5) * jitter;
    pos.y += (rng() - 0.5) * jitter;

    // Outward unit vector from the canvas center. Icons further out get a
    // stronger 3D tilt that leans them away from the viewer (like cards
    // thrown outward from the middle of the frame).
    const vx = pos.x - POSTER_W / 2;
    const vy = pos.y - POSTER_H / 2;
    const mag = Math.hypot(vx, vy) || 1;
    const dx = vx / mag;
    const dy = vy / mag;
    const outwardAmount = Math.min(1, mag / (POSTER_H * 0.55)); // 0..1
    const leanRad = outwardAmount * (14 * Math.PI) / 180; // up to ~14°

    // Combine position-driven lean with per-icon random wobble.
    const randXY = 8 * Math.PI / 180;
    const rotX = leanRad * -dy + (rng() - 0.5) * 2 * randXY; // up/down lean
    const rotY = leanRad * dx + (rng() - 0.5) * 2 * randXY; // left/right lean
    const zMax = 12 + outwardAmount * 10; // degrees
    const rotZ = ((rng() - 0.5) * 2 * zMax * Math.PI) / 180;

    placements.push({ app, size, pos, order: i, tilt: { rotX, rotY, rotZ } });
  }

  // Render icons in parallel.
  const rendered = await Promise.all(
    placements.map((p) =>
      tiltedIconWithShadow(p.app.iconPath, p.size, p.tilt).then((res) => ({
        ...p,
        ...res,
      })),
    ),
  );

  // Composite back-to-front (smallest/last drawn first = behind; largest last = on top).
  const drawOrder = [...rendered].sort((a, b) => b.order - a.order);
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
  fs.writeFileSync(MAIN_POSTER_PATH, jpg);
  return MAIN_POSTER_PATH;
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
  const palette = complementaryPalette(h);
  const bg = await renderBackground(palette, seedHex + ":" + app.slug);

  // Single large, tilted icon sitting roughly centered with a random offset.
  const size = Math.round(POSTER_H * 0.55);
  const deg = Math.PI / 180;
  const tilt = {
    rotX: (rng() - 0.5) * 20 * deg, // -10°..+10° up/down lean
    rotY: (rng() - 0.5) * 20 * deg, // -10°..+10° left/right lean
    rotZ: (rng() - 0.5) * 22 * deg, // -11°..+11° in-plane spin
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
  const parts = [];
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

async function main() {
  const apps = parseApps();
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
