// The signature drawn into the bottom-right corner of every new photograph.
//
// The placement was measured on the photographs already in /slides (the 2400 px ones, which
// all agree): the visible ink of the signature is 22.5% of the picture's long side wide, its
// right edge sits 0.92% of the long side in from the right, and its lowest stroke 0.58% of
// the long side up from the bottom. Landscape and portrait use the same numbers, so on a
// portrait the mark covers a larger share of the width, exactly as the existing ones do.
// The existing signatures are not full white: on dark corners their strokes peak at about
// 200 to 225 out of 255 (the same file drawn at 100% gives 255, at 80% about 210, at 85%
// about 221), so the mark is drawn at 82% opacity. There is no shadow or outline on them.
//
// The PNG is looked for in two places: a file chosen on this device (kept in this browser's
// IndexedDB), then edit/watermark.png (the owner's signature, 1105 px wide; at 2400 px it is
// drawn 540 px wide, so it is always scaled down).
import { blobs } from './db.js';

export const PLACE = { width: 0.225, right: 0.0092, bottom: 0.0058, opacity: 0.82 };
const KEY = 'device:watermark';
let cached;      // undefined = not looked yet; null = none; { canvas, w, h, source }

async function decode(blob) {
  if ('createImageBitmap' in window) { try { return await createImageBitmap(blob); } catch { /* try <img> */ } }
  const url = URL.createObjectURL(blob);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}

/** Cuts the transparent border off, so the placement is measured from the ink itself. */
async function prepare(blob, source) {
  const src = await decode(blob);
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  if (!w || !h) throw new Error('That file has no size.');
  const k = Math.min(1, 4096 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, c.width, c.height);
  if (src.close) src.close();
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1, clear = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const a = d[(y * c.width + x) * 4 + 3];
    if (a > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } else clear++;
  }
  if (x1 < 0) throw new Error('That image is completely transparent.');
  const opaque = clear / (c.width * c.height) < 0.02;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { canvas: out, w: out.width, h: out.height, source, opaque };
}

/** The watermark ready to draw, or null when this device has none. */
export async function loadWatermark() {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const own = await blobs.get(KEY);
    if (own) cached = await prepare(own, 'device');
    else {
      const res = await fetch(new URL('../watermark.png', import.meta.url), { cache: 'no-cache' });
      if (res.ok && /^image\//.test(res.headers.get('content-type') || '')) cached = await prepare(await res.blob(), 'site');
    }
  } catch { cached = null; }
  return cached;
}
/** Keeps a chosen PNG on this device. Returns the prepared mark (check `.opaque`). */
export async function setWatermarkFile(file) {
  let mark;
  try { mark = await prepare(file, 'device'); } catch (e) { throw new Error(`That file cannot be used as a watermark: ${e.message || 'it is not an image this browser can open'}`); }
  await blobs.put(KEY, file);
  cached = mark;
  return mark;
}
export async function clearWatermark() { await blobs.del(KEY); cached = undefined; }

/** Where the mark goes on a picture of this size: { x, y, w, h } in pixels. */
export function placement(W, H, mark) {
  const long = Math.max(W, H);
  let w = PLACE.width * long;
  w = Math.min(w, W * 0.6);                        // a very tall, narrow picture: never wider than 60% of it
  const h = w * mark.h / mark.w;
  return { x: Math.round(W - PLACE.right * long - w), y: Math.round(H - PLACE.bottom * long - h), w: Math.round(w), h: Math.round(h) };
}
export function drawWatermark(g, W, H, mark) {
  const p = placement(W, H, mark);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.save(); g.globalAlpha = PLACE.opacity;
  g.drawImage(mark.canvas, p.x, p.y, p.w, p.h);
  g.restore();
  return p;
}
