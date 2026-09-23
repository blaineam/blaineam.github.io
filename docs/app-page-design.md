# App page design

How every page under `apps/<slug>/` is laid out, written and shipped. Not linked
from the site. The reference implementation is
[`apps/scripture-alone/index.html`](../apps/scripture-alone/index.html); when this
document and that page disagree, fix whichever is wrong.

The brief, from the owner: Apple-style magazine simplicity. **No feature wall. No
wall of text.** The page is a funnel that ends in a download.

---

## 1. The funnel

A page is read top to bottom once. Every section either moves the reader toward
the download button or is cut.

| # | Section | Contains | Rules |
|---|---------|----------|-------|
| 1 | **Hero** | icon · kicker (app name) · H1 promise · one-sentence standfirst · **one** primary download button · quiet secondary text links · the hero device render | The button must be above the fold at 390×844 **and** 1440×900, in every language (check ja — CJK headlines wrap differently). Standfirst ≤ 25 words. |
| 2 | **Statement** *(optional)* | one serif sentence, centered | ≤ 25 words. The app's reason for being, not a feature. |
| 3–7 | **Stories** — 3 to 5 | eyebrow (`01` + one word) · H2 · lede · **one** device render (+ optional short caption) | One idea per story. One headline. ≤ 2 sentences, ≤ 40 words. Alternate copy left/right (`is-flipped`) from 900px up; stack below. |
| 8 | **Trust beat** — exactly one | H2 · ≤ 4 short badges in a single row · one sentence · optional one link | Privacy / price / open source — whatever the objection is for this app. Not a second feature list. |
| 9 | **FAQ** | ≤ 7 collapsed questions | Answers ≤ 60 words unless they carry instructions (install steps). Legal/availability notes go here, **last** (see §6). |
| 10 | **Closing CTA** | icon · the H1 promise again · the same download button · the same quiet links | The last thing before the footer is a download button. |
| — | Footer | generated | Never hand-edit; `scripts/update-footers.py`. |

A floating App Store pill (`.floating-appstore`) may stay on screen throughout.

Pick stories by asking "what would make someone download this?", not "what does
the app do?". Everything else the app does belongs in the App Store description,
the FAQ, or nowhere.

## 2. Anti-patterns (reject on sight)

- **Feature card grids** — three or more sibling cards each with a heading and a
  paragraph (`.feature-grid`, `.features-grid`, `.sa-details`-style ruled lists
  count too). If a feature matters, it gets a story; if not, it's cut.
- **Bullet walls** — any list of more than 4 items in the page body.
- **Paragraphs over ~40 words** anywhere outside the FAQ. (CJK: ~80 characters.)
- **More than 5 stories.** More than one render per story. A story without a render.
- **Table-of-contents blocks**, "What's coming" / roadmap sections, changelog
  excerpts, spec tables, comparison tables, testimonials walls.
- **Multiple equal-weight buttons** in the hero ("Download" + "GitHub" + "Beta" as
  three pills). One primary button; the rest are text links.
- **Store panels as page images** — the App Store `framed/` screenshots with their
  gradient and baked-in headline. Pages use transparent device renders (§4).
- **Bare screenshots** (a rectangle of UI with no device) and phone-inside-phone
  double frames.
- **Cross-selling other apps in a story.** A link to a sibling app belongs in the FAQ.
- Anything legal, regulatory or availability-related above the FAQ.

`python3 scripts/check-app-page.py <slug>` warns on most of these.

## 3. Layout, type and colour

Mobile first. Everything below is what the reference page uses; copy its CSS
blocks (Shared type, Hero, Chapters, Privacy, FAQ, Closing) and re-tone the tokens.

**Tokens** — defined on `:root`, redefined in `@media (prefers-color-scheme: dark)`:

| Token | Role |
|-------|------|
| `--app-primary`, `--app-secondary`, `--app-accent` | the icon's colours; hero/privacy gradients are built from them |
| `--primary-color` | headline colour on the paper ground (AA ≥ 4.5:1 in both schemes) |
| `--<p>-paper`, `--<p>-paper-2` | page and alternate section grounds |
| `--<p>-body`, `--<p>-quiet`, `--<p>-rule` | body text, captions/secondary text, hairlines |
| `--<p>-shadow` | the `filter: drop-shadow()` under device renders (deeper in dark) |
| `--bg-primary`, `--text-primary`, … | the shared `app-showcase.css` neutrals, re-pointed at the above |

