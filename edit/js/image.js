// Turns a picked image into a web-sized file with no metadata, entirely in the browser.
// Drawing onto a canvas and re-encoding drops EXIF, GPS and every other embedded tag; the
// fields worth keeping (capture date, camera, exposure) are read first by exif.js.
import { readExif } from './exif.js';
import { drawWatermark } from './watermark.js';

export const MAX_SIDE = 2400;   // the repo's photographs are at most 2400 px on the long side
export const WEBP_QUALITY = 0.82;
export const JPEG_QUALITY = 0.86;
export const ICON_SMALL = 128;  // projects/<icon>: the timeline (shown at 40 px, so 3x)
export const ICON_LARGE = 256;  // projects/lg/<id>.webp: the featured cards and the app sheet
export const SHOT_HEIGHT = 960; // projects/shots/<id>/<name>.webp: what the build resizes a gallery image to

const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

let webpSupport;
/** Safari has historically answered a WebP request with a PNG, so ask and look at what comes back. */
export async function canEncodeWebp() {
  if (webpSupport === undefined) {
    const c = document.createElement('canvas'); c.width = c.height = 2;
    c.getContext('2d').fillRect(0, 0, 2, 2);
    const b = await toBlob(c, 'image/webp', 0.8);
    webpSupport = !!b && b.type === 'image/webp';
  }
  return webpSupport;
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* try <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async'; img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}
async function open(file) {
  let src;
  try { src = await decode(file); } catch { throw new Error(`This browser cannot open ${file.name || 'that file'} as an image.`); }
  const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
  if (!sw || !sh) throw new Error('That image has no size.');
  return { src, sw, sh };
}
function canvasOf(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  return { canvas, g };
}
async function encode(canvas, q, jpegQ, allowJpeg, what) {
  const webp = await canEncodeWebp();
  if (!webp && !allowJpeg) throw new Error(`This browser cannot write WebP files, and JPEG upload is turned off in Settings, so ${what} cannot be prepared here. Turn it on, or use Chrome, Edge or Firefox.`);
  const blob = webp ? await toBlob(canvas, 'image/webp', q) : await toBlob(canvas, 'image/jpeg', jpegQ);
  if (!blob) throw new Error('The image could not be encoded.');
  return { blob, ext: webp ? 'webp' : 'jpg' };
}

/**
 * A photograph for /slides. `mark` is the prepared watermark (watermark.js) or null.
 * Besides the file to upload it returns `clean`: the same resized picture without the
 * watermark, at high quality, kept only in this browser so the mark can be switched on or
 * off later without the original file. It is never uploaded.
 */
export async function convertImage(file, { allowJpeg = false, mark = null } = {}) {
  const { src, sw, sh } = await open(file);
  // Read what is worth keeping before the re-encode below drops every embedded tag.
  const exif = readExif(await file.arrayBuffer(), { pixelWidth: Math.max(sw, sh) });
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const width = Math.round(sw * k), height = Math.round(sh * k);
  const { canvas, g } = canvasOf(width, height);
  g.drawImage(src, 0, 0, width, height);
  if (src.close) src.close();
  const clean = (await encode(canvas, 0.95, 0.95, allowJpeg, 'photos')).blob;
  if (mark) drawWatermark(g, width, height, mark);
  const { blob, ext } = await encode(canvas, WEBP_QUALITY, JPEG_QUALITY, allowJpeg, 'photos');
  canvas.width = canvas.height = 0;
  return { blob, clean, ext, width, height, exif, originalBytes: file.size, watermarked: !!mark };
}
/** The file to upload, made again from the clean copy with or without the watermark. */
export async function renderFinal(clean, { mark = null, allowJpeg = true } = {}) {
  const { src, sw, sh } = await open(clean);
  const { canvas, g } = canvasOf(sw, sh);
  g.drawImage(src, 0, 0);
  if (src.close) src.close();
  if (mark) drawWatermark(g, sw, sh, mark);
  const out = await encode(canvas, WEBP_QUALITY, JPEG_QUALITY, allowJpeg, 'photos');
  canvas.width = canvas.height = 0;
  return out.blob;
}

/**
 * A project icon: the middle square of the picture at 128 px and 256 px. The site rounds
 * the corners itself (CSS), so the files are plain squares like the existing ones.
 */
export async function makeIcon(file, { allowJpeg = false } = {}) {
  const { src, sw, sh } = await open(file);
  const side = Math.min(sw, sh), sx = (sw - side) / 2, sy = (sh - side) / 2;
  const draw = async (px) => {
    const { canvas, g } = canvasOf(px, px);
    g.drawImage(src, sx, sy, side, side, 0, 0, px, px);
    const out = await encode(canvas, 0.9, 0.92, allowJpeg, 'icons');
    canvas.width = canvas.height = 0;
    return out;
  };
  const small = await draw(ICON_SMALL), large = await draw(ICON_LARGE);
  if (src.close) src.close();
  return { ext: small.ext, small: small.blob, large: large.blob, sourceSide: side, cropped: sw !== sh };
}

/** A project screenshot at the size the site shows: at most 960 px tall, never enlarged. */
export async function makeShot(file, { allowJpeg = false } = {}) {
  const { src, sw, sh } = await open(file);
  const k = Math.min(1, SHOT_HEIGHT / sh);
  const width = Math.round(sw * k), height = Math.round(sh * k);
  const { canvas, g } = canvasOf(width, height);
  g.drawImage(src, 0, 0, width, height);
  if (src.close) src.close();
  const out = await encode(canvas, 0.8, 0.86, allowJpeg, 'screenshots');
  canvas.width = canvas.height = 0;
  return { ...out, width, height };
}
