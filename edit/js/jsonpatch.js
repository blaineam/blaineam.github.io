// Format-preserving JSON editing.
//
// The content files are hand-formatted (blank lines between groups, one photo per line, aligned
// columns). Re-serialising them with JSON.stringify would rewrite every line, so instead the text
// is parsed into a tree that remembers where each value sits, and only the values that actually
// changed are replaced, inserted or removed. `patchJson` always verifies its own result and falls
// back to plain JSON.stringify if the patched text does not parse to exactly the wanted value.

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
}

export const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/* ---------- parse into a tree with positions ---------- */
export function parseCst(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const fail = (m) => { throw new SyntaxError(`${m} at character ${i}`); };
  const string = () => {
    const s = i; i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (text[i] !== '"') fail('Unterminated string');
    i++;
    return JSON.parse(text.slice(s, i));
  };
  const value = () => {
    ws();
    const start = i, c = text[i];
    if (c === '{') {
      i++; const members = []; ws();
      if (text[i] === '}') { i++; return { type: 'object', start, end: i, members }; }
      for (;;) {
        ws(); if (text[i] !== '"') fail('Expected a key');
        const keyStart = i, key = string(); ws();
        if (text[i] !== ':') fail('Expected ":"');
        i++; const colonEnd = i;
        const node = value();
        members.push({ key, start: keyStart, colonEnd, end: node.end, node });
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; break; }
        fail('Expected "," or "}"');
      }
      return { type: 'object', start, end: i, members };
    }
    if (c === '[') {
      i++; const items = []; ws();
      if (text[i] === ']') { i++; return { type: 'array', start, end: i, items }; }
      for (;;) {
        items.push(value()); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; break; }
        fail('Expected "," or "]"');
      }
      return { type: 'array', start, end: i, items };
    }
    if (c === '"') { const v = string(); return { type: 'prim', start, end: i, value: v }; }
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 40));
    if (!m) fail('Unexpected character');
    i += m[0].length;
    return { type: 'prim', start, end: i, value: JSON.parse(m[0]) };
  };
  const root = value(); ws();
  if (i !== text.length) fail('Unexpected text after the end');
  return root;
}

const valueOf = (n) => n.type === 'prim' ? n.value
  : n.type === 'array' ? n.items.map(valueOf)
  : Object.fromEntries(n.members.map((m) => [m.key, valueOf(m.node)]));

/* ---------- style detection and fresh serialisation ---------- */
const lineIndent = (text, pos) => {
  const nl = text.lastIndexOf('\n', pos - 1);
  return /^[ \t]*/.exec(text.slice(nl + 1, pos))[0];
};
const kids = (n) => n.type === 'object' ? n.members.map((m) => m.node) : n.type === 'array' ? n.items : [];
const multiLine = (text, n) => {
  const first = n.type === 'object' ? n.members[0] : n.items[0];
  return first ? text.slice(n.start, first.start).includes('\n') : false;
};
// "compact" = no spaces after colons and commas ({"a":1}), as in photos.json.
function detectCompact(text, n) {
  const queue = [n];
  while (queue.length) {
    const x = queue.shift();
    if (x.type === 'object' && x.members.length) return x.members[0].node.start === x.members[0].colonEnd;
    queue.push(...kids(x));
  }
  return false;
}
function inline(v, compact) {
  if (Array.isArray(v)) return '[' + v.map((x) => inline(x, compact)).join(compact ? ',' : ', ') + ']';
  if (isObj(v)) {
    const parts = Object.keys(v).map((k) => JSON.stringify(k) + (compact ? ':' : ': ') + inline(v[k], compact));
    if (!parts.length) return '{}';
    return compact ? '{' + parts.join(',') + '}' : '{ ' + parts.join(', ') + ' }';
  }
  return JSON.stringify(v);
}
const pretty = (v, indent) => JSON.stringify(v, null, 2).replace(/\n/g, '\n' + indent);
// How a brand-new child of container `n` should be written.
function childWriter(text, n) {
  const containers = kids(n).filter((k) => k.type !== 'prim');
  const allOneLine = containers.every((k) => !text.slice(k.start, k.end).includes('\n'));
  const multi = multiLine(text, n);
  const first = n.type === 'object' ? n.members[0] : n.items[0];
  const indent = multi && first ? lineIndent(text, first.start) : lineIndent(text, n.start);
  const compact = detectCompact(text, containers[0] || n);
  return (v) => (!multi || (containers.length && allOneLine)) ? inline(v, compact)
    : (isObj(v) || Array.isArray(v)) ? pretty(v, indent) : JSON.stringify(v);
}