Use a page prefix (`--sa-`, `--kn-`, …) for page tokens and classes so
`app-showcase.css` can't collide.

**Type**

| Element | Size | Notes |
|---------|------|-------|
| H1 (hero) | `clamp(2.6rem, 8.4vw, 6.2rem)`, lh 1.02, `max-width: 13ch` | `text-wrap: balance` |
| H2 (`.x-display`) | `clamp(2.1rem, 5.2vw, 3.6rem)`, lh 1.06 | one per story |
| Lede | `clamp(1.12rem, 1.9vw, 1.36rem)`, lh 1.62 | `text-wrap: pretty` |
| Eyebrow | `0.8rem`, 600, `letter-spacing: .2em`, uppercase | a `<p>`, not a heading |
| Caption | `0.88rem`, quiet colour, hairline above | optional, ≤ 6 words |

A display face that suits the app (the reference uses the system serif stack
`ui-serif, "New York", …`); system UI sans for everything else. **No web fonts.**

**CJK measure.** `ch` is the width of a Latin zero and a CJK glyph is two of them,
so every `max-width: …ch` on a headline or paragraph needs an `em` override for
`:lang(ja)`, `:lang(zh)`, `:lang(ko)` (see the end of the reference page's
stylesheet). Also set `word-break: auto-phrase` on headlines. Without it the
Japanese hero headline ran to four lines and pushed the button below the fold.

**Spacing and grid**

- Side gutter **16px** at every width; nothing may cause horizontal scroll at 390px
  (`document.documentElement.scrollWidth === innerWidth`).
- Story section: `padding: clamp(4rem, 9vw, 7rem) 16px`, hairline `border-top`,
  content `max-width: 1120px`.
- Story spread: single column; from 900px `grid-template-columns: minmax(0,5fr) minmax(0,6fr)`,
  `gap: clamp(2.5rem, 6vw, 5rem)`, `align-items: center`, copy `max-width: 34rem`.
- Device render width: phone `min(72vw, 340px)`, watch `min(56vw, 240px)`,
  tablet/Mac `min(92vw, 720px)`. Hero phone `clamp(230px, 34vw, 380px)`, cropped
  by its container so it "rises" out of the hero.
- Buttons: min height 44px; on ≤600px the hero button goes full width (max 22rem).

**Motion** — at most a fade/rise on scroll (`data-reveal`), added only when
`prefers-reduced-motion: no-preference` and only once JS is running, so nothing
can stay invisible.

## 4. Images: localized device renders

Every story render is a transparent Monkr device frame, in the reader's language.

**Producing them** — `scripts/sync-app-screens.py`, configured per page in
`scripts/app-screens.json`:

```json
"kern": {
  "repo": "Kern",
  "renders": [
    { "device": "iphone", "captures": "screenshots/iphone-6.9",
      "scenes": ["01-wheel", "03-chain"], "widths": [400, 800] }
  ]
}
```

- `repo` is relative to `~/Documents/mine/Personal/Apps` (use the inner dir for
  nested repos, e.g. `"Mi Speaks/Mi Speaks"`).
- `captures` holds the **raw** captures: English at its root, ASC-locale subdirs
  (`ja`, `de-DE`, `fr-FR`, `es-ES`, `ko`, `pt-BR`, `it`, `zh-Hans`) beside it.
  Never the `framed/` dirs (store panels) and never images already on a page.
- `device` picks the app's `*-web-<device>.monkr`, or derives a transparent,
  caption-free one from `*-<device>.monkr`. Add `"scale": 2` for small canvases
  (the watch). Widths are the 1x and 2x of the CSS display width. When the
  project's name doesn't follow the pattern (`Ridgeshot-iPhone.monkr`; the glob is
  case-sensitive), name it: `"project": "docs/appstore-screenshots/<file>.monkr"` — it
  gets the same transparent, caption-free treatment. Scene names are the manifest's keys,
  so one scene can't come from two devices; `find_scene` also matches a unique substring,
  so an iPad render of `02-gameplay-olympic` can be listed as `"gameplay-olympic"`.

