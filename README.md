# Blaine Miller

**Software Engineer** · Apple-platform Developer · Photographer

[![Website](https://img.shields.io/badge/Website-wemiller.com-blue?style=flat-square)](https://wemiller.com)
[![Apps](https://img.shields.io/badge/Apps-18%20on%20the%20App%20Store-orange?style=flat-square)](https://wemiller.com/apps)
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

**18 apps on the App Store**, spanning iOS, iPadOS, macOS, tvOS, and watchOS. The
[`/apps`](https://wemiller.com/apps) showcase renders a curated order; the home page
lists them chronologically. Both read from a single source of truth,
[`apps/projects.json`](apps/projects.json).

| App | What it does | Released |
|-----|--------------|----------|
| **SightQuick** | Zero your rifle scope in minutes | 2026-06 |
| **Pano Owl** | Stitch any panorama, in 360° | 2026-06 |
| **Tri-Add** | The color-mixing game — a 2014 classic, relaunched | 2026-06 |
| **Zap** | Electric trivia duels | 2026-06 |
| **Ridgeshot** | Long-range rifle marksman | 2026-05 |
| **Aperion** | Deep-sky astrophotography, all in one | 2026-04 |
| **Pinline** | 1v1 compound-bow archery | 2026-03 |
| **Tilebreak** | Match. Combo. Clear. Polished Mahjong solitaire | 2026-02 |
| **Blip** | Featherlight macOS menu-bar system monitor | 2026-01 |
| **Sami** | Smart media optimizer | 2025-12 |
| **Glint** | Brightness & volume for any display | 2025-11 |
| **Luma Editor** | Match your photo style | 2025-10 |
| **Embr** | Burn your debts away | 2025-09 |
| **Enter Space** | Local-feeling access to every cloud you use | 2025-08 |
| **Ari Helper** | All-in-one AI chat app | 2025-07 |
| **Mi Speaks** | Listen to any written content | 2025-06 |
| **DeepSi** | See depth, not light | 2025-05 |
| **Wise Flyer** | Top the leaderboard! | 2025-04 |

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

---

## How it's built & deployed

A static site with **no build framework** — just HTML, CSS, and vanilla JS — deployed
to GitHub Pages via two GitHub Actions workflows:

- **[`deploy-pages.yml`](.github/workflows/deploy-pages.yml)** — on every push to `main`,
  regenerates social/poster images ([`scripts/generate-posters.js`](scripts/generate-posters.js)),
  runs footer maintenance, and publishes the site.
- **[`mirror-app-docs.yml`](.github/workflows/mirror-app-docs.yml)** — automatically mirrors
  each app's own docs site into `/apps/<slug>/`, so app pages stay in sync from their
  source repos with no manual copying.

`apps/projects.json` is the single source of truth for app metadata; the home page and
the `/apps` showcase both render from it.

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
