# Blaine Miller

**Software Engineer** · Apple-platform Developer · Photographer

[![Website](https://img.shields.io/badge/Website-wemiller.com-blue?style=flat-square)](https://wemiller.com)
[![Apps](https://img.shields.io/badge/Apps-20%20on%20the%20App%20Store-orange?style=flat-square)](https://wemiller.com/apps)
[![Pages](https://img.shields.io/badge/GitHub%20Pages-auto--deployed-success?style=flat-square)](https://wemiller.com)

The source for [**wemiller.com**](https://wemiller.com) — a static portfolio hosted on
GitHub Pages covering my apps, photography, panoramas, books, and more.

---

## About

I enjoy finding unique solutions with tech, and photographing the world around me.
Most of my work lives across the Apple ecosystem — iPhone, iPad, Mac, Apple TV, and
Apple Watch. Just imagine what we can build together!

---

## Apps

**20 apps on the App Store**, spanning iOS, iPadOS, macOS, tvOS, and watchOS — plus
**Lathe**, an open-source media engine and free Mac app distributed on GitHub, and two
free web apps, **Tom** and **Monkr**, that run entirely in your browser. The
[`/apps`](https://wemiller.com/apps) showcase renders a curated order; the home page
lists them chronologically. [`apps/projects.json`](apps/projects.json) is the
source of truth for app metadata; the showcase's display order is hand-curated.

**Haven**, **Blip**, **Glint**, **Lathe**, **DeepSi**, **Zap!**, **Scripture Alone**, **Tom** and **Monkr** are free — no ads, no tracking, no subscriptions. Their development is funded through
[GitHub Sponsors](https://github.com/sponsors/blaineam), [Ko-fi](https://ko-fi.com/wemiller),
and one-time tips; see the [Support](https://wemiller.com/support) page.

| App | What it does | Released |
|-----|--------------|----------|
| **Tom** | A music machine — dial in a melody in seconds or snap a whole song together like Lego; seeded, royalty-free, web + CLI ([wemiller.com/tools/tom](https://wemiller.com/tools/tom/), [source](https://github.com/blaineam/Tom)) | September 2026 |
| **Scripture Alone** | A free, private, offline Bible for iPhone, iPad, Mac and Apple Watch — open source (AGPL-3.0); share links rebuild verse cards in the browser | On the [App Store](https://apps.apple.com/us/app/scripture-alone-bible/id6813729762?pt=118981620&ct=wm-readme&mt=8) and [Google Play](https://play.google.com/store/apps/details?id=com.blainemiller.scripturealone&referrer=utm_source%3Dwemiller.com%26utm_medium%3Dwebsite%26utm_campaign%3Dreadme) |
| **Lathe** | Open-source media engine behind Sami, and a free Mac downloader (not on the App Store; [download](https://github.com/blaineam/Lathe/releases/latest)) | September 2026 |
| **Kern** | Handle letters with care — word puzzles in living worlds | August 2026 |
| **Revela** | Shoot film. Wait for it — a vintage film camera | July 2026 |
| **Haven** | A private, post-quantum social network for the people you love | July 2026 |
| **SightQuick** | Zero your rifle scope in minutes | June 2026 |
| **Zap** | Electric trivia duels | June 2026 |
| **Tri-Add** | The color-mixing game — a 2014 classic, relaunched | June 2026 |
| **Ridgeshot** | Long-range rifle marksman | May 2026 |
| **Pinline** | 1v1 compound-bow archery | May 2026 |
| **Tilebreak** | Match. Combo. Clear. Polished Mahjong solitaire | May 2026 |
| **Blip** | Featherlight system monitor for Mac & iPhone | April 2026 |
| **Glint** | Brightness & volume for any display | April 2026 |
| **Monkr** | Beautiful device mockups in seconds, in your browser — the framing behind every App Store screenshot here ([wemiller.com/tools/monkr](https://wemiller.com/tools/monkr/), [source](https://github.com/blaineam/Monkr)) | April 2026 |
| **Sami** | Smart media optimizer | February 2026 |
| **Enter Space** | Local-feeling access to every cloud you use | June 2025 |
| **Luma Editor** | Match your photo style | January 2025 |
| **Embr** | Burn your debts away | October 2024 |
| **Ari Helper** | All-in-one AI chat app | March 2024 |
| **Mi Speaks** | Listen to any written content | July 2023 |
| **DeepSi** | See depth, not light | July 2023 |
| **Pano Owl** | Stitch any panorama, in 360° | March 2021 |
| **Wise Flyer** | Top the leaderboard! | April 2014 |

App Store screenshots are produced by a shared, automated pipeline (simulator
capture → device-framed renders → App Store Connect upload), so every listing
shares a consistent look.

---

## Other sections

| Section | Contents |
|---------|----------|
| [Photography](https://wemiller.com/#gallery) | 162-image gallery with category filters (FancyBox) |
| [360° Panoramas](https://wemiller.com/panos) | 214 interactive panoramas (Pannellum) |
| [Books](https://wemiller.com/books) | A digital bookshelf (~170 pages) |
| [Puzzles](https://wemiller.com/puzzles) | Interactive puzzles and brain teasers |
| [Speed Test](https://wemiller.com/speedtest) | In-browser network speed test |
| [Pay](https://wemiller.com/pay) | Simple payment / tip page |
| [Developer Tools](https://wemiller.com/tools/) | ARK, the app-pipeline suite behind every app here, plus Monkr and Tom, free and open source |
| [Support](https://wemiller.com/support) | Fund future development of the free apps (Haven, Blip, Glint, Lathe, DeepSi, Zap!, Scripture Alone, Tom, Monkr) via GitHub Sponsors, Ko-fi, or a one-time tip |

---

## How it's built & deployed

A static site with **no build framework** — just HTML, CSS, and vanilla JS — deployed
to GitHub Pages via two GitHub Actions workflows:

- **[`deploy-pages.yml`](.github/workflows/deploy-pages.yml)** — on every push to `main`,
  regenerates social/poster images ([`scripts/generate-posters.js`](scripts/generate-posters.js)),
  runs footer maintenance, and publishes the site.
- **[`mirror-app-docs.yml`](.github/workflows/mirror-app-docs.yml)** — automatically mirrors
  each app's own docs site into `/apps/<slug>/` (Blip, Glint, Haven and Lathe), so
  app pages stay in sync from their source repos with no manual copying.

`apps/projects.json` is the single source of truth for app metadata; the `/apps`
showcase and home-page timeline are hand-curated views kept in step with it.

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

The photography — the home-page slideshow (`slides/`), the panoramas
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

The galleries build their URLs in JavaScript, so a gallery is all WebP or not at all. The
exceptions are the five panoramas wider than WebP's 16,383 px limit (`bmp-pano-2`, `-16`,
`-75`, `-85` and `-95`): the panorama page asks for those as JPEGs. `og:image`
posters, favicons and app icons stay JPEG/PNG — social crawlers and home-screen
icons don't all read WebP.

App-page screenshots are WebP too. `scripts/sync-app-screens.py` frames each locale's raw
capture through Monkr and hands the lossless render to `lathe-image` (SSIM ≥ 0.98 overall,
≥ 0.93 in the worst region, quality capped at 0.82), so a re-sync stays WebP. Put `lathe-image`
on PATH or point `LATHE_IMAGE` at it.

### Local preview

```sh
# any static server works, e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Tech stack

- Static HTML / CSS / vanilla JS — hosted on GitHub Pages (`wemiller.com`)
- Responsive glassmorphic design with light/dark mode
- [Pannellum](https://pannellum.org) for 360° panorama viewing
- [FancyBox](https://fancyapps.com/fancybox/) for media galleries
- Custom CSS animations and a generated poster pipeline
- GitHub Actions for build, poster generation, doc-mirroring, and deploy

---

## Connect

- [YouTube](https://www.youtube.com/@AppsByBlaine)
- [Instagram](https://www.instagram.com/apps.by.blaine/)
- [X](https://x.com/apps_by_blaine)

---

[wemiller.com](https://wemiller.com)