/* ---------- diff a tree node against the wanted value ---------- */
function rewrite(text, n, val, edits) {
  const write = childWriter(text, n);
  const multi = multiLine(text, n);
  const first = n.type === 'object' ? n.members[0] : n.items[0];
  const isArr = Array.isArray(val);
  if (!first) {               // was empty: nothing to imitate
    const onOneLine = lineIndent(text, n.start);
    edits.push([n.start, n.end, (isArr ? val.length : Object.keys(val).length) > 3 ? pretty(val, onOneLine) : inline(val, false)]);
    return;
  }
  const indent = lineIndent(text, first.start);
  const closeIndent = lineIndent(text, n.end - 1);
  const colon = n.type === 'object' && n.members[0].node.start === n.members[0].colonEnd ? ':' : ': ';
  let parts;
  if (isArr) {
    const olds = n.items.map((it) => [valueOf(it), text.slice(it.start, it.end)]);
    parts = val.map((v) => { const hit = olds.find(([ov]) => deepEqual(ov, v)); return hit ? hit[1] : write(v); });
  } else {
    const olds = new Map(n.members.map((m) => [m.key, m]));
    parts = Object.keys(val).map((k) => {
      const m = olds.get(k);
      const body = m && deepEqual(valueOf(m.node), val[k]) ? text.slice(m.node.start, m.node.end) : write(val[k]);
      return JSON.stringify(k) + colon + body;
    });
  }
  const [open, close] = isArr ? ['[', ']'] : ['{', '}'];
  if (!parts.length) { edits.push([n.start, n.end, open + close]); return; }
  const out = multi
    ? open + '\n' + indent + parts.join(',\n' + indent) + '\n' + closeIndent + close
    : (() => {
        const sep = text.slice(n.start, n.end).includes(', ') || parts.length < 2 && !detectCompact(text, n) ? ', ' : ',';
        const pad = !isArr && text[n.start + 1] === ' ' ? ' ' : '';
        return open + pad + parts.join(sep) + pad + close;
      })();
  edits.push([n.start, n.end, out]);
}

function diff(text, n, val, edits) {
  const old = valueOf(n);
  if (deepEqual(old, val)) return;

  if (n.type === 'object' && isObj(val)) {
    const oldKeys = n.members.map((m) => m.key), newKeys = Object.keys(val);
    const commonOld = oldKeys.filter((k) => k in val), commonNew = newKeys.filter((k) => oldKeys.includes(k));
    const sameOrder = commonOld.every((k, i) => k === commonNew[i]);
    if (!sameOrder || !commonOld.length) return rewrite(text, n, val, edits);

    const multi = multiLine(text, n);
    const indent = lineIndent(text, n.members[0].start);
    const colon = n.members[0].node.start === n.members[0].colonEnd ? ':' : ': ';
    const write = childWriter(text, n);
    const tight = !multi && !text.slice(n.start, n.end).includes(', ');
    const sep = multi ? ',\n' + indent : tight ? ',' : ', ';
    const member = (k) => JSON.stringify(k) + colon + write(val[k]);

    // removals
    const firstKept = n.members.findIndex((m) => m.key in val);
    if (firstKept > 0) edits.push([n.members[0].start, n.members[firstKept].start, '']);
    n.members.forEach((m, i) => { if (i > firstKept && !(m.key in val)) edits.push([n.members[i - 1].end, m.end, '']); });
    // additions, grouped behind the surviving key they follow
    let anchor = null, pending = [];
    const flush = () => {
      if (!pending.length) return;
      if (anchor) edits.push([anchor.end, anchor.end, pending.map((k) => sep + member(k)).join('')]);
      else { const at = n.members[firstKept].start; edits.push([at, at, pending.map((k) => member(k) + sep).join('')]); }
      pending = [];
    };
    for (const k of newKeys) {
      const m = n.members.find((x) => x.key === k);
      if (m) { flush(); anchor = m; diff(text, m.node, val[k], edits); } else pending.push(k);
    }
    flush();
    return;
  }

  if (n.type === 'array' && Array.isArray(val)) {
    if (n.items.length === val.length && val.length) {
      const olds = n.items.map(valueOf);
      const moved = val.some((v, i) => !deepEqual(v, olds[i]) && olds.some((o) => deepEqual(o, v)));
      if (!moved) { n.items.forEach((it, i) => diff(text, it, val[i], edits)); return; }
    }
    return rewrite(text, n, val, edits);
  }

  // type changed, or a primitive changed
  const oneLine = !text.slice(n.start, n.end).includes('\n');
  const fresh = (isObj(val) || Array.isArray(val))
    ? (n.type === 'prim' || oneLine ? inline(val, false) : pretty(val, lineIndent(text, n.start)))
    : JSON.stringify(val);
  edits.push([n.start, n.end, fresh]);
}