```sh
python3 scripts/sync-app-screens.py kern          # renders, writes WebP + manifest, runs cache-bust
python3 scripts/sync-app-screens.py --list        # which repos have per-locale captures
```

Output: `apps/<slug>/assets/screens/<lang>/<scene>-<width>.webp` and
`apps/<slug>/assets/screens/manifest.json` (file → content hash; scene → pixel
size). Re-running is cheap and only renders what changed; when an app's localized
screenshot sweep lands, re-run and commit — the new locales appear with no HTML
change. Delete the page's old `assets/images/frame-*.png` / `feature-*.png` once
nothing references them.

**Using them** — bake the English files into the HTML and mark the element with a
bare `data-i18n-src`:

```html
<figure class="x-figure" data-reveal>
  <img src="assets/screens/en/03-study-800.webp"
       srcset="assets/screens/en/03-study-400.webp 400w, assets/screens/en/03-study-800.webp 800w"
       sizes="(max-width: 472px) 72vw, 340px"
       width="800" height="1655" loading="lazy" decoding="async" data-i18n-src
       alt="The Study panel with cross-references and commentary for the selected verse"
       data-i18n-attr="alt:the-study-panel-with.408165">
  <figcaption data-i18n="…">Cross-references and commentary</figcaption>
</figure>
```

`i18n/i18n.js` swaps every `/screens/en/` URL in `src` and `srcset` to the active
language when the manifest lists **all** of them for that language; otherwise the
element stays English. No 404 probing; the manifest's hash becomes the `?v=` stamp.
`<picture><source data-i18n-src srcset=…>` works the same way.

Rules:
- `width`/`height` = the manifest's `sizes[scene]` (prevents layout shift).
- `sizes` must match the CSS width (the expressions above); a wrong `sizes`
  downloads the 800px file on a phone for no reason.
- Hero render: no `loading="lazy"`, add `fetchpriority="high"`. Everything else:
  `loading="lazy" decoding="async"`.
- `alt` describes what the screen shows, is translated via `data-i18n-attr`, and
  avoids naming things that change per locale (the Bible translation, sample names).
- `og:image` stays the English poster (`assets/images/poster.jpg`); never localize it.
- Run `python3 scripts/cache-bust.py apps/<slug>` after any image change (it now
  stamps `srcset` too). `sync-app-screens.py` does this for you.

**Mirrored pages** (`apps/haven`, `apps/blip`, `apps/glint`, `apps/lathe`) are
rsynced from their repos and would be overwritten. Render into the source repo and
commit there:

```sh
python3 scripts/sync-app-screens.py blip --dest ~/Documents/mine/Personal/Apps/Blip/docs/assets/screens
```

(add the page to `app-screens.json` first), reference `/i18n/i18n.js` absolutely,
and let the mirror carry it over.

## 5. Calls to action

- **One primary button**, same label at hero and close: “Download on the App
  Store” (reuse the key `download-on-the-app.a9096a` and its translations from
  `i18n/apps.scripture-alone.*.json`). Mac-only / Play / direct-download apps use
  the equivalent wording for their store.
- Link to `https://apps.apple.com/us/app/<name>/id<id>` (Apple redirects to the
  visitor's storefront); `target="_blank" rel="noopener noreferrer"`.
- **Official badges**: none are in the repo yet. If added, use Apple's own
  localized badge artwork only (never redraw it), one SVG per language under
  `apps/_shared/badges/app-store/<lang>.svg`, swapped per language the same way.
  Until then the styled pill button is correct.
- Secondary routes (source code, beta, Android, Mac) are **quiet text links** under
  the button (`.sa-alt-links`), separated by a middot.
- Paid apps: say the price model plainly in the trust beat or FAQ; any story about
  an IAP-gated feature says so in its sentence ("… with an in-app purchase").

## 6. Legal and availability notes

Per the owner: never in the hero, never bold, never animated. The EU availability
question is the **last** FAQ item on every page that has a FAQ; a page without a
FAQ gets a faint one-liner just above the footer. Don't delete an existing one when
trimming the FAQ.

## 7. Copy and i18n

Every visible string is tagged and exists in all 9 dictionaries
(`i18n/apps.<slug>.{en,zh-Hans,ja,de,fr,es,ko,pt-BR,it}.json`) with identical key
sets. The key is `slug-of-first-4-words.sha1[:6]` of the English, so **editing
English renames the key**. Procedure:

1. Edit the English in the HTML and **delete that element's `data-i18n`** (or
   `data-i18n-html`). For removed sections, just delete the markup.
