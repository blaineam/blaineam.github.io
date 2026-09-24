# App page design

How every app's pages under `apps/<slug>/` are laid out, written and shipped. Not
linked from the site. The reference landing page is
[`apps/scripture-alone/index.html`](../apps/scripture-alone/index.html); the
reference depth page is Haven's `features/` (mirrored from Haven `web/features/`).
The depth-page skeleton is [`docs/templates/depth-page.html`](templates/depth-page.html).
When this document and those pages disagree, fix whichever is wrong.

---

## 1. The owner's brief (2026-09-23, after the first redesign pass)

The first pass made every app a single short funnel page. The owner liked the
magazine feel, and liked that Haven's feature wall is **its own page**, but:

- the funnel pages **left a lot to be desired for the powerful apps** — Enter Space
  felt too simple for its feature set;
- **prices and the comparison chart were gone**;
- the FAQ **lost the complete lists** (Enter Space's supported providers and
  types);
- the stories **left-aligned** at wide widths (copy on the left edge, device far
  right) — fixed platform-wide in `app-showcase.css` (§5.3);
- the back-to-apps icon was **Samsung-shaped**, not an iOS icon — fixed (§5.4);
- non-English visitors saw **English device renders** — a year-cached, unversioned
  `i18n.js`; fixed by `cache-bust.py` stamping scripts and stylesheets (§11).

The rule that came out of it, in his words: *"id rather use multiple pages and let
the user explore around to learn more without being overwelmed ever."*

So: **one short landing page per app (the funnel), plus depth pages the reader
can drill into.** Brevity is the landing page's rule, not the site's. Nothing is
deleted to make a page short — it moves to the page where it belongs.

---

## 2. The multi-page model

```
apps/<slug>/index.html            Overview — the funnel (§3). Short. Always.
apps/<slug>/features/index.html   Everything the app does. Cards/grids welcome.
apps/<slug>/pricing/index.html    Every price, every plan, the comparison chart.
apps/<slug>/faq/index.html        The complete FAQ. Long answers and full lists welcome.
```

An app gets only the depth pages its content warrants (§12). Other existing
subpages (`scripture-alone/security/`, `ari-helper/watermark/`) are unaffected.

### 2.1 The app's sub-nav

Every page of an app with at least one depth page uses the existing `.app-nav`
bar as an Apple-style product nav:

```
← [icon] App Name                 Overview   Features   Pricing   FAQ   [App Store]
```

- The brand (icon + name) keeps linking back to `/apps/` — that's the site's way
  home and the owner wants it.
- Links, in this order, for the pages that exist: **Overview** (`../` from a depth
  page, `./` on the landing), **Features**, **Pricing**, **FAQ** — then the store
  button (`.btn-buy`). The current page's link carries `aria-current="page"`
  (styled by `app-showcase.css`).
- Keys: `overview.0efc2e`, `features.fc338f`, `pricing.a0d9bb`, `faq.03688b` (from
  `key_for()`; `features`/`faq` already exist in most dictionaries).
- It's sticky (the `.app-nav` already is) and collapses into the ☰ menu on narrow
  screens (`app-showcase.css`/`.js` already do this). The floating App Store pill
  keeps the download one tap away on phones.
- In-page anchor links (`#features`, `#faq`) in the landing nav are replaced by the
  page links once the depth pages exist.

### 2.2 How the reader moves between pages

- A landing story whose topic has a depth page ends with a quiet
  `<a class="learn-more" href="features/#<group>">Learn more</a>` (arrow drawn by
  CSS). At most one per story.
- The landing FAQ is a **teaser** (≤ 7 questions) ending in
  `<a class="learn-more" href="faq/">See all questions</a>`.
- The trust beat on a paid app links to `pricing/` ("See plans and prices").
- Depth pages end on a closing CTA and a "Back to the overview" link.
- Never more than one click from any page of an app to any other (the sub-nav
  guarantees it).

---

## 3. The landing page — the funnel

A landing page is read top to bottom once. Every section either moves the reader
toward the download button or goes to a depth page.

