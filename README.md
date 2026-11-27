# Blaine Miller

**Senior Software Engineer** · Apple-platform Developer · Photographer · Luma's human

[![Website](https://img.shields.io/badge/Website-wemiller.com-blue?style=flat-square)](https://wemiller.com)
[![Apps](https://img.shields.io/badge/Apps-25%2B%20shipped-orange?style=flat-square)](https://wemiller.com/apps)
[![Pages](https://img.shields.io/badge/GitHub%20Pages-auto--deployed-success?style=flat-square)](https://wemiller.com)

The source for [**wemiller.com**](https://wemiller.com): one static site for the software, the
photography and the dog.

```sh
curl -sL wemiller.com/shell | sh      # the whole portfolio, in a terminal
```

---

## What a visitor gets

The home page is **one page with four ways in**. A switch in the hero changes the photograph
behind it, the headline, and which sections follow, without leaving the page:

| View | Address | What it shows |
|---|---|---|
| **Everything** | [wemiller.com](https://wemiller.com) | "I build what's missing": selected work, every project since 2012, the photographs, Luma |
| **Work** | [wemiller.com/hire](https://wemiller.com/hire) (`/?mode=hire`) | No photograph, no dog: title and summary, selected work, experience, skills, education and the [resume](https://wemiller.com/resume/) |
| **Photography** | [120.media](https://120.media) (`/?v=120`) | The full gallery first; software shrinks to one card |
| **Luma & Nova** | [luma.dog](https://luma.dog), [supernova.dog](https://www.supernova.dog) (`/?v=nova`; `/?v=luma` still works) | The pups' photographs first, and Luma's birthday countdown every October |

Whatever the view, the rest is the same page:

- **Selected work**: six featured projects. A card opens an App Store style sheet first (icon,
  tagline, store buttons, a strip of device-framed screenshots in the visitor's language, the
  description) with the app's own site one button away. Every app keeps its own sub-site under
  `/apps/<name>/` or `/tools/<name>/`, with its own design and language set.
- **Everything, in order**: every project by year. Each row opens in place for the story and the
  stack, with the same screenshot strip for apps that have one; `/#p-<id>` links straight to one.
- **Photography**: a masonry gallery with three filters (everything, landscape & sky, Luma) that
  loads more as you scroll, so there is no "show all" button. A
  photograph opens full screen with its title and caption, slides between frames with arrow
  keys and swipes, plays as a slow push-in slideshow, and can be turned into a jigsaw puzzle;
  `/#bmp-17` links straight to one.
- **Search**: press <kbd>/</kbd> or <kbd>⌘K</kbd> anywhere on the home page. It searches projects,
  every page on the site and every photograph ("owl" finds the owls).
- **Ambient sound**: the speaker in the header tunes in to [Tom](https://wemiller.com/tools/tom/),
  which composes an endless station of synthwave, lo-fi and rock in the browser. The recorded loop
  is only a fallback, for when Tom can't load or play. Hover the speaker (or tap it on a phone)
  for a vertical volume slider; the level is remembered on that device.
- **Seasons**: the hero gets a little weather by date (snow and a string of Christmas lights running a light show in December, falling leaves in
  autumn, fireflies in summer, embers in October) and a greeting on the day for New Year, Easter,
  Memorial Day, June 3, July 4, Halloween, Veterans Day and Christmas. Never in the Work view.
- **Time machine**: the footer has a time machine. Pick a destination (Christmas, July 4th, Luma's
  birthday…) or any date and the page warps there: seasons, greetings, Luma's age and her
  birthday party all behave as if it were that day, with a destination-time readout and a "Back
  to the present" button. It is all in the address, so a moment can be shared after the fact:
  `/?when=luma`, `/?when=christmas`, `/?when=2027-10-22`, `/?when=2027-10-22T21:30` (a time of
  day sets the sky too). A named day means its most recent occurrence. The page also keeps to
  what existed on that date:
  - **Into the past**, anything not yet made is gone: apps not released, jobs not started,
    photographs not taken, and the numbers in the hero, the gallery and search follow.
  - **Into the future**, the timeline shows the year arrived in and the first years after today
    as unreadable, flickering placeholders, with a note for the years skipped in between. The
    dogs change with the years (each lives about twelve, the next arrives when the current one
    is six): the Luma view takes the names of whoever is alive then, opens on a glitched
    placeholder instead of a photograph, and dogs who have gone move into a small museum,
    "The best of doggos", where each card opens that dog's photographs. Stand-in names are
    used until real ones are added (`content/site.json` → `future.dogs`).
  - **Past `future.founderFrom`** (2075), the site reads as carried on by others: a founder note
    replaces the hero and the Work view, experience and contact links are gone.
  None of this affects the present: without `?when=` the site is exactly today's.
- **VR mode** ([`/xr/`](https://wemiller.com/xr/)): the photographs, panoramas and apps arranged
  around the visitor. In a WebXR headset it is immersive, with controller rays or look-and-pinch;
  on a flat screen it is the same scene by mouse, touch or keyboard. It is the one page that
  needs WebGL (three.js, vendored in `xr/vendor/`, loaded only there), so in Lockdown Mode it
  shows links to the gallery and panoramas instead. See [`xr/README.md`](xr/README.md).
- **Say hello**: email, Haven and Signal links that do not exist in the page source until a
  person reaches for them, under the real sky for the visitor's own time and place: daylight,
  twilight, then the actual stars and moon. "Change the sky" opens controls for time, speed,
  latitude, direction, forced day or night, constellations and long-exposure star trails
  (see [`assets/sky/README.md`](assets/sky/README.md)).
- **Nine languages**: English, 简体中文, 日本語, Deutsch, Français, Español, 한국어, Português
  (Brasil) and Italiano, chosen from the browser and switchable from the globe in the header.
  That covers the home page down to experience, photograph descriptions and the labels its
  script writes, the other pages, VR mode and the terminal app.
- **Link previews**: every page of the site has its own 1200 × 630 Open Graph poster in `/og/`
  (apps have theirs under `/apps/`), drawn by [`scripts/build-og.mjs`](scripts/build-og.mjs).

Every other page (apps, tools, panoramas, books, puzzles, speed test, dotfiles, support, privacy,
terms, 404) shares the home page's colours, type, header and footer through
[`assets/shell.css`](assets/shell.css) and [`assets/shell.js`](assets/shell.js). Individual app
sites under `/apps/<name>/` keep their own brand.

Design constraints the page holds itself to:

- **Fast on a bad connection.** No framework, no web fonts, no third-party requests. The gallery
  loads 640 px thumbnails lazily behind colour placeholders; on Save-Data or 2G the hero stays on
  its small image and stops cycling.
- **Works in Safari's Lockdown Mode.** System fonts, WebP/JPEG/PNG only, a 2D canvas instead of
  WebGL. With JavaScript off the page still reads top to bottom in its default view.
- **Accessible.** Landmarks and a skip link, visible focus, keyboard paths through the switcher,
  gallery, lightbox and search, alt text on every photograph, and `prefers-reduced-motion`
  turns every animation off.
- **Light and dark** follow the system, and the half-moon button in the header overrides it (remembered on that device, and honoured by the other pages).
- **No ads, no cookies.** The only measurement is Cloudflare's cookieless analytics at the edge;
  the pages load no third-party scripts.
- **No yellow.** One blue accent (green in the photography and Luma views).

Old addresses still work: `/`, `/?v=120`, `/?v=luma` (now `/?v=nova`), `/#gallery`, `/#projects`, `/apps/…`,
`/tools/…`, `/panos/`, `/books/`, `/puzzles/`, `/speedtest/`, `/support/`, `/pay/`.

---

## Editing the site

Everything the home page says lives in four files under [`content/`](content/). Edit one, push,
and the deploy rebuilds the page. Or use the editor at [`/edit/`](https://wemiller.com/edit/): forms
with a live preview, on a phone or a laptop. It has no server. You paste a GitHub token limited to
this repository once per device, it stays in that browser, and only someone whose token can write
to the repository can save (see [`edit/README.md`](edit/README.md)). To preview first, run `node scripts/build-site.mjs`.

| To do this | Edit |
|---|---|
| Change any wording on the home page | [`content/site.json`](content/site.json) → `strings` |
| Open the site in hire mode by default | `content/site.json` → `"mode": "hire"` |
| Show the "Open to senior & principal roles" badge | `content/site.json` → `"openToWork": true` |
| Change a seasonal celebration or its dates | `content/site.json` → `seasons` (visit with `/?when=2026-12-25`) |
| Luma's birthday | `content/site.json` → `luma.born` (replay with `/?when=luma`) |
| Change the header links on every other page | [`assets/shell.js`](assets/shell.js) → `LINKS` |
| Choose the hero photographs of a view | `content/site.json` → `views.<view>.hero` |
| Choose the six featured projects | `content/site.json` → `featured` |
| Add or edit a project | [`content/projects.json`](content/projects.json), icon in `projects/` |
| Give an app without framed screenshots a preview strip | `content/projects.json` → `"gallery": ["apps/<name>/…jpg", …]` |
| Add a photograph | Drop a `.webp` into `slides/`. That is all; the highest number shows first |
| Camera and capture date for the photographs | `node scripts/photo-meta.mjs <folder of exported originals>` matches them and writes [`content/photo-meta.json`](content/photo-meta.json); or set `"camera"` / `"taken"` by hand in `content/photos.json` |
| Add a video | `content/photos.json` → `"video": "https://youtu.be/…"` on a photograph. The photo is the still; YouTube is contacted only when a visitor presses play |
| Title, caption or alt text for a photograph | [`content/photos.json`](content/photos.json) → `"title"`, `"caption"`, `"alt"` |
| Put a photograph in the 120.media or dogs' (`/?v=nova`) set | `content/photos.json` → `"tags": ["120"]`, `["luma"]` or `["nova"]` |
| Update experience, skills, education | [`content/resume.json`](content/resume.json) |
| Change the email, Signal or Haven link | `node scripts/build-site.mjs --encode 'mailto:…'`, paste into `content/site.json` → `contact` |
| Change the social bios | `content/site.json` → `bios` |

```sh
node scripts/build-site.mjs           # rebuild everything below from content/
node scripts/build-site.mjs --check   # exit 1 if anything generated is stale
```

One command writes:

| Output | What it is |
|---|---|
| `index.html` | The home page |
| `hire/index.html` | Short address for hire mode |
| `resume/index.html`, `resume/Blaine-Miller-Resume.pdf` | The resume as a page, and the same thing as a one-page PDF (no phone, no email), printed by headless Chrome only when the resume changes. The terminal app's `r` key downloads it |
| `shell` | The terminal app: full-screen, keyboard-driven panes, meters and a projects-by-year chart, drawn by `sh` + `awk` from [`scripts/tui.template.sh`](scripts/tui.template.sh). The overview carries a year of GitHub contributions (read from the public profile at build time, cached in `profiles/contributions.json`) the photography tab draws real photographs in colour blocks, `/` searches everything, and `m` tunes in to Tom Jr., a little [Tom](https://wemiller.com/tools/tom/) written in awk inside the script, which composes synthwave, lo-fi and rock as it plays (no downloads and nothing to install: the sound goes to the player the system already has, through a temporary folder it removes afterwards). It only draws and opens links |
| `assets/site.min.js`, `assets/site.min.css` | Minified copies of [`assets/site.js`](assets/site.js) and [`assets/site.css`](assets/site.css), which stay the source. The home page loads these; made with esbuild (`npm ci` in `scripts/`), and without it the page loads the sources as written |
| `og/*.jpg` | Open Graph posters for the site's own pages, drawn by `node scripts/build-og.mjs` with headless Chrome and redrawn only when a poster's recipe or photograph changes (`og/.hashes.json`). CI runs it too |
| `app-sheets.json` | What the app preview sheets show, including which screenshots exist in which language |
| `search-index.json` | Projects, pages (found by scanning every `index.html`) and photographs |
| `slides/thumbs/`, `projects/lg/` | Thumbnails and featured icons (needs `sharp`: `npm ci` in `scripts/`) |
| `i18n/index.en.json` | The English dictionary the translations are checked against |
| `profiles/bios.md` | A bio for each social profile, checked against that platform's length limit |
| `profiles/github-profile-README.md` | A README for the `blaineam/blaineam` profile repository |
| The project table below | Between the `apps:start` / `apps:end` markers |

`index.html`, `resume/`, `shell` and the other outputs are generated. Edit `content/`, the template
in [`scripts/build-site.mjs`](scripts/build-site.mjs), [`assets/site.css`](assets/site.css) or
[`assets/site.js`](assets/site.js), never the output.

### Resume

[`/resume/`](https://wemiller.com/resume/) is public, so it carries no phone number and shows the
email only on a click. For the copy you send to people:

```sh
node scripts/build-site.mjs --pdf     # → out/Blaine Miller Resume.pdf (git-ignored; needs Chrome)
```

It merges `content/resume.json` → `private` with an optional, git-ignored `content/private.json`
(`{"phone": "…"}`). The phone number never reaches the site.

**The clearance line is unlisted, not secret.** Add `?cleared` to a link you hand out
(`wemiller.com/hire?cleared`, `wemiller.com/resume/?cleared`) and the page shows the clearance
badge and the full summary. Without it they are not shown, and they are stored encoded so that
neither a search engine nor a text scraper reads them, but anyone who goes looking in the source
can decode them. Leave `private.badge` and `private.summary` out of `content/resume.json` if that
is not acceptable.

### Social profiles and the GitHub profile README

The build writes the text; publishing it is a separate, manual step.

```sh
sh scripts/sync-profiles.sh           # shows what it would change
sh scripts/sync-profiles.sh --apply   # sets the GitHub bio and pushes the profile README
```

The other platforms have no usable API for this: copy from [`profiles/bios.md`](profiles/bios.md).

### Translations

New or changed English strings are reported by the build
(`! i18n/index.de.json is missing 2 string(s): …`). Translate them with
`node scripts/i18n-translate.mjs index`; see [`docs/LOCALIZATION.md`](docs/LOCALIZATION.md).

---

## Projects

<!-- apps:start -->
| Project | What it is | Released |
|---|---|---|
| [**Afterglow**](https://wemiller.com/apps/afterglow/) | Phone VR, done properly | November 2026 |
| [**Shepherd**](https://wemiller.com/apps/shepherd/) | The guardian your home network never had | October 2026 |
| [**Tom**](https://wemiller.com/tools/tom/) | A music machine — melodies in seconds, songs like Lego | September 2026 |
| [**Scripture Alone**](https://wemiller.com/apps/scripture-alone/) | The Word, and nothing in the way | September 2026 |
| [**Lathe**](https://wemiller.com/apps/lathe/) | A free Mac downloader, and the media engine behind Sami | September 2026 |
| [**Kern**](https://wemiller.com/apps/kern/) | Handle letters with care | August 2026 |
| [**Revela**](https://wemiller.com/apps/revela/) | Shoot film. Wait for it. | July 2026 |
| [**Haven**](https://wemiller.com/apps/haven/) | A private, post-quantum social network for the people you love | June 2026 |
| [**SightQuick**](https://wemiller.com/apps/sightquick/) | Zero your scope in minutes | June 2026 |
| [**Zap**](https://wemiller.com/apps/zap/) | Electric trivia duels | June 2026 |
| [**Ridgeshot**](https://wemiller.com/apps/ridgeshot/) | Long-range rifle marksman | May 2026 |
| [**Pinline**](https://wemiller.com/apps/pinline/) | 1v1 compound-bow archery | May 2026 |
| [**Tile Break**](https://wemiller.com/apps/tilebreak/) | Match. Combo. Clear. Polished Mahjong solitaire | May 2026 |
| [**Aperion**](https://wemiller.com/apps/aperion/) | A now-shelved deep-sky astrophotography app for iPhone, iPad, Mac, and Apple Watch — it drove a Benro Polaris tracking mount and a Canon EOS body over CCAPI with a fully offline astrometry.net plate solver, plus auto-align, live stacks, a mosaic planner, motion timelapses, and an AR sky chart. | April 2026 |
| [**Blip**](https://wemiller.com/apps/blip/) | Featherlight macOS menu bar system monitor | April 2026 |
| [**Glint**](https://wemiller.com/apps/glint/) | Brightness & volume for any display | April 2026 |
| [**Monkr**](https://wemiller.com/tools/monkr/) | Beautiful device mockups in seconds | April 2026 |
| [**Dotfiles**](https://wemiller.com/dotfiles/) | I wanted a more simple easier to deploy and clean shell template to feel more at home and not feel invasive and thus the new take on my dotfiles was born as ironically a single dotfile. | March 2026 |
| [**Sami**](https://wemiller.com/apps/sami/) | Smart media optimizer | February 2026 |
| [**Enter Space**](https://wemiller.com/apps/enter-space/) | Local-feeling access to every cloud you use | June 2025 |
| [**Luma Editor**](https://wemiller.com/apps/luma-editor/) | Match your photo style | January 2025 |
| [**Embr**](https://wemiller.com/apps/embr/) | Burn your debts away | October 2024 |
| [**Ari Helper**](https://wemiller.com/apps/ari-helper/) | All-in-one AI chat app | March 2024 |
| [**Mi Speaks**](https://wemiller.com/apps/mi-speaks/) | Listen to any written content | July 2023 |
| [**DeepSi**](https://wemiller.com/apps/deepsi/) | See depth, not light | July 2023 |
| [**Pano Owl**](https://wemiller.com/apps/pano-owl/) | Stitch any panorama, in 360 | March 2021 |
| [**Tri-Add**](https://wemiller.com/apps/tri-add/) | The color mixing game | May 2014 |
| [**Wise Flyer**](https://wemiller.com/apps/wise-flyer/) | Top the leaderboard! | April 2014 |
<!-- apps:end -->

**Afterglow**, **Shepherd**, **Haven**, **Blip**, **Glint**, **Lathe**, **DeepSi**, **Zap!**,
**Scripture Alone**, **Tom** and **Monkr** are free — no ads, no tracking, no subscriptions. Their
development is funded through [GitHub Sponsors](https://github.com/sponsors/blaineam),
[Ko-fi](https://ko-fi.com/wemiller), and one-time tips; see the
[Support](https://wemiller.com/support) page. [`apps/projects.json`](apps/projects.json) stays the
source of truth for app metadata and the [`/apps`](https://wemiller.com/apps) showcase.

## Other sections

| Section | Contents |
|---------|----------|
| [360° Panoramas](https://wemiller.com/panos) | 214 interactive panoramas (Pannellum) |
| [Books](https://wemiller.com/books) | Photo journals, page by page |
| [Puzzles](https://wemiller.com/puzzles) | Interactive puzzles and brain teasers |
| [Speed Test](https://wemiller.com/speedtest) | In-browser network speed test |
| [Developer Tools](https://wemiller.com/tools/) | ARK, the app-pipeline suite behind every app here, plus Monkr and Tom, free and open source |
| [Support](https://wemiller.com/support) | Fund future development of the free apps |

---

## How it's built & deployed

A static site with **no framework**: HTML, CSS and vanilla JS on GitHub Pages. The only build is
one dependency-free Node script, and its output is committed, so the repository is always exactly
what is served.

- **[`deploy-pages.yml`](.github/workflows/deploy-pages.yml)** — on every push to `main`: runs
  `scripts/build-site.mjs`, regenerates social/poster images, re-stamps cache busters, tags store
  links, commits whatever changed and publishes.
- **[`mirror-app-docs.yml`](.github/workflows/mirror-app-docs.yml)** — mirrors each app's own docs
  site into `/apps/<slug>/` (Blip, Glint, Haven, Lathe and Shepherd), so those pages stay in sync
  with their source repos.

### Domains

GitHub Pages serves one custom domain (`wemiller.com`, in `CNAME`). `120.media` and `luma.dog`
forward to `wemiller.com/?v=120` and `wemiller.com/?v=luma` (an alias of `?v=nova`), which open
the photography and Luma & Nova views. If either hostname is ever pointed at the site directly, `content/site.json` → `domains`
already maps it to the right view.

### Store-link campaigns

Every App Store, Google Play and Microsoft Store link carries the store's own campaign
parameters, naming the page it sits on, so App Store Connect, Play Console and Partner
Center can report which page sent a visitor. Nothing is tracked on the site or in the apps;
these are plain URL parameters the stores define.

| Store | Added to the link | Example (on `/apps/enter-space/pricing/`) |
|---|---|---|
| App Store | `pt=<provider token>&ct=wm-<page>&mt=8` | `ct=wm-enter-space-pricing` |
| Google Play | `referrer=utm_source%3Dwemiller.com%26utm_medium%3Dwebsite%26utm_campaign%3D<page>` | `utm_campaign%3Denter-space-pricing` |
| Microsoft Store | `cid=wm-<page>` | `cid=wm-enter-space-pricing` |

[`scripts/store-links.py`](scripts/store-links.py) writes them, deriving the page name from
the path (`wm-home`, `wm-apps`, `wm-tools-ark`, …; shortened with a hash past Apple's
40-character limit). It covers every HTML page, the i18n dictionaries, `apps/projects.json`
and this README, and re-running it changes nothing. Both workflows run it, the mirrored app
sites included, so their source repos never carry the tags. Write bare store URLs in new
pages; the deploy tags them.

```sh
python3 scripts/store-links.py            # tag everything outside the mirrored sites
python3 scripts/store-links.py --check    # exit 1 if a link is untagged or stale
```

**Adding the App Store provider token.** Apple ignores `ct` until the link also carries
`pt`, so until the token is set the links carry `ct` and `mt` alone. The token is the number
in any campaign link that App Store Connect generates (App Analytics → Campaigns → Generate a
Campaign Link). Change one line in [`scripts/store-links.json`](scripts/store-links.json):

```json
  "appStoreProviderToken": "123456789",
```

Push it and the deploy re-tags every page, mirrored sites too, and commits the result. To see
it locally first, run `python3 scripts/store-links.py`.

### Images

The photography — the home-page gallery (`slides/`), the panoramas
(`panos/panoramas/`), the photo journals (`books/media/`) and the timeline icons
(`projects/`) — is WebP, encoded with
[Lathe](https://github.com/blaineam/Lathe)'s `lathe-image`: each picture at
the lowest quality whose result still matches the original by structural
similarity, rather than one quality for everything.

**Not AVIF.** Safari in Lockdown Mode decodes only JPEG, PNG, GIF and WebP (WebKit's
`UTIRegistry.mm`, `lockdownSupportedImageTypes`); AVIF and JPEG XL are broken images
there. The site was AVIF for a few days in October 2026 and went back for that reason.

```sh
# photographs: SSIM ≥ 0.97 overall and ≥ 0.92 in the worst 32×32 region
find slides -name '*.jpg' | lathe-image --format webp --min-ssim 0.97 --min-region-ssim 0.92 --metadata strip -
# icons for the 30 px timeline slot
lathe-image --format webp --min-ssim 0.98 --min-region-ssim 0.95 --max-side 128 --metadata strip projects/*.png
```

The panorama and book galleries build their URLs in JavaScript, so a gallery is all WebP or not
at all. The exceptions are the five panoramas wider than WebP's 16,383 px limit (`bmp-pano-2`, `-16`,
`-75`, `-85` and `-95`): the panorama page asks for those as JPEGs. `og:image`
posters, favicons and app icons stay JPEG/PNG — social crawlers and home-screen
icons don't all read WebP.

App-page screenshots are WebP too. `scripts/sync-app-screens.py` frames each locale's raw
capture through Monkr and hands the lossless render to `lathe-image` (SSIM ≥ 0.98 overall,
≥ 0.93 in the worst region, quality capped at 0.82), so a re-sync stays WebP. Put `lathe-image`
on PATH or point `LATHE_IMAGE` at it.

### Local preview

```sh
python3 -m http.server 8000     # then open http://localhost:8000
```

---

## Connect

- [YouTube](https://www.youtube.com/@AppsByBlaine)
- [Instagram](https://www.instagram.com/apps.by.blaine/)
- [X](https://x.com/apps_by_blaine)
- [LinkedIn](https://www.linkedin.com/in/millerblaine/)

---

[wemiller.com](https://wemiller.com)
