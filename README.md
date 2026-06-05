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
| **SightQuick** | Zero your rifle scope in minutes | June 2026 |
| **Zap** | Electric trivia duels | June 2026 |
| **Tri-Add** | The color-mixing game — a 2014 classic, relaunched | June 2026 |
| **Ridgeshot** | Long-range rifle marksman | May 2026 |
| **Pinline** | 1v1 compound-bow archery | May 2026 |
| **Tilebreak** | Match. Combo. Clear. Polished Mahjong solitaire | May 2026 |
| **Aperion** | Deep-sky astrophotography, all in one | April 2026 |
| **Blip** | Featherlight macOS menu-bar system monitor | April 2026 |
| **Glint** | Brightness & volume for any display | April 2026 |
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