| # | Section | Contains | Rules |
|---|---------|----------|-------|
| 1 | **Hero** | icon · kicker (app name) · H1 promise · one-sentence standfirst · **one** primary download button · quiet secondary text links · the hero device render | The button must be above the fold at 390×844 **and** 1440×900, in every language (check ja — CJK headlines wrap differently). Standfirst ≤ 25 words. |
| 2 | **Statement** *(optional)* | one serif sentence, centered | ≤ 25 words. The app's reason for being, not a feature. |
| 3–7 | **Stories** — 3 to 5 | eyebrow (`01` + one word) · H2 · lede · **one** device render (+ optional short caption) · optional `Learn more` into a depth page | One idea per story. One headline. ≤ 2 sentences, ≤ 40 words. Alternate copy left/right (`is-flipped`) from 900px up; stack below. |
| 8 | **Trust beat** — exactly one | H2 · ≤ 4 short badges in a single row · one sentence · optional one link (e.g. to `pricing/`) | Privacy / price / open source — whatever the objection is for this app. Not a second feature list. |
| 9 | **FAQ teaser** | ≤ 7 collapsed questions, then "See all questions →" when `faq/` exists | Answers may be as long as the question needs. Legal/availability last (§8). |
| 10 | **Closing CTA** | icon · the H1 promise again · the same download button · the same quiet links | The last thing before the footer is a download button. |
| — | Footer | generated | Never hand-edit; `scripts/update-footers.py`. |

A floating App Store pill (`.floating-appstore`) may stay on screen throughout.

Pick stories by asking "what would make someone download this?". Everything
else the app does goes on `features/`, and every question on `faq/` — not nowhere.

### 3.1 Landing-page anti-patterns (reject on sight)

These apply to the **landing page only**; depth pages are allowed grids, tables
and long lists (§4).

- **Feature card grids** — three or more sibling cards each with a heading and a
  paragraph. They belong on `features/`.
- **Bullet walls** — any list of more than 4 items in the page body (→ `features/`
  or `faq/`).
- **Paragraphs over ~40 words** outside the FAQ. (CJK: ~80 characters.)
- **More than 5 stories.** More than one render per story. A story without a render.
- Table-of-contents blocks, "What's coming" / roadmap sections, changelog
  excerpts, spec tables, **comparison tables, price tables** (→ `pricing/`),
  testimonial walls.
- **Multiple equal-weight buttons** in the hero. One primary button; the rest are
  text links.
- **Store panels as page images** (the App Store `framed/` screenshots). Pages use
  transparent device renders (§6).
- Bare screenshots and phone-inside-phone double frames.
- Cross-selling other apps in a story (a sibling-app link belongs in the FAQ).
- Anything legal, regulatory or availability-related above the FAQ.

`python3 scripts/check-app-page.py <slug>` warns on most of these.

---

## 4. Depth pages

One topic per page, as long as the topic needs, still scannable. Built from
[`docs/templates/depth-page.html`](templates/depth-page.html) and
[`apps/_shared/depth.css`](../apps/_shared/depth.css), which takes every colour
from the tokens the landing page already defines — paste the landing page's
`:root` block (light + dark) into the depth page's `<style>` and it's re-toned.

Every depth page has: the sub-nav (§2.1) with the store button · a `.dp-header`
(eyebrow = app name, H1 naming the page, a one- or two-sentence standfirst,
optional `.dp-jumps` chips to its sections) · its sections (`.dp-section`) · a
`.dp-closing` CTA (the landing H1 promise + the same download button) · the
generated footer.

### 4.1 `features/` — the catalogue

- Grouped: one `.dp-section` per group (e.g. Enter Space: *Files & Finder*,
  *Sync & backup*, *Serve*, *Photos & Theater*, *Apple TV & Watch*), each a
  `.dp-grid` of `.dp-card`s (optional emoji icon · H3 · one or two sentences ·
  optional `.dp-tag` such as "In-app purchase", "Mac only", "New in 2.0").
- Long plain lists (providers, serve types, file formats, languages) use
  `.dp-list` — multi-column, no bullets.
- Device renders are welcome but optional; same localized-render rules (§6).
- Haven's `features/` is the model the owner likes.
- IAP-gated features say "in-app purchase" in the card (App Review 2.3.2 applies to
  the store copy; keep the site consistent with it).

### 4.2 `pricing/` — prices are wanted here

