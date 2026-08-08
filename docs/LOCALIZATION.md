# Site localization

The portfolio is a pure-static GitHub Pages site, localized without duplicating
pages per language.

## Mechanism

- **English is the served content.** Every page keeps its full English copy in
  the HTML, so SEO crawlers and no-JS visitors see exactly what they always
  did. Localization is a progressive enhancement.
- **`/i18n/i18n.js`** (dependency-free, ~9 KB) runs on every localized page.
  On DOMContentLoaded it resolves the language — `?lang=` URL parameter →
  `localStorage` (`wemiller-lang`) → `navigator.language` → English — fetches
  the page's dictionary `/i18n/<page>.<lang>.json`, and swaps text for
  elements tagged:
  - `data-i18n="key"` → `textContent`
  - `data-i18n-html="key"` → `innerHTML` (value carries inline markup)
  - `data-i18n-attr="attr:key[;attr2:key2]"` → named attributes
  - special keys `_title` and `_meta.description` update the tab title and
    meta description (og: tags intentionally stay English — they are per-URL).
  It also sets `<html lang>`, renders a liquidGlass-styled floating language
  switcher (corner configurable via the script tag's `data-pos`), and
  dispatches an `i18n:applied` event pages can hook (index.html uses it to
  re-sync the radial-menu labels).
- **Languages:** `en` plus `zh-Hans, ja, de, fr, es, ko, pt-BR, it`.
- **SEO:** every localized page carries `hreflang` alternates pointing at its
  `?lang=<code>` variants plus `x-default`. No new URLs exist, so
  `sitemap.xml` is unchanged.

## Page coverage

Localized (all 8 languages): `index.html` (including the JS-built projects
timeline — its `document.write` template stamps `tl.<slug>.date` /
`tl.<slug>.desc` keys), `apps/index.html`, and every `apps/<slug>/index.html`
for: aperion, ari-helper, deepsi, embr, enter-space, luma-editor, mi-speaks,
pano-owl, pinline, revela, ridgeshot, sami, sightquick, tilebreak, tri-add,
wise-flyer, zap.

## Excluded: blip, glint, haven (mirror-synced — do NOT edit here)

`.github/workflows/mirror-app-docs.yml` rsyncs (with `--delete`) these three
directories from their source repos on a daily cron / repo-dispatch, so any
local edit is clobbered by the next sync:

| Portfolio path | Source of truth | Path inside the app repo |
| --- | --- | --- |
| `apps/blip/`  | `github.com/blaineam/Blip`  | `docs/` |
| `apps/glint/` | `github.com/blaineam/Glint` | `docs/` |
| `apps/haven/` | `github.com/blaineam/haven` | `web/` (plus `relay/install.sh` / `install.ps1`) |

To localize those landing pages, land the translations in the app repos at
the paths above (the same `data-i18n` + per-page dictionary approach works;
copy `/i18n/i18n.js` or reference it absolutely at `/i18n/i18n.js` since the
pages are served from wemiller.com). The next mirror run picks them up.

### Haven language handling

Language ≠ distribution region: the portfolio's own dictionaries are fully
translated in every language, including the Haven card tagline on
`apps/index.html` and the Haven project description in index.html's timeline
(an earlier revision pinned those to English for fr/zh-Hans; that policy was
reversed). Haven's mirrored site under `apps/haven/` manages its own
language set in the Haven repo — do not edit it here. The i18n runtime
supports a `data-langs` attribute on its script tag for pages that need a
restricted language set.

## Regenerating

1. **Tagging / extraction** (idempotent — safe to re-run after editing page
   copy; re-run it after `scripts/update-footers.py`, which rewrites footer
   blocks without i18n tags):

   ```sh
   python3 scripts/i18n-tag.py            # all pages
   python3 scripts/i18n-tag.py apps.zap   # one page id
   ```

   It re-tags new strings, re-extracts `i18n/<page>.en.json`, and injects
   hreflang + the runtime include into new pages. Product names from
   rocket's `DEFAULT_GLOSSARY` are skipped when they stand alone.

2. **Translation** (resume-safe; keeps valid existing translations, uses a
   cross-page translation memory at `i18n/.translation-memory.json`, and
   only sends new/changed strings):

   ```sh
   node scripts/i18n-translate.mjs                 # everything missing
   node scripts/i18n-translate.mjs apps.zap        # one page
   ```

   Requires the `claude` CLI (it shells out to
   `~/Documents/mine/Personal/Apps/_shared/rocket` → `rocket ai … --provider
   claude`). Responses are validated: HTML tag sequences and
   href/src/class/id attribute payloads must survive verbatim, otherwise the
   chunk is retried and ultimately left in English with a warning.

## Conventions

- Keys are `slug-of-first-words.sha1hash6`, derived from the English source —
  identical strings share a key within a page, and the translation memory
  dedupes across pages.
- Product names are never translated (glossary lives in both
  `scripts/i18n-tag.py` and `scripts/i18n-translate.mjs`, mirroring
  `rocket/lib/loc.mjs` `DEFAULT_GLOSSARY`).
- The obfuscated email/Signal/Haven contact buttons on index.html are
  untouched — they render icons only, and their anti-scrape logic must not
  be tagged or rewritten.