/** Returns `text` changed as little as possible so that it parses to `value`. */
export function patchJson(text, value) {
  try {
    const edits = [];
    diff(text, parseCst(text), value, edits);
    // Apply from the end; where a removal and an insertion start at the same place, the removal goes first.
    edits.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let out = text;
    for (const [s, e, rep] of edits) out = out.slice(0, s) + rep + out.slice(e);
    if (deepEqual(JSON.parse(out), value) && sameKeyOrder(JSON.parse(out), value)) return { text: out, reformatted: false };
  } catch { /* fall through to the safe path */ }
  return { text: JSON.stringify(value, null, 2) + '\n', reformatted: true };
}

function sameKeyOrder(a, b) {
  if (Array.isArray(a)) return a.every((x, i) => sameKeyOrder(x, b[i]));
  if (!isObj(a)) return true;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.every((k, i) => k === kb[i]) && ka.every((k) => sameKeyOrder(a[k], b[k]));
}

/* ---------- three-way merge, for when the branch moved under a draft ---------- */
/** Reapplies the edits (base → mine) on top of `theirs`. Conflicting spots keep `mine` and are reported. */
export function merge3(base, mine, theirs, path = '', conflicts = []) {
  const done = (value) => ({ value, conflicts });
  if (deepEqual(mine, base)) return done(clone(theirs));
  if (deepEqual(theirs, base) || deepEqual(mine, theirs)) return done(clone(mine));
  if (isObj(base) && isObj(mine) && isObj(theirs)) {
    const out = {};
    // Follow the repository's key order (so its layout survives) and slot keys that exist only
    // in the draft behind the key they followed there.
    const keys = Object.keys(theirs);
    const mineKeys = Object.keys(mine);
    mineKeys.forEach((k, i) => {
      if (k in theirs) return;
      let at = -1;
      for (let j = i - 1; j >= 0 && at < 0; j--) at = keys.indexOf(mineKeys[j]);
      keys.splice(at + 1, 0, k);
    });
    for (const k of keys) {
      const inB = k in base, inM = k in mine, inT = k in theirs;
      if (inM && inT) out[k] = inB ? merge3(base[k], mine[k], theirs[k], `${path}/${k}`, conflicts).value
        : (deepEqual(mine[k], theirs[k]) ? mine[k] : (conflicts.push(`${path}/${k}`), mine[k]));
      else if (inM) { if (!inB) out[k] = mine[k]; else if (!deepEqual(mine[k], base[k])) { conflicts.push(`${path}/${k}`); out[k] = mine[k]; } }
      else if (inT) { if (!inB) out[k] = theirs[k]; else if (!deepEqual(theirs[k], base[k])) { conflicts.push(`${path}/${k}`); out[k] = theirs[k]; } }
    }
    return done(clone(out));
  }
  if (Array.isArray(base) && Array.isArray(mine) && Array.isArray(theirs) && base.length === mine.length && base.length === theirs.length) {
    return done(base.map((b, i) => merge3(b, mine[i], theirs[i], `${path}/${i}`, conflicts).value));
  }
  conflicts.push(path || '/');
  return done(clone(mine));
}

/* ---------- line diff for the pending-changes panel ---------- */
/** Returns hunks: [{ lines: [{ t: ' ' | '+' | '-', s, a, b }] }] with `ctx` lines of context. */
export function lineDiff(aText, bText, ctx = 2) {
  const a = aText.split('\n'), b = bText.split('\n');
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
  const ops = [];
  if (A.length * B.length > 4e6) {            // too big to align: show as one block
    A.forEach((s) => ops.push(['-', s])); B.forEach((s) => ops.push(['+', s]));
  } else {
    const w = B.length + 1, L = new Uint32Array((A.length + 1) * w);
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) {
      L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) { ops.push([' ', A[i]]); i++; j++; }
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) ops.push(['-', A[i++]]);
      else ops.push(['+', B[j++]]);
    }
    while (i < A.length) ops.push(['-', A[i++]]);
    while (j < B.length) ops.push(['+', B[j++]]);
  }
  const all = [...a.slice(0, pre).map((s) => [' ', s]), ...ops, ...a.slice(a.length - suf).map((s) => [' ', s])];
  let la = 0, lb = 0;
  const rows = all.map(([t, s]) => ({ t, s, a: t !== '+' ? ++la : null, b: t !== '-' ? ++lb : null }));
  const hunks = []; let cur = null, lastChange = -Infinity;
  rows.forEach((r, idx) => {
    if (r.t === ' ') return;
    if (!cur || idx - lastChange > ctx * 2 + 1) {
      cur = { from: Math.max(0, idx - ctx), to: idx }; hunks.push(cur);
    }
    cur.to = idx; lastChange = idx;
  });
  return hunks.map((h) => ({ lines: rows.slice(h.from, Math.min(rows.length, h.to + ctx + 1)) }));
}
