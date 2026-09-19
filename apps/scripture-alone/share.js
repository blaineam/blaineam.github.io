/* Scripture Alone — share-link card, rebuilt in the browser.
 *
 * A share link looks like https://wemiller.com/apps/scripture-alone/#s=<payload>.
 * The payload is base64url (no padding) of UTF-8 JSON carrying the verse itself,
 * and it lives in the URL fragment, which browsers never send to a server. This
 * script reads it from location.hash, validates it, and draws the same card the
 * app makes on a <canvas>, following the reference renderer in the app repo's
 * docs/share-links.md (source of truth: ScriptureAlone/Share/ShareStyle.swift and
 * ShareCard.swift).
 *
 * Privacy rules this file keeps:
 *   - The payload never leaves the page: no fetch, XHR, beacon, analytics or
 *     image request carries it. The only place it goes is the "Open in
 *     Scripture Alone" link, a custom-scheme URL handled on the device.
 *   - The payload is untrusted input: it only ever reaches the DOM through
 *     textContent / setAttribute, never innerHTML.
 *   - System fonts only; no web fonts (loading one would announce the visit).
 */
(function () {
  'use strict';

  var MAX_TEXT = 6000; // decoders refuse `t` over 6,000 characters

  // docs/share-links.md § Templates. Background stops run top → bottom.
  var TEMPLATES = {
    parchment: { bg: ['#F6EDD9', '#EBDDBF'], ink: '#3B2F20', accent: '#8A5A2B', red: '#A12A1C', frame: true },
    ink:       { bg: ['#14161A'], ink: '#EDE8DF', accent: '#C9A45C', red: '#FF7A6B', frame: false },
    dawn:      { bg: ['#F7D9C4', '#EFB4A8', '#A893CC'], ink: '#2E2236', accent: '#6B4A6E', red: '#9E1B32', frame: false },
    night:     { bg: ['#0B1026', '#1D2A57'], ink: '#E9EDF8', accent: '#A9B8F0', red: '#FF8A80', frame: false },
    linen:     { bg: ['#F8F5EF'], ink: '#2E2A25', accent: '#9C7A4E', red: '#B0261B', frame: true },
    stone:     { bg: ['#DEDCD7', '#C3C0B9'], ink: '#26262A', accent: '#5A5A62', red: '#9B2226', frame: false },
    olive:     { bg: ['#46512F', '#2D3520'], ink: '#F2EFDD', accent: '#D6C58C', red: '#FFA48A', frame: false },
    minimal:   { bg: ['#FFFFFF'], ink: '#111111', accent: '#6E6E6E', red: '#C0392B', frame: false }
  };

  // docs/share-links.md § Typefaces — system stacks only.
  var FONTS = {
    serif:    'ui-serif, "New York", "Iowan Old Style", Georgia, serif',
    sans:     'system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    charter:  'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif',
    iowan:    '"Iowan Old Style", "Palatino Linotype", Palatino, "URW Palladio L", serif',
    georgia:  'Georgia, "Times New Roman", serif',
    palatino: 'Palatino, "Palatino Linotype", "Book Antiqua", "URW Palladio L", serif',
    avenir:   '"Avenir Next", Avenir, "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  };

  // Layout size in units; the export is 2× (2160 px on the long side).
  var ASPECTS = {
    square: [1080, 1080],
    story: [608, 1080],
    wide: [1080, 608]
  };
  var EXPORT_SCALE = 2;

  var NUMBER_SCALE = 0.55;   // verse numbers: 0.55 × passage size…
  var NUMBER_RISE = 0.32;    // …raised 0.32 × passage size
  var LINE_HEIGHT = 1.28;    // passage line height = size × 1.28

  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  // ---- Decoding -------------------------------------------------------------

  function ShareError(code) { this.code = code; }

  /** The raw `s` value from the fragment, or null when this isn't a share link. */
  function payloadFromHash() {
    var hash = window.location.hash || '';
    if (hash.length < 2) return null;
    var params;
    try { params = new URLSearchParams(hash.slice(1)); } catch (e) { return null; }
    var s = params.get('s');
    return s === null ? null : s;
  }

  function decode(s) {
    // base64url never contains anything outside this set; refuse early rather
    // than hand oddities to atob.
    if (!s || !/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) throw new ShareError('broken');
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    b64 = b64 + '===='.slice(0, (4 - (b64.length % 4)) % 4);
    var data;
    try {
      var binary = atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (e) {
      throw new ShareError('broken');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ShareError('broken');
    if (data.v !== 1) {
      // A number other than 1 is a newer link format; anything else is damage.
      throw new ShareError(typeof data.v === 'number' ? 'newer' : 'broken');
    }
    if (typeof data.ref !== 'string' || typeof data.t !== 'string' || !data.t.length) throw new ShareError('broken');
    if (data.t.length > MAX_TEXT) throw new ShareError('long');

    var text = data.t;
    var length = text.length; // UTF-16 code units, the same units as `red`
    var red = [];
    if (Array.isArray(data.red)) {
      data.red.forEach(function (pair) {
        if (!Array.isArray(pair) || pair.length !== 2) return;
        var start = pair[0], len = pair[1];
        if (!isInt(start) || !isInt(len) || start < 0 || len <= 0 || start >= length) return;
        red.push([start, Math.min(len, length - start)]);
      });
    }
    return {
      ref: data.ref,
      keys: typeof data.k === 'string' ? data.k : '',
      tr: typeof data.tr === 'string' ? data.tr : '',
      text: text,
      red: red,
      template: typeof data.tp === 'string' && has(TEMPLATES, data.tp) ? data.tp : 'parchment',
      font: typeof data.f === 'string' && has(FONTS, data.f) ? data.f : 'serif',
      aspect: typeof data.a === 'string' && has(ASPECTS, data.a) ? data.a : 'square'
    };
  }

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  // ---- Verse numbers --------------------------------------------------------

  /** `k` → [{book, chapter, verse} start, end] pairs. Bad parts are skipped. */
  function parseKeys(k) {
    var ranges = [];
    String(k).split(',').forEach(function (part) {
      var bits = part.trim().split('-');
      if (bits.length < 1 || bits.length > 2) return;
      var a = verseRef(bits[0]);
      var b = bits.length === 2 ? verseRef(bits[1]) : a;
      if (a && b && key(b) >= key(a)) ranges.push([a, b]);
    });
    return ranges;
  }

  function verseRef(s) {
    if (!/^\d{7,8}$/.test(s)) return null;
    var n = parseInt(s, 10);
    var ref = { book: Math.floor(n / 1000000), chapter: Math.floor(n / 1000) % 1000, verse: n % 1000 };
    return ref.book >= 1 && ref.book <= 66 && ref.chapter >= 1 && ref.verse >= 1 ? ref : null;
  }

  function key(r) { return r.book * 1000000 + r.chapter * 1000 + r.verse; }

  /**
   * Marks the verse numbers in `text` (as UTF-16 [start, end) spans). The numbers
   * are derived from `k` in order — "16", or "2:1" for a verse that starts a new
   * chapter mid-passage — and each is matched as a token at the start of the text
   * or right after a space, followed by a space. Anything that doesn't match
   * stays plain text. A single verse carries no number.
   */
  function findNumbers(text, keys) {
    var ranges = parseKeys(keys);
    if (!ranges.length) return [];
    if (ranges.length === 1 && key(ranges[0][0]) === key(ranges[0][1])) return [];

    var spans = [];
    var r = 0;          // current range
    var current = null; // last matched verse

    function candidates() {
      if (!current) return [{ ref: ranges[0][0], label: String(ranges[0][0].verse) }];
      var end = ranges[r][1];
      if (key(current) < key(end)) {
        var next = [{ ref: { book: current.book, chapter: current.chapter, verse: current.verse + 1 },
                      label: String(current.verse + 1), range: r }];
        if (current.chapter < end.chapter) {
          var first = { book: current.book, chapter: current.chapter + 1, verse: 1 };
          next.push({ ref: first, label: first.chapter + ':1', range: r });
        }
        return next;
      }
      if (r + 1 >= ranges.length) return [];
      var start = ranges[r + 1][0];
      var sameChapter = start.book === current.book && start.chapter === current.chapter;
      return [{ ref: start, label: sameChapter ? String(start.verse) : start.chapter + ':' + start.verse, range: r + 1 }];
    }

    var pos = 0;
    while (pos < text.length) {
      var space = text.indexOf(' ', pos);
      if (space < 0) break; // a number must be followed by a space
      var token = text.slice(pos, space);
      var options = candidates();
      for (var i = 0; i < options.length; i++) {
        if (options[i].label === token) {
          spans.push([pos, space]);
          current = options[i].ref;
          if (options[i].range !== undefined) r = options[i].range;
          break;
        }
      }
      if (!options.length) break;
      pos = space + 1;
    }
    return spans;
  }

  // ---- Layout ---------------------------------------------------------------

  function fontString(style, size, family) {
    return style + ' ' + size.toFixed(2) + 'px ' + family;
  }

  /**
   * Splits the passage into words, each a list of styled runs, so red letters
   * and verse numbers can start or stop mid-word. A verse number stays glued to
   * the word after it so it never dangles at the end of a line.
   */
  function buildWords(share) {
    var text = share.text;
    var n = text.length;
    var red = new Uint8Array(n);
    var num = new Uint8Array(n);
    share.red.forEach(function (p) { for (var i = p[0]; i < p[0] + p[1]; i++) red[i] = 1; });
    findNumbers(text, share.keys).forEach(function (p) { for (var i = p[0]; i < p[1]; i++) num[i] = 1; });

    var words = [];
    var runs = [];
    var run = null;
    var glue = false;
    function flushRun() { if (run && run.text) runs.push(run); run = null; }
    function flushWord() {
      flushRun();
      if (runs.length) words.push({ runs: runs, gluedToNext: glue });
      runs = [];
      glue = false;
    }
    for (var i = 0; i < n; i++) {
      var ch = text[i];
      if (ch === ' ' || ch === '\n' || ch === '\t') {
        // A space right after a verse number binds the number to its verse.
        glue = i > 0 && num[i - 1] === 1;
        flushWord();
        if (glue && words.length) words[words.length - 1].gluedToNext = true;
        continue;
      }
      var kind = num[i] ? 'num' : (red[i] ? 'red' : 'ink');
      if (!run || run.kind !== kind) { flushRun(); run = { kind: kind, text: '' }; }
      run.text += ch;
    }
    flushWord();
    return words;
  }

  function measureWords(ctx, words, size, family) {
    var body = fontString('normal 400', size, family);
    var small = fontString('normal 400', size * NUMBER_SCALE, family);
    words.forEach(function (w) {
      var width = 0;
      w.runs.forEach(function (r) {
        ctx.font = r.kind === 'num' ? small : body;
        r.width = ctx.measureText(r.text).width;
        width += r.width;
      });
      w.width = width;
    });
    ctx.font = body;
    return ctx.measureText(' ').width;
  }

  /** Greedy line breaking; returns lines of {words, width}. */
  function wrap(ctx, words, size, family, maxWidth) {
    var space = measureWords(ctx, words, size, family);
    // Glue numbers to the following word into unbreakable units.
    var units = [];
    for (var i = 0; i < words.length; i++) {
      var unit = { words: [words[i]], width: words[i].width };
      while (words[i].gluedToNext && i + 1 < words.length) {
        i++;
        unit.words.push(words[i]);
        unit.width += space + words[i].width;
      }
      units.push(unit);
    }
    var lines = [];
    var line = null;
    units.forEach(function (u) {
      if (line && line.width + space + u.width <= maxWidth) {
        line.units.push(u);
        line.width += space + u.width;
      } else {
        if (line) lines.push(line);
        line = { units: [u], width: u.width };
      }
    });
    if (line) lines.push(line);
    lines.forEach(function (l) {
      l.words = [];
      l.units.forEach(function (u) { l.words = l.words.concat(u.words); });
    });
    return { lines: lines, space: space };
  }

  function metricsFor(aspect) {
    var size = ASPECTS[aspect];
    var W = size[0], H = size[1], S = Math.min(W, H);
    var R = Math.max(18, 0.034 * S);
    var M = Math.max(14, 0.024 * S);
    return {
      W: W, H: H, S: S, R: R, M: M,
      padX: 0.09 * W,
      padY: 0.09 * H,
      textWidth: W - 2 * 0.09 * W,
      textHeight: H - 2 * 0.09 * H - 3.6 * R - 2.4 * M,
      minFont: Math.max(20, 0.022 * S),
      maxFont: 0.066 * Math.sqrt(W * H)
    };
  }

  /** The largest passage size that fits in ~95% of the text area (binary search). */
  function fitFont(ctx, words, family, m) {
    var target = m.textHeight * 0.95;
    function fits(size) {
      var w = wrap(ctx, words, size, family, m.textWidth);
      var tooWide = w.lines.some(function (l) { return l.width > m.textWidth + 0.5; });
      return !tooWide && w.lines.length * size * LINE_HEIGHT <= target;
    }
    var low = m.minFont, high = m.maxFont;
    if (!fits(low)) {
      // The app would trim whole verses; the web shrinks further instead.
      high = low;
      low = 6;
      if (!fits(low)) return low;
    } else if (fits(high)) {
      return high;
    }
    for (var i = 0; i < 12; i++) {
      var mid = (low + high) / 2;
      if (fits(mid)) low = mid; else high = mid;
    }
    return low >= m.minFont ? Math.floor(low) : low;
  }

  // Text drawn with tracking (letter-spacing) one code point at a time, so it
  // works in browsers without CanvasRenderingContext2D.letterSpacing.
  function trackedWidth(ctx, text, tracking) {
    var width = 0;
    for (var ch of text) width += ctx.measureText(ch).width + tracking;
    return width;
  }

  function drawTracked(ctx, text, x, y, tracking) {
    for (var ch of text) {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + tracking;
    }
  }

  /** Reference lines: up to two lines at size R, then scaled down to half (as the app's lineLimit(2) + minimumScaleFactor). */
  function layoutReference(ctx, ref, translation, family, m) {
    // Break between ranges ("GENESIS 1:31–2:1, GENESIS 2:3") before breaking
    // inside one, and keep "·  ASV" on the same line as the last range.
    var suffix = translation ? '  ·  ' + translation : '';
    var ranges = ref.toUpperCase().split(', ');
    var rangeTokens = ranges.map(function (r, i) { return i < ranges.length - 1 ? r + ',' : r + suffix; });
    var wordTokens = [];
    rangeTokens.forEach(function (r, i) {
      var words = (i === rangeTokens.length - 1 && suffix ? r.slice(0, -suffix.length) : r).split(' ');
      if (i === rangeTokens.length - 1 && suffix) words[words.length - 1] += suffix;
      wordTokens = wordTokens.concat(words);
    });
    function attempt(size) {
      ctx.font = fontString('normal 700', size, family);
      var tracking = 0.12 * size;
      var tooWide = rangeTokens.some(function (t) { return trackedWidth(ctx, t, tracking) > m.textWidth; });
      var words = tooWide ? wordTokens : rangeTokens;
      var lines = [];
      var line = '';
      for (var i = 0; i < words.length; i++) {
        var candidate = line ? line + ' ' + words[i] : words[i];
        if (!line || trackedWidth(ctx, candidate, tracking) <= m.textWidth) line = candidate;
        else { lines.push(line); line = words[i]; }
      }
      if (line) lines.push(line);
      var fits = lines.length <= 2 && lines.every(function (l) { return trackedWidth(ctx, l, tracking) <= m.textWidth; });
      return { size: size, tracking: tracking, lines: lines, fits: fits };
    }
    for (var scale = 1; scale >= 0.5; scale -= 0.05) {
      var r = attempt(m.R * scale);
      if (r.fits) return r;
    }
    return attempt(m.R * 0.5);
  }

  function hexToRgba(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
  }

  /** Draws the card onto `canvas` at 2×. */
  function render(canvas, share) {
    var m = metricsFor(share.aspect);
    var tpl = TEMPLATES[share.template];
    var family = FONTS[share.font];
    canvas.width = m.W * EXPORT_SCALE;
    canvas.height = m.H * EXPORT_SCALE;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Background: flat, or a top-to-bottom gradient through the stops.
    if (tpl.bg.length === 1) {
      ctx.fillStyle = tpl.bg[0];
    } else {
      var g = ctx.createLinearGradient(0, 0, 0, m.H);
      tpl.bg.forEach(function (c, i) { g.addColorStop(i / (tpl.bg.length - 1), c); });
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, m.W, m.H);

    // Frame (Parchment, Linen): 1.5-unit hairline inset 0.035·S, accent at 35%.
    if (tpl.frame) {
      var inset = 0.035 * m.S;
      ctx.strokeStyle = hexToRgba(tpl.accent, 0.35);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(inset + 0.75, inset + 0.75, m.W - 2 * inset - 1.5, m.H - 2 * inset - 1.5);
    }

    // Passage.
    var words = buildWords(share);
    var size = fitFont(ctx, words, family, m);
    var laid = wrap(ctx, words, size, family, m.textWidth);
    var lineHeight = size * LINE_HEIGHT;
    var passageHeight = laid.lines.length * lineHeight;

    // Reference block: rule 1.2·R below the passage, 0.9·R above the reference.
    var ref = layoutReference(ctx, share.ref, share.tr, family, m);
    var ruleHeight = Math.max(2, 0.08 * m.R);
    var refLineHeight = ref.size * 1.2;
    var blockHeight = passageHeight + 1.2 * m.R + ruleHeight + 0.9 * m.R + ref.lines.length * refLineHeight;

    // The group is centered between the top padding and the wordmark's block.
    var top = m.padY;
    var bottom = m.H - m.padY - 2.4 * m.M;
    var y = top + Math.max(0, (bottom - top - blockHeight) / 2);
    var cx = m.W / 2;

    var body = fontString('normal 400', size, family);
    var small = fontString('normal 400', size * NUMBER_SCALE, family);
    laid.lines.forEach(function (line, index) {
      // The baseline sits where a line box of size × 1.28 puts it (leading split evenly).
      var baseline = y + index * lineHeight + (lineHeight - size) / 2 + size * 0.8;
      var x = cx - line.width / 2;
      line.words.forEach(function (word, wi) {
        if (wi > 0) x += laid.space;
        word.runs.forEach(function (run) {
          if (run.kind === 'num') {
            ctx.font = small;
            ctx.fillStyle = tpl.accent;
            ctx.fillText(run.text, x, baseline - size * NUMBER_RISE);
          } else {
            ctx.font = body;
            ctx.fillStyle = run.kind === 'red' ? tpl.red : tpl.ink;
            ctx.fillText(run.text, x, baseline);
          }
          x += run.width;
        });
      });
    });
    y += passageHeight + 1.2 * m.R;

    // Rule: 1.6·R wide, rounded, accent at 70%.
    ctx.fillStyle = hexToRgba(tpl.accent, 0.7);
    roundRect(ctx, cx - 0.8 * m.R, y, 1.6 * m.R, ruleHeight, ruleHeight / 2);
    ctx.fill();
    y += ruleHeight + 0.9 * m.R;

    // Reference: bold, uppercase, letter-spaced 0.12·R, accent.
    ctx.font = fontString('normal 700', ref.size, family);
    ctx.fillStyle = tpl.accent;
    ref.lines.forEach(function (text, i) {
      // Tracking trails every character; leave the last one out when centering.
      var width = trackedWidth(ctx, text, ref.tracking) - ref.tracking;
      drawTracked(ctx, text, cx - width / 2, y + i * refLineHeight + ref.size * 0.9, ref.tracking);
    });

    // Wordmark: italic, M, accent at 60%, at the bottom inside the padding.
    ctx.font = fontString('italic 400', m.M, family);
    ctx.fillStyle = hexToRgba(tpl.accent, 0.6);
    ctx.textAlign = 'center';
    ctx.fillText('Scripture Alone', cx, m.H - m.padY - m.M * 0.25);
    ctx.textAlign = 'left';
  }

  // ---- Page -----------------------------------------------------------------

  var section, canvas, card, actions, openLink, saveButton, errorBox, note, current;
  var baseTitle = document.title;

  function message(name) {
    var el = document.querySelector('[data-sa-message="' + name + '"]');
    return el ? el.textContent.trim() : '';
  }

  /** "John 3:16–17" → "John-3-16-17.png" */
  function fileName(ref) {
    var stem;
    try { stem = ref.replace(/[^\p{L}\p{N}]+/gu, '-'); }
    catch (e) { stem = ref.replace(/[^A-Za-z0-9]+/g, '-'); }
    stem = stem.replace(/^-+|-+$/g, '').slice(0, 80);
    return (stem || 'Scripture-Alone') + '.png';
  }

  function isApple() {
    var ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod|Macintosh/.test(ua);
  }

  function show(on) {
    document.documentElement.classList.remove('sa-share-pending');
    document.body.classList.toggle('sa-sharing', on);
  }

  function update() {
    if (!section) return;
    var s = payloadFromHash();
    if (s === null) {
      current = null;
      show(false);
      document.title = baseTitle;
      return;
    }
    show(true);
    try {
      current = decode(s);
    } catch (e) {
      current = null;
      card.hidden = true;
      actions.hidden = true;
      note.hidden = true;
      errorBox.hidden = false;
      errorBox.textContent = message(e instanceof ShareError ? e.code : 'broken');
      document.title = baseTitle;
      return;
    }
    errorBox.hidden = true;
    note.hidden = false;
    card.hidden = false;
    actions.hidden = false;
    render(canvas, current);
    canvas.setAttribute('aria-label', current.ref + (current.tr ? ' (' + current.tr + ')' : '') + ': ' + current.text);
    card.setAttribute('data-aspect', current.aspect);
    // The custom scheme rather than the https share URL: universal links never
    // fire for a link to the page you are already on (same-origin navigation
    // stays in Safari), so the https form would only reload this page.
    // scripturealone://open#s=… is the app's documented equivalent. The payload
    // was checked to be pure base64url above, so it is safe in the href as is.
    openLink.setAttribute('href', 'scripturealone://open#s=' + s);
    openLink.hidden = !isApple();
    document.title = current.ref + ' · Scripture Alone';
  }

  function save() {
    if (!current) return;
    var name = fileName(current.ref);
    canvas.toBlob(function (blob) {
      if (!blob) return;
      // On iPhone and iPad the share sheet is how an image reaches Photos
      // ("Save Image"); everywhere else a plain download. Both stay on device.
      var touchApple = isApple() && navigator.maxTouchPoints > 1;
      if (touchApple && navigator.canShare && typeof File === 'function') {
        var file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file] }).catch(function (err) {
            if (!err || err.name !== 'AbortError') download(blob, name);
          });
          return;
        }
      }
      download(blob, name);
    }, 'image/png');
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function init() {
    section = document.getElementById('shared-verse');
    if (!section) return;
    canvas = section.querySelector('canvas');
    card = section.querySelector('.sa-share-card');
    actions = section.querySelector('.sa-share-actions');
    openLink = section.querySelector('.sa-share-open');
    saveButton = section.querySelector('.sa-share-save');
    errorBox = section.querySelector('.sa-share-error');
    note = section.querySelector('.sa-share-note');
    saveButton.addEventListener('click', save);
    window.addEventListener('hashchange', update);
    // The dictionary swaps the page title and the message strings; keep both current.
    document.addEventListener('i18n:applied', function () {
      baseTitle = document.title;
      update();
    });
    update();
    if (payloadFromHash() !== null) window.scrollTo(0, 0);
  }

  // Exposed for the test page only; nothing here touches the network.
  window.ScriptureAloneShare = { decode: decode, findNumbers: findNumbers, render: render, fileName: fileName };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