- Every plan with its **actual US price** (`.dp-plans` / `.dp-plan`; mark one
  `is-featured` with a `.dp-plan-badge` if there's a genuine best value), the
  trial, Family Sharing, lifetime/one-time options, and what each unlocks.
  Say "US prices shown; the App Store shows yours" (`.dp-fine`).
- **Check current prices in App Store Connect before publishing** — pre-redesign
  pages carried introductory prices that have since expired (Enter Space's
  "ends October 1").
- The **comparison chart** vs alternatives (`.dp-table-wrap > table.dp-compare`):
  first column is `th scope="row"`, our column `class="is-us"`, ✓/— cells as
  `class="yes"`/`class="no"` with a translated `.dp-sr` "Yes"/"No" inside for
  screen readers, and a `<caption>` saying when it was compared. It scrolls inside
  its box, never the page. Compare products, never name websites.
- A short pricing FAQ (trial, cancel, family, restore purchase) is welcome at the
  end.
- Free apps (Blip, Glint, Haven, Lathe) don't get `pricing/`; their support/sponsor
  block stays where it is.

### 4.3 `faq/` — the complete FAQ

- Every question the pre-redesign page answered, plus anything the landing teaser
  dropped. **Long answers are welcome**; complete lists (Enter Space's full
  provider list and serve/sync types) go here in full, as `.dp-list` inside the
  answer or a `<ul>` in columns.
- Grouped by `.dp-faq-group` with an H2 per group (Getting started · Features ·
  Pricing & purchases · Privacy & security · Troubleshooting) once there are more
  than ~8 questions.
- The EU availability question is the **last** item on `faq/` (§8) — and stays
  last on the landing teaser too.
- The landing teaser keeps its ≤ 7 questions (the most-asked, including the
  pricing one); the rest live only here.

### 4.4 What depth pages still don't do

No walls of prose outside FAQ answers (a card is one or two sentences), no store
panels, no equal-weight button rows, no legal notes above the FAQ, no web fonts
(Revela excepted, §5.2). Every depth page ends on the download.

---

## 5. Layout, type and colour

Mobile first. Copy the reference landing page's CSS blocks (Shared type, Hero,
Chapters, Privacy, FAQ, Closing) and re-tone the tokens.

### 5.1 Tokens

