// wemiller.com /xr/ — drawing helpers shared by the scene modules: textures, canvas text, in-world
// buttons and tiles. Nothing here knows about areas or input.
// System fonts only. The second half names each platform's Chinese, Japanese and Korean faces, so
// text drawn into textures finds those glyphs wherever a headset or phone keeps them.
export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", '
  + '"PingFang SC", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Apple SD Gothic Neo", "Noto Sans CJK SC", "Noto Sans CJK JP", "Noto Sans CJK KR", '
  + '"Noto Sans SC", "Noto Sans JP", "Noto Sans KR", "Microsoft YaHei", "Yu Gothic", "Meiryo", "Malgun Gothic", Arial, sans-serif';
// Chinese, Japanese and Korean have no spaces between words: a line may break between any two of
// their characters, except just before closing punctuation.
const CJK_CHAR = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;
const NO_BREAK_BEFORE = /[、。，．・：；？！）」』】〉》”’,.:;?!)\]}%…ー々]/;
function tokens(text) {
  const out = [];
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    if (!CJK_CHAR.test(word)) { out.push({ s: word, sp: out.length > 0 }); continue; }
    let run = '', first = true;
    const flush = () => { if (run) { out.push({ s: run, sp: first && out.length > 0 }); first = false; run = ''; } };
    for (const ch of word) {
      if (CJK_CHAR.test(ch) && !NO_BREAK_BEFORE.test(ch)) { flush(); run = ch; flush(); }
      else if (NO_BREAK_BEFORE.test(ch) && !run && out.length && !first) out[out.length - 1].s += ch;     // keep punctuation with what it closes
      else run += ch;                                                                                      // Latin letters and digits stay together
    }
    flush();
  }
  return out;
}
export const COL = { bg: '#070b14', bg2: '#0c1220', ink: '#eef2f8', soft: '#b9c3d6', accent: '#6cb6ff', accentInk: '#04121f', green: '#6fe0c0', line: '#24344f', edge: '#34486e' };

