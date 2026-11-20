// A small metadata reader for a picked photograph. It reads only what the site shows:
// capture date, camera, lens, 35 mm focal length, aperture, shutter, ISO, and an embedded
// title / description. It never follows the GPS pointer and never looks at serial numbers,
// owner, artist or copyright tags: only the tag numbers listed below are ever read.
//
// Containers: JPEG (APP1 Exif, APP1 XMP, APP13 IPTC), WebP (EXIF / XMP chunks), PNG (eXIf),
// and, as a last resort, a scan of the head of any other file (HEIC, TIFF) for a TIFF header.
// Anything it does not understand simply yields no fields.

const IFD0 = { 0x010e: 'description', 0x010f: 'make', 0x0110: 'model', 0x8769: 'exifIfd' };
const EXIF = {
  0x829a: 'exposure', 0x829d: 'fnumber', 0x8827: 'iso', 0x8832: 'isoIndex',
  0x9003: 'original', 0x9004: 'digitized', 0x920a: 'focal',
  0xa002: 'pixelX', 0xa20e: 'planeXRes', 0xa210: 'planeUnit', 0xa405: 'focal35', 0xa434: 'lens',
};

const ascii = (dv, off, len) => {
  let s = '';
  for (let i = 0; i < len && off + i < dv.byteLength; i++) {
    const c = dv.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
};
const text = (dv, off, len) => {
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset + off, Math.max(0, Math.min(len, dv.byteLength - off)));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('latin1').decode(bytes); }
};
const clean = (s, max) => String(s || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

function readTiff(dv, t) {
  if (t + 8 > dv.byteLength) return null;
  const bo = dv.getUint16(t);
  if (bo !== 0x4949 && bo !== 0x4d4d) return null;
  const le = bo === 0x4949;
  if (dv.getUint16(t + 2, le) !== 42) return null;
  const out = {};
  const ifd = (off, want) => {
    if (off <= 0 || t + off + 2 > dv.byteLength) return;
    const n = dv.getUint16(t + off, le);
    for (let i = 0; i < n; i++) {
      const e = t + off + 2 + i * 12;
      if (e + 12 > dv.byteLength) return;
      const name = want[dv.getUint16(e, le)];
      if (!name) continue;                                    // every other tag is skipped unread
      const type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
      const far = t + dv.getUint32(e + 8, le);
      if (type === 2) {                                       // ASCII
        const at = count <= 4 ? e + 8 : far;
        if (at + count <= dv.byteLength) out[name] = text(dv, at, count).replace(/\0.*$/s, '').trim();
      } else if (type === 3) out[name] = dv.getUint16(e + 8, le);          // SHORT
      else if (type === 4) out[name] = dv.getUint32(e + 8, le);            // LONG
      else if ((type === 5 || type === 10) && far + 8 <= dv.byteLength) {  // RATIONAL
        const num = type === 5 ? dv.getUint32(far, le) : dv.getInt32(far, le);
        const den = type === 5 ? dv.getUint32(far + 4, le) : dv.getInt32(far + 4, le);
        if (den) out[name] = num / den;
      }
    }
  };
  ifd(dv.getUint32(t + 4, le), IFD0);
  if (typeof out.exifIfd === 'number') ifd(out.exifIfd, EXIF);
  return out;
}

/** Finds the pieces of a file that may hold metadata: { tiff: offset | -1, xmp: string, iptc: [off, len] | null } */
function locate(dv) {
  const len = dv.byteLength, found = { tiff: -1, xmp: '', iptc: null };
  if (len > 4 && dv.getUint16(0) === 0xffd8) {                       // JPEG
    let p = 2;
    while (p + 4 <= len && dv.getUint8(p) === 0xff) {
      const marker = dv.getUint8(p + 1), size = dv.getUint16(p + 2);
      if (marker === 0xda || size < 2) break;
      const body = p + 4, bodyLen = size - 2;
      if (marker === 0xe1 && found.tiff < 0 && ascii(dv, body, 4) === 'Exif') found.tiff = body + 6;
      else if (marker === 0xe1 && !found.xmp && ascii(dv, body, 28) === 'http://ns.adobe.com/xap/1.0/') found.xmp = text(dv, body + 29, bodyLen - 29);
      else if (marker === 0xed && !found.iptc && ascii(dv, body, 13) === 'Photoshop 3.0') found.iptc = [body + 14, bodyLen - 14];
      p += 2 + size;
    }
    return found;
  }
  if (len > 12 && ascii(dv, 0, 4) === 'RIFF' && ascii(dv, 8, 4) === 'WEBP') {   // WebP
    let p = 12;
    while (p + 8 <= len) {
      const id = ascii(dv, p, 4) || (dv.getUint32(p) === 0x584d5020 ? 'XMP' : ''), size = dv.getUint32(p + 4, true);
      if (id === 'EXIF') found.tiff = ascii(dv, p + 8, 4) === 'Exif' ? p + 14 : p + 8;
      else if (id === 'XMP') found.xmp = text(dv, p + 8, size);
      p += 8 + size + (size & 1);
    }
    return found;
  }
  if (len > 8 && dv.getUint32(0) === 0x89504e47) {                   // PNG
    let p = 8;
    while (p + 8 <= len) {
      const size = dv.getUint32(p), id = ascii(dv, p + 4, 4);
      if (id === 'eXIf') { found.tiff = p + 8; break; }
      if (id === 'IDAT') break;
      p += 12 + size;
    }
    return found;
  }
  // Anything else (HEIC and friends): look for "Exif\0\0" followed by a TIFF header near the start.
  const max = Math.min(len - 12, 1024 * 1024);
  for (let p = 0; p < max; p++) {
    if (dv.getUint32(p) === 0x45786966 && dv.getUint16(p + 4) === 0) {
      const bo = dv.getUint16(p + 6);
      if (bo === 0x4949 || bo === 0x4d4d) { found.tiff = p + 6; return found; }
    }
  }
  if (len > 8 && (dv.getUint16(0) === 0x4949 || dv.getUint16(0) === 0x4d4d)) found.tiff = 0;
  return found;
}

/* ---------- embedded title / description ---------- */
const entities = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
  const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()];
  if (named) return named;
  const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
});
function xmpField(xmp, tag) {                       // only dc:title and dc:description are ever asked for
  const m = new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`).exec(xmp);
  if (!m) return '';
  const li = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(m[1]);
  return entities((li ? li[1] : m[1]).replace(/<[^>]+>/g, ''));
}
function iptcFields(dv, [start, length]) {
  const out = {}, end = Math.min(dv.byteLength, start + length);
  let p = start;
  while (p + 12 <= end && dv.getUint32(p) === 0x3842494d) {          // "8BIM"
    const id = dv.getUint16(p + 4);
    let q = p + 6;
    const nameLen = dv.getUint8(q); q += 1 + nameLen; if ((1 + nameLen) & 1) q++;
    if (q + 4 > end) break;
    const size = dv.getUint32(q); q += 4;
    if (id === 0x0404) {
      let r = q;
      const stop = Math.min(end, q + size);
      while (r + 5 <= stop && dv.getUint8(r) === 0x1c) {
        const rec = dv.getUint8(r + 1), set = dv.getUint8(r + 2), n = dv.getUint16(r + 3);
        if (rec === 2 && r + 5 + n <= stop) {
          if (set === 5) out.name = text(dv, r + 5, n);
          else if (set === 105) out.headline = text(dv, r + 5, n);
          else if (set === 120) out.caption = text(dv, r + 5, n);
        }
        r += 5 + n;
      }
    }
    p = q + size + (size & 1);
  }
  return out;
}
// Text cameras and scanners write into ImageDescription by themselves; it says nothing about the picture.
const BOILERPLATE = /^(olympus digital camera|sony dsc|digital camera|default|untitled|dav|processed with .*|charset=.*|[\W_]*)$/i;

/* ---------- camera names ---------- */
const BRANDS = {
  nikon: 'Nikon', sony: 'Sony', fujifilm: 'Fujifilm', fuji: 'Fujifilm', olympus: 'Olympus', om: 'OM System', ricoh: 'Ricoh', pentax: 'Pentax',
  leica: 'Leica', samsung: 'Samsung', panasonic: 'Panasonic', canon: 'Canon', hasselblad: 'Hasselblad', sigma: 'Sigma', google: 'Google',
  apple: 'Apple', gopro: 'GoPro', motorola: 'Motorola', xiaomi: 'Xiaomi', huawei: 'Huawei', oneplus: 'OnePlus', kodak: 'Kodak', minolta: 'Minolta',
};
const ROMAN = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
export function cameraName(makeRaw, modelRaw) {
  const make = clean(makeRaw, 60), model = clean(modelRaw, 60);
  const both = `${make} ${model}`;
  if (!make && !model) return { camera: '', kind: '' };
  if (/noritsu|frontier|darkroom|scan/i.test(both)) return { camera: 'Film (lab scan)', kind: 'scan' };
  if (/\bdji\b/i.test(both) || /^FC\d{3,}/.test(model)) return { camera: 'DJI drone', kind: 'drone' };
  if (/^(iphone|ipad)/i.test(model)) return { camera: model, kind: 'phone' };
  const first = make.split(/[\s,.]+/)[0] || '';
  const brand = BRANDS[first.toLowerCase()] || (first === first.toUpperCase() && first.length > 3 ? first[0] + first.slice(1).toLowerCase() : first);
  let name = model;
  if (first && new RegExp(`^${first.replace(/[^\w]/g, '')}(\\s+|$)`, 'i').test(name)) name = name.slice(first.length).trim();   // "NIKON Z 8" → "Z 8"
  if (brand === 'Canon') name = name.replace(/([A-Za-z]\d+)m([2-9])\b/, (m, a, n) => `${a} Mark ${ROMAN[+n]}`);   // "EOS R5m2" → "EOS R5 Mark II"
  return { camera: clean([brand, name].filter(Boolean).join(' '), 80), kind: 'camera' };
}

/* ---------- the public reader ---------- */
function isoDate(s) {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})/.exec(s || '');
  if (!m) return '';
  const y = +m[1], mo = +m[2], d = +m[3];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return '';
  if (y < 1990 || date.getTime() > Date.now() + 2 * 864e5) return '';        // unset clocks and the future
  return `${m[1]}-${m[2]}-${m[3]}`;
}
function shutterText(t) {
  if (!(t > 0) || t > 3600) return '';
  if (t >= 1) return String(Math.round(t * 10) / 10);
  const inv = 1 / t, whole = Math.round(inv);
  return Math.abs(inv - whole) / inv < 0.03 ? `1/${whole}` : String(Math.round(t * 10) / 10 || Math.round(t * 100) / 100);
}
/** 35 mm equivalent in whole mm, or undefined when it cannot be worked out. */
function focal35(t, fallbackPixels) {
  if (t.focal35 > 0 && t.focal35 < 5000) return Math.round(t.focal35);
  const px = t.pixelX > 0 ? t.pixelX : fallbackPixels;
  const unitMm = { 2: 25.4, 3: 10, 4: 1, 5: 0.001 }[t.planeUnit ?? 2];
  if (!(t.focal > 0) || !(t.planeXRes > 0) || !(px > 0) || !unitMm) return undefined;
  const sensorWidth = (px / t.planeXRes) * unitMm;
  if (!(sensorWidth >= 3 && sensorWidth <= 70)) return undefined;                // not a plausible sensor: do not guess
  return Math.round(t.focal * (36 / sensorWidth));
}

/**
 * @param {ArrayBuffer} buffer the original file
 * @param {{ pixelWidth?: number }} [opts] the long side of the decoded image, used only when
 *        the file does not record its own pixel width
 * @returns {{taken?: string, camera?: string, lens?: string, focal35?: number, aperture?: number,
 *            shutter?: string, iso?: number, title?: string, caption?: string}}
 */
export function readExif(buffer, opts = {}) {
  const out = {};
  try {
    const dv = new DataView(buffer);
    const where = locate(dv);
    const t = (where.tiff >= 0 && readTiff(dv, where.tiff)) || {};

    const { camera, kind } = cameraName(t.make, t.model);
    if (camera) out.camera = camera;
    if (kind !== 'scan') {                         // a scan's date and "exposure" belong to the scanner
      const taken = isoDate(t.original) || isoDate(t.digitized);
      if (taken) out.taken = taken;
      const lens = clean(t.lens, 80);
      if (lens && kind !== 'phone' && !/^[-\s0.]*$/.test(lens)) out.lens = lens;
      const f35 = focal35(t, opts.pixelWidth);
      if (f35 > 0) out.focal35 = f35;
      if (t.fnumber > 0 && t.fnumber < 100) out.aperture = Math.round(t.fnumber * 10) / 10;
      const shutter = shutterText(t.exposure);
      if (shutter) out.shutter = shutter;
      const iso = t.iso > 0 && t.iso < 65535 ? t.iso : t.isoIndex;
      if (iso > 0 && iso < 1e7) out.iso = Math.round(iso);
    }

    const iptc = where.iptc ? iptcFields(dv, where.iptc) : {};
    const usable = (s, max) => { const c = clean(s, max); return BOILERPLATE.test(c) ? '' : c; };
    const title = usable(where.xmp && xmpField(where.xmp, 'title'), 120) || usable(iptc.name, 120) || usable(iptc.headline, 120);
    const caption = usable(where.xmp && xmpField(where.xmp, 'description'), 600) || usable(iptc.caption, 600) || usable(t.description, 600);
    if (title) out.title = title;
    if (caption && caption !== title) out.caption = caption;
  } catch { /* a file this reader cannot follow leaves the fields empty */ }
  return out;
}