Defined on `:root`, redefined in `@media (prefers-color-scheme: dark)` — **inside**
`:root` (Kern, Pinline, Ridgeshot and Tile Break once declared `--x-measure`
between the dark block's closing braces, where it never applied):

| Token | Role |
|-------|------|
| `--app-primary`, `--app-secondary`, `--app-accent` | the icon's colours; hero/privacy gradients are built from them |
| `--primary-color` | headline colour on the paper ground (AA ≥ 4.5:1 in both schemes); also depth pages' accent |
| `--<p>-paper`, `--<p>-paper-2` | page and alternate section grounds |
| `--<p>-body`, `--<p>-quiet`, `--<p>-rule` | body text, captions/secondary text, hairlines |
| `--<p>-shadow` | the `filter: drop-shadow()` under device renders (deeper in dark) |
| `--bg-primary`, `--bg-secondary`, `--bg-card`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-color` | the shared `app-showcase.css` neutrals, re-pointed at the above — **depth.css reads only these** |

Use a page prefix (`--sa-`, `--kn-`, …) for page tokens and classes so
`app-showcase.css` can't collide.

### 5.2 Type

| Element | Size | Notes |
|---------|------|-------|
| H1 (hero) | `clamp(2.6rem, 8.4vw, 6.2rem)`, lh 1.02, `max-width: 13ch` | `text-wrap: balance` |
| H1 (depth header) | `clamp(2.3rem, 6vw, 4.2rem)` | set by depth.css |
| H2 (`.x-display`) | `clamp(2.1rem, 5.2vw, 3.6rem)`, lh 1.06 | one per story |
| Lede | `clamp(1.12rem, 1.9vw, 1.36rem)`, lh 1.62 | `text-wrap: pretty` |
| Eyebrow | `0.8rem`, 600, `letter-spacing: .2em`, uppercase | a `<p>`, not a heading |
| Caption | `0.88rem`, quiet colour, hairline above | optional, ≤ 6 words |

A display face that suits the app (the reference uses the system serif stack
`ui-serif, "New York", …`); system UI sans for everything else. **No web fonts.**

**Exceptions to "no web fonts"** — granted only when the typeface *is* the app's
identity, listed here and in `WEBFONT_EXCEPTIONS` in `scripts/check-app-page.py`:

| Page | Faces | Why |
|------|-------|-----|
| `apps/revela` | Alfa Slab One, Special Elite, Pacifico (+ Inter) | Owner's call (2026-09-23): the film-box, darkroom-label look is the brand. Keep the `@import` to one request with `display=swap`. |

Mirrored pages (`apps/lathe`, …) follow their source repo and aren't checked here.

**CJK measure.** `ch` is the width of a Latin zero and a CJK glyph is two of them,
so every `max-width: …ch` on a headline or paragraph needs an `em` override for
`:lang(ja)`, `:lang(zh)`, `:lang(ko)`. Also set `word-break: auto-phrase` on
headlines.

### 5.3 Spacing, grid and the story layout contract

- Side gutter **16px** at every width; nothing may cause horizontal scroll at any
  width (`document.documentElement.scrollWidth === innerWidth`).
- Story section: `padding: clamp(4rem, 9vw, 7rem) 16px`, hairline `border-top`.
- **The story layout lives in `app-showcase.css`** ("Stories: one layout
  contract"), matched by class pattern so no page can drift: any
  `section[class*="-chapter"]` is centered at `max-width: 1120px`; from 900px its
  `[class*="-spread"]` uses **content-sized tracks centered as one group** —
  `minmax(0, 34rem) minmax(0, max-content)` with `justify-content: center`, mirrored
  for `.is-flipped` — so the copy and the device sit together in the middle at
  1440, 1920 and 2560px instead of the copy hugging the left edge. Stacked, the copy
  block centers over the device. Name new pages' classes `<p>-chapter`,
  `<p>-spread`, `<p>-copy`, `<p>-figure` and they inherit it. Pages that don't load
  `app-showcase.css` (Revela, the mirrored sites) carry the same rules inline.
- Verify at **390, 768, 1024, 1440, 1920 and 2560px**: left and right margins of
  every story equal (±16px), no horizontal scroll.
- Device render width: phone `min(72vw, 340px)`, watch `min(56vw, 240px)`,
  tablet/Mac `min(92vw, 720px)`. Hero phone `clamp(230px, 34vw, 380px)`, cropped
  by its container so it "rises" out of the hero.
- Depth pages: `.dp-section` is centered at 1120px; grids are
  `repeat(auto-fill, minmax(min(100%, 16rem), 1fr))`, so they never overflow.
- Buttons: min height 44px; on ≤ 600px the hero button goes full width (max 22rem).

### 5.4 The nav icon

`.nav-brand-icon` is masked (`--squircle` in `app-showcase.css`) to the iOS
continuous-corner shape: straight sides, a 22.37% corner radius, curvature easing
into each corner (the "corner smoothing 60%" construction). Never a plain
`border-radius` or a one-cubic-per-quarter blob (that read as a Samsung icon).
Lathe's masthead icon uses the same path.

**Motion** — at most a fade/rise on scroll (`data-reveal`), added only when
`prefers-reduced-motion: no-preference` and only once JS is running.

---

## 6. Images: localized device renders

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
  project's name doesn't follow the pattern, name it:
  `"project": "docs/appstore-screenshots/<file>.monkr"`. Scene names are the
  manifest's keys; `find_scene` also matches a unique substring.

```sh
python3 scripts/sync-app-screens.py kern          # renders, writes WebP + manifest, runs cache-bust
python3 scripts/sync-app-screens.py --list        # which repos have per-locale captures
```

Output: `apps/<slug>/assets/screens/<lang>/<scene>-<width>.webp` and
`apps/<slug>/assets/screens/manifest.json`. Depth pages reference the same files
(`../assets/screens/en/…`).

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
element stays English.

Rules: `width`/`height` = the manifest's `sizes[scene]`; `sizes` matches the CSS
width; hero render has no `loading="lazy"` and gets `fetchpriority="high"`,
everything else `loading="lazy" decoding="async"`; `alt` describes the screen, is
translated via `data-i18n-attr`, and avoids per-locale specifics; `og:image` stays
the English poster.

**Mirrored pages** (`apps/haven`, `apps/blip`, `apps/glint`, `apps/lathe`) are
rsynced from their repos and would be overwritten. Render into the source repo
(`--dest ~/Documents/mine/Personal/Apps/Blip/docs/assets/screens`) and commit there.

---

## 7. Calls to action

- **One primary button**, same label at hero and close: "Download on the App
  Store" (key `download-on-the-app.a9096a`). Mac-only / Play / direct-download apps
  use the equivalent wording for their store. Depth pages: the sub-nav's store
  button and the closing button.
- Link to `https://apps.apple.com/us/app/<name>/id<id>`;
  `target="_blank" rel="noopener noreferrer"`.
- **Official badges**: only Apple's own localized badge artwork if ever added,
  swapped per language. Until then the styled pill button is correct.
- **No store listing** (Aperion): the primary button links to its successor on
  GitHub and carries a bare `data-cta` attribute so the checker counts it.
- Secondary routes (source, beta, Android, Mac) are quiet text links under the
  button, separated by a middot.
- Paid apps: the price model is stated plainly in the trust beat or FAQ teaser on
  the landing page; the numbers live on `pricing/`. Any story or card about an
  IAP-gated feature says "with an in-app purchase".

## 8. Legal and availability notes

Per the owner: never in the hero, never bold, never animated. The EU availability
question is the **last** FAQ item on the landing teaser **and** on `faq/`; a page
without a FAQ gets a faint one-liner just above the footer. Never delete one when
moving FAQs around.

---

## 9. Copy and i18n

Every visible string is tagged and exists in all 9 languages
(`en, zh-Hans, ja, de, fr, es, ko, pt-BR, it`) with identical key sets.

- Landing page: `i18n/apps.<slug>.<lang>.json` (`data-page="apps.<slug>"`).
- **Depth page: its own dictionary** `i18n/apps.<slug>.<sub>.<lang>.json`
  (`data-page="apps.<slug>.<sub>"`), the same way Haven's `features/` has
  `features.<lang>.json`. `scripts/i18n-tag.py` picks up
  `apps/<slug>/{features,pricing,faq}/index.html` automatically (not the mirrored
  apps) and injects the `i18n.js` tag and hreflang alternates on first run.

The key is `slug-of-first-4-words.sha1[:6]` of the English, so **editing English
renames the key**; **unchanged English keeps its key — and its translations**.
Procedure for new or edited copy:

1. Edit the English in the HTML and **delete that element's `data-i18n`**.
2. `python3 scripts/update-footers.py` first (the footer's keys must be on the page
   before tagging), then `python3 scripts/i18n-tag.py apps.<slug>[.<sub>]` —
   re-derives keys and rewrites the **en** dictionary.
3. `python3 scripts/restore-i18n.py <slug>[/<sub>] --from <pre-redesign commit>`
   fills the 8 translated dictionaries from translations that already exist (the
   page's own, the landing page's, the landing page's at that commit, then any
   page's identical string). It lists what it couldn't find and leaves those keys
   out, so the checker fails until they're written by hand — never English
   placeholders.
4. Hand-write the rest in the page's register (German mostly *du*;
   Spanish/Portuguese/Italian informal). **Check each file's ordering** before
   hand-editing an existing dictionary — most are sorted, the 8 translated
   `apps.mi-speaks.*` are not; never re-sort a file that wasn't sorted.
   `restore-i18n.py` writes new depth dictionaries sorted.
5. `alt`, `title`, `aria-label` use `data-i18n-attr="alt:<key>"` with `key_for()`.
6. Product names (the glossary in `i18n-tag.py`) are never translated.
7. Never name other websites in copy, commits or comments.

Voice: short declaratives, second person, concrete nouns. Say what the reader gets,
not how it's built. On depth pages, completeness beats brevity — but each card is
still one or two sentences.

## 10. Accessibility

- One `<h1>` per page; one `<h2>` per story/section; eyebrows are `<p>`.
- Text contrast ≥ 4.5:1 (3:1 for ≥ 24px) in light **and** dark.
- Visible focus on every link/button; FAQ questions are `<button>`s.
- Decorative images `alt=""`; renders get real alt text.
- Comparison tables: `th scope`, a `caption`, and a text equivalent for every ✓/—.
- `prefers-reduced-motion` disables reveals and hover motion.
- `<html lang>` is set by `i18n.js`.

## 11. Performance and caching

- Landing first load at 390px: **≤ 400 KB**; whole landing page: **≤ 1.2 MB**.
  Depth pages: **≤ 600 KB** whole page (they're mostly text).
- Story render at 400w ≤ 70 KB, at 800w ≤ 170 KB; hero ≤ 170 KB. WebP only.
- No new JS libraries, no web fonts (Revela excepted), no video autoplay above the fold.
- **Every URL to our own image, script or stylesheet carries `?v=<sha1[:8]>`**:
  the CDN serves `.js`/`.css`/images with `max-age=31536000`, and an unversioned
  `i18n.js` kept returning visitors on a year-old script (English renders in every
  language). `scripts/cache-bust.py` stamps `src`, `href`, `srcset`, `content` and
  CSS `url()`, stylesheets before the pages that link them; the deploy workflow
  re-runs it (`--mirrored`) and the mirror workflow runs it on the mirrored sites
  after rsync. Mirrored sources: `python3 scripts/cache-bust.py
  ~/Documents/mine/Personal/Apps/Haven/web` (etc.) and commit there.

---

## 12. Per-app plan — which depth pages, restored from where

"Restore from" is the commit **before** each page's magazine redesign; its HTML
and dictionaries hold the removed copy **with its existing keys and all 8
translations**:

```sh
git show 42b76df^:apps/enter-space/index.html            # the old page
git show 42b76df^:i18n/apps.enter-space.ja.json          # its Japanese
python3 scripts/restore-i18n.py enter-space/faq --from 42b76df^
```

Restoring = copy the old markup's content into the depth page's components
**keeping each element's `data-i18n` key** (re-style it, don't reword it; if you
must reword, drop the key and translate). Verify every fact against the app as it
ships now — features, platforms, prices and limits changed since.

| App | Depth pages | Restore from | What to bring back |
|-----|-------------|--------------|--------------------|
| **Enter Space** | features · pricing · faq | `42b76df^` | features grid; pricing (Monthly/Yearly/Lifetime, trial, Family Sharing — intro prices ended Oct 1, **check ASC**); comparison chart; 14-question FAQ with the **full provider list**, serve types, sync types, Apple TV unlock, recovery |
| **Sami** | features · pricing · faq | `0ea36eb^` | features grid; comparison (the landing keeps its one compact story, `53c867b`); pricing; 15 FAQs |
| **Luma Editor** | features · pricing · faq | `3280264^` | develop/match/film features; pricing incl. the table; 12 FAQs |
| **Ari Helper** | features · pricing · faq | `21e098e^` | chat, live camera, Photo Studio, Film Studio, Luma tie-in; pricing (tiers + lifetime); 13 FAQs; `watermark/` stays as is |
| **Mi Speaks** | features · pricing · faq | `d8e7a0d^` | 12-card feature grid, what's new, Studio Voices; pricing $4.99/mo · $39.99/yr · $99.99 lifetime (`3f6f0b0`; yearly raised 2026-09-16 — **check ASC**); 9 FAQs |
| **Scripture Alone** | features · faq (+ pricing only if its IAPs warrant a page) | `e283612^` | 24-card feature grid (translations, study, Keepsake Bible, ePub, import); 10 FAQs (+ `d48194a`'s additions already on the landing); link `security/` from both |
| **SightQuick** | features · pricing · faq | `6d13ac3^` | features, how it works; prices ($1.99 / $8.99 / $29.99 — **check ASC**); 8 FAQs |
| **Pano Owl** | features · faq (+ pricing if paid) | `5399bcd^` | 10-card features, how it works; 7 FAQs |
| **Aperion** (shelved) | features · faq | `39dadb4^` | features, workflow, hardware support table, status; 11 FAQs (CTA stays `data-cta` → GitHub) |
| **Kern** | features · faq | `0278e57^` | modes, the eighteen worlds, fair play, daily; 8 FAQs |
| **Tile Break** | faq | `6687196^` | 8 FAQs (landing kept 6) |
| **Pinline** | faq | `33a1f4d^` | 8 FAQs (landing kept 7) |
| **Wise Flyer** | faq | `4ab81ae^` | 7 FAQs (landing kept 5) |
| **Embr** | faq | `c88a02b^` | 7 FAQs (landing kept 5) |
| **DeepSi** | faq | `fdbf553^` | 7 FAQs (landing kept 5) |
| **Ridgeshot** | none required (FAQ intact) — optional features | `cd7b3a6^` | 12-card grid, only if it reads as worth a page |
| **Zap** | none required (FAQ intact) — optional features | `5da7712^` | 10-card grid, optional |
| **Tri-Add** | none required (FAQ intact) — optional features | `2d81818^` | 12-card grid, optional |
| **Revela** | none | `c1fb24f^` | had no FAQ before; nothing was cut that needs a page |
| **Blip** *(mirrored: Blip/docs)* | features · faq | Blip repo `9dbff11^` | features, what's new, iOS section, the full FAQ; free — no pricing page; keep the support block |
| **Glint** *(mirrored: Glint/docs)* | faq (optional) | Glint repo `606e3cb^` | small app; only if the landing FAQ dropped questions |
| **Haven** *(mirrored: Haven/web)* | already has features/ · docs/ · relay/ — none new | Haven repo `92971d78^` | the owner is fine with Haven's drill-down depth; only align its nav labels with §2.1 |
| **Lathe** *(mirrored: blaineam/Lathe docs/, generated by `docs/build.py` from `docs/_src/`)* | documentation.html · benchmarks.html · mac.html · sami.html · **how-it-works.html** (new) | — | **Done** (Lathe `23fbc8d`): owner said "way too much copy"; the front page went from ~2,200 to ~520 words — Get started (Swift Package) + GitHub, Mac app and Sami as quiet links, the four ways in, a one-paragraph case, the interactive comparison, the benchmark teaser, the one-line install. The full argument, every module and the audibility cliff moved to `how-it-works.html`; the Sami ad stays on `sami.html`. Edit `docs/_src/`, run `docs/build.py`, commit with `[ci skip]`, trigger the mirror. |

Mirrored depth pages follow the same model in their own repos: subfolder pages
with their own dictionary (Haven: `web/features/` + `i18n/features.<lang>.json`),
cache-busted with `scripts/cache-bust.py <source dir>`, committed with `[ci skip]`
where the repo builds on push (Haven, Blip, Lathe), then
`gh workflow run mirror-app-docs.yml -R blaineam/blaineam.github.io`. A `[ci skip]`
mirror commit doesn't redeploy the site; the next real push to the site does.

---

## 13. Tooling coverage for depth pages

| Tool | Depth pages |
|------|-------------|
| `scripts/i18n-tag.py` | auto-discovers `apps/<slug>/{features,pricing,faq}/index.html` → `apps.<slug>.<sub>` |
| `scripts/restore-i18n.py` | fills translated dictionaries from existing/pre-redesign translations |
| `scripts/update-footers.py` | rewrites depth-page footers too (links one level further up); BESPOKE apps' depth pages are hand-edited like their landing pages |
| `scripts/cache-bust.py` | walks every page and stylesheet, incl. nested ones |
| `scripts/check-app-page.py <slug>/<sub>` | depth rules: dictionary parity, image attributes, a store link in the nav **and** a closing CTA; sub-nav links every sibling + overview and marks `aria-current`; `faq/` ends on the EU item; `pricing/` shows a price. No copy-budget warnings (grids and long answers are allowed). Landing pages keep the funnel rules, plus: ≤ 7 FAQ questions, and a link to `faq/` when it exists. `--all` checks every landing and depth page. |

## 14. Before you commit

```sh
cd ~/Documents/scripts/blaineam.github.io
python3 scripts/sync-app-screens.py <slug>                 # if renders changed
python3 scripts/update-footers.py                          # before tagging (footer keys)
python3 scripts/i18n-tag.py apps.<slug> apps.<slug>.<sub>  # after any copy change
python3 scripts/restore-i18n.py <slug>/<sub> --from <commit>^
python3 scripts/check-app-page.py <slug> <slug>/<sub>      # read the warnings
python3 scripts/cache-bust.py && python3 scripts/cache-bust.py --check
python3 -m http.server 8765
```

Visual check in the built-in browser at **390×844** and **1440×900** (and the
story widths in §5.3), light and dark, in **en, ja and fr** (`?lang=ja&nc=1`):

- the landing download button is visible without scrolling in all three languages;
- renders are in the page's language (`img[data-i18n-src]` → `currentSrc` contains `/screens/ja/`);
- the page references `i18n.js?v=…` (view source) — never a bare `i18n.js`;
- no horizontal scroll at any width; stories centered at 1920px;
- the sub-nav reaches every page of the app, and every depth page ends on the download;
- no landing story has more than two sentences; nothing on the landing page reads as a grid of cards.

This checkout is shared with other sessions: stage **explicit paths only**
(`git add -A` sweeps iCloud " 2" duplicates and others' work), never `git add
<dir>` in an app repo with untracked files in it, `git pull --rebase`, commit to
main, push.