export function createUI(THREE, renderer, invalidate) {
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const PLANE = new THREE.PlaneGeometry(1, 1);

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('could not load ' + url));
      im.src = url;
    });
  }
  function imageTexture(im) {
    const t = new THREE.Texture(im);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    t.needsUpdate = true;
    return t;
  }
  function canvasTexture(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    return { cv, ctx: cv.getContext('2d'), tex };
  }
  // Copy (part of) an image into a texture of exactly w x h. The canvas is freed once uploaded.
  function scaledTexture(im, sx, sw, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(im, sx, 0, sw, im.naturalHeight, 0, 0, w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.onUpdate = () => { cv.width = cv.height = 0; tex.onUpdate = null; };
    return tex;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrapLines(ctx, text, maxW, maxLines) {
    const toks = tokens(text), lines = [];
    let line = '';
    for (let i = 0; i < toks.length; i++) {
      const test = line ? line + (toks[i].sp ? ' ' : '') + toks[i].s : toks[i].s;
      if (line && ctx.measureText(test).width > maxW) {
        lines.push(line); line = toks[i].s;
        if (lines.length === maxLines) { lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s.,;:、。，]*$/, '') + '…'; return lines; }
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function disposeMesh(m) {
    if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    if (m.geometry && m.geometry !== PLANE && !m.geometry.userData.shared) m.geometry.dispose();
  }

  // A unit rectangle (-0.5..0.5) with rounded corners, for a mesh that is then scaled to w x h metres:
  // the corners are drawn as ellipses here so that they come out round, radius r, after scaling.
  // Geometries are shared and cached by shape, so they are never disposed.
  const roundCache = new Map();
  function roundedGeo(w, h, r) {
    const rx = Math.min(0.5, r / w), ry = Math.min(0.5, r / h), key = rx.toFixed(3) + '|' + ry.toFixed(3);
    let g = roundCache.get(key);
    if (g) return g;
    const s = new THREE.Shape(), q = Math.PI / 2;
    s.moveTo(-0.5 + rx, -0.5);
    s.lineTo(0.5 - rx, -0.5); s.absellipse(0.5 - rx, -0.5 + ry, rx, ry, -q, 0, false, 0);
    s.lineTo(0.5, 0.5 - ry); s.absellipse(0.5 - rx, 0.5 - ry, rx, ry, 0, q, false, 0);
    s.lineTo(-0.5 + rx, 0.5); s.absellipse(-0.5 + rx, 0.5 - ry, rx, ry, q, 2 * q, false, 0);
    s.lineTo(-0.5, -0.5 + ry); s.absellipse(-0.5 + rx, -0.5 + ry, rx, ry, 2 * q, 3 * q, false, 0);
    g = new THREE.ShapeGeometry(s, 8);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + 0.5, p.getY(i) + 0.5);
    g.userData.shared = true;
    roundCache.set(key, g);
    return g;
  }
  function emptyGroup(g) {
    for (let i = g.children.length - 1; i >= 0; i--) {
      const c = g.children[i];
      c.traverse((o) => { if (o.isMesh || o.isLine) disposeMesh(o); });
      g.remove(c);
    }
  }

  // A pill button drawn on a canvas. `b.face` is the mesh to place; `b.set({...})` redraws on change.
  // `fit`: every label this button may come to show; it is made wide enough for the longest, in any language.
  const measure = document.createElement('canvas').getContext('2d');
  function makeButton(label, w, h, onSelect, fit) {
    measure.font = '600 40px ' + FONT;
    for (const l of [label].concat(fit || [])) w = Math.max(w, ((measure.measureText(l).width + 56) * h) / 96);
    const ph = 96, pw = Math.round(ph * w / h);
    const { ctx, tex } = canvasTexture(pw, ph);
    const face = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    face.scale.set(w, h, 1);
    const b = {
      face, w, h, label, active: false, disabled: false, hover: false, onSelect,
      set(props) {
        let changed = false;
        for (const k in props) if (b[k] !== props[k]) { b[k] = props[k]; changed = true; }
        if (changed) b.draw();
      },
      draw() {
        ctx.clearRect(0, 0, pw, ph);
        ctx.globalAlpha = b.disabled ? 0.4 : 1;
        roundRect(ctx, 3, 3, pw - 6, ph - 6, 28);
        ctx.fillStyle = b.active ? COL.accent : b.hover ? '#18294a' : 'rgba(12,18,32,.94)';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = b.hover || b.active ? COL.accent : b.onSelect ? COL.edge : 'rgba(0,0,0,0)';
        ctx.stroke();
        ctx.fillStyle = b.active ? COL.accentInk : COL.ink;
        ctx.font = '600 40px ' + FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.label, pw / 2, ph / 2 + 2, pw - 30);
        ctx.globalAlpha = 1;
        tex.needsUpdate = true;
        invalidate();
      },
    };
    face.userData = {
      get label() { return b.label; },
      get enabled() { return !b.disabled && !!b.onSelect; },
      setHover(on) { b.set({ hover: on }); },
      select() { if (!b.disabled && b.onSelect) b.onSelect(); },
    };
    b.draw();
    return b;
  }

  // A framed rectangle (photo, card, panel). Returns { group, face, frame, size(w, h), fit(aspect, maxW, maxH) }.
  function makeTile(color, label, onSelect, radius) {
    const group = new THREE.Group(), rad = radius === undefined ? 0.024 : radius;
    const frameMat = new THREE.MeshBasicMaterial({ color: COL.line });
    const frame = new THREE.Mesh(PLANE, frameMat);
    frame.position.z = -0.004;
    const face = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: color || COL.bg2 }));
    group.add(frame, face);
    const t = {
      group, face, frame,
      // radius < 0 means a fraction of the shorter side (an app icon is -0.225)
      size(w, h) {
        const r = rad < 0 ? -rad * Math.min(w, h) : rad;
        face.geometry = roundedGeo(w, h, r); frame.geometry = roundedGeo(w + 0.022, h + 0.022, r + 0.011);
        face.scale.set(w, h, 1); frame.scale.set(w + 0.022, h + 0.022, 1);
      },
      fit(aspect, maxW, maxH) {
        let w = maxW, h = w / aspect;
        if (h > maxH) { h = maxH; w = h * aspect; }
        t.size(w, h);
      },
      setMap(tex) { const m = face.material; if (m.map && m.map !== tex) m.map.dispose(); m.map = tex; m.color.set('#ffffff'); m.needsUpdate = true; invalidate(); },
    };
    face.userData = {
      label, enabled: true, image: null,
      setHover(on) { frameMat.color.set(on ? COL.accent : COL.line); group.scale.setScalar(on ? 1.05 : 1); },
      select: onSelect,
    };
    return t;
  }

  // Place an object on the cylinder of radius r around the viewer: theta is clockwise from straight ahead.
  function place(obj, theta, y, r, tilt) {
    obj.position.set(r * Math.sin(theta), y, -r * Math.cos(theta));
    obj.rotation.order = 'YXZ';
    obj.rotation.set(tilt || 0, -theta, 0);
  }

  // A strip of cylinder facing inwards, textured so that text reads left to right from the centre.
  function curvedPanel(tex, thetaA, thetaB, y, h, r, opts) {
    const span = thetaB - thetaA;
    const geo = new THREE.CylinderGeometry(r, r, h, Math.max(4, Math.ceil(span * 24)), 1, true, Math.PI + thetaA, span);
    geo.scale(-1, 1, 1);      // seen from inside: front faces inwards, and u runs left to right
    const mat = new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false }, tex ? { map: tex } : {}, opts || {}));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    return mesh;
  }

  return { PLANE, aniso, loadImage, imageTexture, canvasTexture, scaledTexture, roundRect, wrapLines, disposeMesh, emptyGroup, roundedGeo, makeButton, makeTile, place, curvedPanel };
}