2. `python3 scripts/i18n-tag.py apps.<slug>` — re-derives keys and rewrites the
   **en** dictionary (removed keys drop out of it).
3. Hand-patch the 8 translated dictionaries: add the new keys, delete the ones en
   no longer has. **Check each file's ordering first** — most are fully sorted, but
   e.g. the 8 translated `apps.mi-speaks.*` dicts are not. Rename keys **in place**,
   then confirm `json.dumps(d, ensure_ascii=False, indent=2) + "\n"` reproduces the
   file's bytes apart from your edits. Never re-sort a file that wasn't sorted.
4. Reuse existing translations: a shortened sentence is usually a subset of the
   old one, so splice from the current translation in the page's own register
   (German pages mostly use *du*; Spanish/Portuguese/Italian informal). All 12
   non-mirrored app pages share one register per language.
5. `alt`, `title`, `aria-label` use `data-i18n-attr="alt:<key>"`; compute the key
   with `key_for()` from `scripts/i18n-tag.py` (the tagger doesn't create attr keys).
6. Product names (the glossary in `i18n-tag.py`) are never translated.
7. Never name other websites in copy, commits or comments.

Voice: short declaratives, second person, concrete nouns. Say what the reader gets,
not how it's built. Cut adjectives before cutting facts.

## 8. Accessibility

- One `<h1>`; one `<h2>` per story/section; eyebrows are `<p>`.
- Text contrast ≥ 4.5:1 (3:1 for ≥ 24px) in light **and** dark; check quiet text
  and text on the gradient hero.
- Visible focus on every link/button; FAQ questions are `<button>`s.
- Decorative images `alt=""`; renders get real alt text.
- `prefers-reduced-motion` disables reveals and hover lifts.
- `<html lang>` is set by `i18n.js`; don't hard-code another language in markup.

## 9. Performance budget

- First load at 390px (HTML + CSS + JS + above-the-fold images): **≤ 400 KB**;
  whole page scrolled to the end: **≤ 1.2 MB**.
- Story render at 400w ≤ 70 KB, at 800w ≤ 170 KB (WebP q82 lands there for phone frames; the reference page is 20–65 KB and 50–160 KB); hero ≤ 170 KB.
- No new JS libraries, no web fonts, no video autoplay above the fold.
- Repo: WebP only for renders; no multi-MB PNGs committed.

## 10. Before you commit

```sh
cd ~/Documents/scripts/blaineam.github.io
python3 scripts/sync-app-screens.py <slug>          # if renders changed
python3 scripts/i18n-tag.py apps.<slug>             # after any copy change
python3 scripts/check-app-page.py <slug>            # parity, img attrs, CTAs; read the warnings
python3 scripts/update-footers.py --check           # exit 1 = drift → run without --check
python3 scripts/cache-bust.py --check               # exit 1 = stale stamps → run without --check
python3 -m http.server 8765                         # then look at it:
```

Visual check in the built-in browser (or any browser) at **390×844** and
**1440×900**, light and dark, in **en, ja and fr** (`?lang=ja`; add a throwaway
query like `&nc=1` to defeat the browser's cache of `i18n.js`/HTML):

- the download button is visible without scrolling in all three languages;
- the renders are in the page's language (`document.querySelectorAll('img[data-i18n-src]')`
  → `currentSrc` contains `/screens/ja/`);
- no horizontal scroll at 390px;
- no story has more than two sentences; nothing reads as a grid of cards.

Then stage **explicit paths only** (`git add -A` sweeps iCloud " 2" duplicates and
`.claude/settings.local.json`), `git pull --rebase`, commit to main, push.
