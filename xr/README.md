# /xr/ — the portfolio as a space

Tonight's real sky, with one thing in front of you at a time. It opens on a small overview (four
tiles); choosing one opens that area (**Gallery**, **Panoramas**, **Apps**, **Experience**) in the
same place; choosing an item opens it in the same place again. **Sky only** hides all of it and
leaves a planetarium. In a WebXR headset it is immersive (`immersive-vr`); everywhere else it is the
same thing on a flat screen, driven by mouse, touch, device motion or keyboard. No build step, no
third-party requests.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Document shell: top bar with the link home, intro card, the `?enter=1` card, the canvas, the flat-screen HUD, the per-item button list, the no-WebGL message, `<noscript>`. |
| `xr.css` | Shell and HUD styles. Always dark; own tokens (same values as `assets/shell.css`). |
| `main.js` | Boot. Tests for a WebGL2 context first; only then `import('./app.js')`. Otherwise shows the fallback card. |
| `app.js` | The scene: data loading, the overview, the four areas, the detail views, sky-only mode, flat-screen input, the DOM HUD, deep links. `start(opts)` can also run embedded (see `offer.js`). |
| `experience.js` | The Experience area (timeline, job panels, project icons, skills constellation). |
| `xr-input.js` | Everything inside a WebXR session: hands, controllers, transient-pointer, gaze dwell. |
| `sky.js` | The sky as a replaceable component, drawn from `/assets/sky/sky.js`. |
| `i18n.js` | Languages: picks the language as the site does, holds the English strings, `tr()`, and fills in `data-i18n` markup. |
| `i18n/<lang>.json` | The other eight languages (zh-Hans, ja, de, fr, es, ko, pt-BR, it), same keys as the English in `i18n.js`. |
| `time.js` | The calendar: the time machine's date, the seasons, the dogs of a year. The home page's rules, no drawing. |
| `seasons.js` | Seasonal effects in the air round the visitor (snow, leaves, fireflies, embers, petals, stars, confetti, fireworks, Christmas lights). |
| `panels.js` | The search panel (with its keyboard) and the time machine panel. |
| `compass.js` | Which way is north, from device orientation events where the device has a compass. |
| `music.js` | Ambient music toggle: Tom live, `/loop.mp3` as fallback (same logic as the home page). |
| `ui.js` | Shared drawing helpers: textures, canvas text, rounded shapes, in-world buttons and tiles. |
| `offer.js` | **For the home page**: docks its `#xr-offer` banner at the bottom and starts VR on the first tap. See "One tap from the home page". |
| `vendor/three-0.170.0.module.min.js` | three.js r170, unmodified from npm `three@0.170.0` (sha256 `08fd7545…c39e7`). Loaded only by this page (and by `offer.js` once the banner is on screen). |
| `vendor/three-LICENSE.txt` | Its MIT licence. |

## Data it reads (nothing is copied)

- `/slides/thumbs/manifest.json`, `/content/photos.json` → Gallery (thumbnail on the wall, `/slides/<file>` when opened; tags `120` and `luma` for the two sets).
- Panoramas follow `/panos/index.html`: 8 full spheres `bmp-pano-sphere-<n>.webp` and 99 wide panoramas `bmp-pano-<n>.webp` (JPEG for 2, 16, 75, 85, 95). **The counts and the JPEG list are constants at the top of `app.js` (`SPHERES`, `STRIPS`, `JPEG_PANOS`), as they are hard-coded in `/panos/index.html`. Change both when panoramas are added.**
- `/app-sheets.json` → Apps (`t`, `g`, `d`, `u`, `i`, first three `shots`). A shot is either `{ src }` (a ready path, e.g. Afterglow and Shepherd) or `{ n, a, b }` under the app's `base` folder. The **larger** file is used (`<base>en/<n>-<b>.webp`, 800 px wide for phones, 440 px for watches): the 400 px one looked blocky from close up. An app with no shots shows no screenshot slots.
- `/content/resume.json` (`experience`, `education`, `skills`) and `/content/projects.json` (`id`, `title`, `date`, `dateLabel`, `tagline`, `icon`, `description`, `stack`) → Experience. `resume.private` is never read.
- `/content/site.json` (`seasons`, `luma`, `future`) → the calendar; `/content/photo-meta.json` (`taken`) → when each photograph was taken; `/search-index.json` → search.
- `/assets/sky/sky.js` and its `stars.json` → the sky (see below).
- `/tools/tom/app/radio.js` and `/loop.mp3` → music, only after the visitor turns it on.

If a JSON file fails to load, that area says so and the others still work.

## How it is laid out

- **One thing at a time.** `state.view` is `home` (the overview), `area`, or an open item (`photo`, `pano`, `app`, `text`); `state.at` is the area in use (-1 on the overview). Only what belongs to that view is visible and selectable. Everything opens straight ahead, 2 m away (1.5 m for app and text panels), so nothing is ever off to one side or behind you.
- **Nothing moves the world.** In a headset the content is anchored once, in front of the visitor at their own eye height, facing the way they were facing when the session began. Looking round, turning the body, walking, pinching and dragging do not move it. It is re-anchored only if the headset itself is re-centred (the reference space's `reset` event). The deliberate exceptions are the Move handle on the bar (below) and a controller thumbstick, which snap-turns 30°.
- **Sky only** (`setHidden`): hides the content and the floor rings. Its controls are Show portfolio, Constellations (figures, names of constellations, bright stars and planets, compass points) and Time-lapse (the button steps through 10 minutes, 1 hour and 4 hours of sky a second, then off, which returns to now) and Star trails (a long exposure: every star brighter than magnitude 4.6 draws an arc round the celestial pole that grows as the time-lapse runs, up to four hours of sky; turning it on starts the time-lapse). Both belong to the sky, not to Sky only: they keep running when the portfolio is brought back, but the sky then never turns faster than 10 minutes a second, and picks its chosen speed up again in Sky only. The trails are geometry in the star frame, bent in the vertex shader, so they cost one draw call and work the same in a headset.
- **Wall areas** (Gallery, Panoramas, Apps): 12 cards per page (4 × 3). Each keeps its own page.
- **Experience**: a year rail (years with many projects are wider); each job and the degree is a panel tethered to its span on the rail; every project is an icon under its year; skills are a constellation chart overhead. Selecting a panel or the chart opens a large text panel that shows **one point per page**. Selecting a project icon opens the app sheet if the project has one, otherwise a short text panel.
- **Photo viewer**: a centred slideshow, like the home page's, with its caption under the picture and clear of the control bar. Prev/next change the picture in place (the old one stays until the next has something to show); Play advances every 5 s and waits for each full image before swapping; "▶ Slideshow" in the Gallery starts it from the page on show. Left/right arrows and Space work as on the home page. Full images are downscaled above 4096 px (2048 px on phones and headsets).
- **Panorama**: full spheres on a sphere, wide panoramas on a cylinder arc derived from the aspect ratio. Tiled to the GPU's texture limit and a pixel budget (36 MP desktop, 14 MP phone/headset). One in memory at a time. **Head-locked**: re-centred on the head every XR frame, so leaning or walking does not distort it.
- **Overview**: four picture tiles (photographs; a sphere and a strip panorama; a shelf of app icons; a miniature of the timeline) and an "Or just look at the sky" button.
- **App**: text panel, previews, "Open site" (ends the XR session, then navigates). Device renders (phones, watches) are drawn with their own transparency, so there is no box or black corner round them, and they float about 16 cm in front of the panel, fanned toward the visitor. Nothing is drawn for a preview until its image has loaded. Plain wide screenshots (Afterglow, Shepherd) stack in a column with rounded corners.
- **Rounded shapes**: cards, panels, screenshots and the photo viewer are rounded rectangles (`ui.roundedGeo`); app and project icons use the app-icon radius (22.5% of the side).
- **Flat screen**: DOM HUD. Rendering is on demand and stops while the tab is hidden; it runs continuously only in Sky only (for the twinkle) and during a time-lapse. `prefers-reduced-motion` removes the eased camera moves and the flat-screen twinkle.
- **Accessibility**: every item on show has a real `<button>` in `#items` (off-screen, focusable); focusing one turns the camera to it and highlights it. Arrows look, `1`–`4` open an area, `0` the overview, Enter on the canvas selects the centre, Escape goes back one level, `,`/`.` or PageUp/PageDown page. Text details put the current point in an `aria-live` element. Focus is never trapped.

## Inside a headset (`xr-input.js`)

Requested optional features: `local-floor`, `bounded-floor`, `hand-tracking`.

| Input | How it works |
| --- | --- |
| **Bare hands with joints** (Quest, Afterglow) | Joints drawn as 25 small spheres per hand in one instanced draw call. Ray from a virtual shoulder through the index knuckle. **Pinch** = thumb tip to index tip under 18 mm; released above 34 mm (hysteresis). The target is the one under the ray when the pinch began. **Poke**: an index fingertip pushed through a card or button within reach presses it. |
| **Controllers** | Target ray, trigger selects, thumbstick snap-turns 30°. |
| **transient-pointer** (Vision Pro) | Target taken at `selectstart`. |
| **No input device / `gaze`** (3DoF viewers) | A reticle in the centre of view; holding it on a target for 1.3 s fills a ring and selects (dwell). A viewer button selects at once. Dwell is switched off for the session once a transient-pointer has appeared. |

There is no pinch-and-drag or trigger-and-drag turning any more. It was the cause of the world shifting: a relaxed hand reads as a pinch, and turning the body then dragged the room.

**Moving everything (the Move handle)**: the bar has a "✥ Move" handle. Point at it, hold the pinch or trigger, and drag: all the content and the bar swing round the visitor's eyes with the pointer, left and right and up and down (to about 83° either way), and stay where they are let go. That is how to put it overhead for lying back, or off to one side. Pressing it with a fingertip, or dwelling on it with no pointer, brings everything to where the visitor is looking. The sky does not move with it. This is the only thing that re-places the content; there is no longer a separate hand dock, the bar is the one set of controls.

One bar sits low and straight ahead with up to three rows: what is open (Back, Prev, position, Next, photo set, Slideshow/Play); where to go (the four areas, Search, Time machine, Sky only, and Back to the present while travelling); and the room itself (Move, Passthrough, Music, volume, Exit VR). In Sky only the first row is Constellations, Time-lapse, Star trails and north.

**Passthrough**: a toggle on the bar inside the headset, shown where the headset offers `immersive-ar`. A session cannot change between VR and AR while it runs, so on those headsets the session asked for is always the AR one, and the scene paints its own sky and ground over the real room; it looks and behaves as VR. The Passthrough button simply stops painting them (the ground still cuts the sky off at the horizon), so the stars, planets, moon and the portfolio sit in the real room, and it can be switched back at any moment. If the AR request is refused, VR is asked for instead and the button is not shown. Android phones are excluded, because AR there is the hand-held camera view rather than a headset.

**Leaving VR** goes to the home page (`/`), not to this page's flat view. The exception is a visitor who was already using the flat view here ("Start exploring") before entering: they come back to it. From the home page's banner the session runs inside the home page, so leaving simply reveals it.

**North** (`compass.js`): WebXR has no compass, so a session's "ahead" is arbitrary. Where the device delivers compass headings through device orientation events (`deviceorientationabsolute`, or iOS's `webkitCompassHeading`; permission is requested in the same tap that enters), the sky is turned so its north is the real (magnetic) north and eased to follow it. Standalone headsets generally do not expose a compass to pages; there the Sky only bar has **Set north here**: face north, choose it, and the sky turns to match. The button shows which is in use ("North: compass", "North set ✓"). Without either, north is the direction faced on entry.

**Where**: the sky is computed for roughly where the visitor is, from the time zone (`guessLocation()` in the simulation: no prompt, nothing sent anywhere), falling back to Bakersfield, CA.

**Pointing at the sky**: the planets, the moon and the sun each have an invisible target about 5° across. Pointing at one (ray, gaze, or the mouse on a flat screen) shows a caption beside it: name, magnitude or phase, altitude and compass direction. Selecting it keeps the caption up; selecting again lets it go. The sun is marked only in passthrough or with Constellations on, because the room is otherwise a night sky.

**3DoF and 6DoF**: `local-floor` is used when offered, otherwise `local`. Either way the content is placed from the first head pose, so it suits seated, standing and rotation-only viewers alike.

## The sky (`sky.js`)

`createSky(THREE, { invalidate })` returns `{ object, source, guides, targets, update(time, lat, lon), tick(seconds), setGuides(on), setNorth(theta), setTrails(arc), setPassthrough(on), guessPlace(), use(module | null), detect() }`. `app.js` adds `object` to the scene (not to the anchored content: the sky keeps its own compass, north along -Z, and follows the viewer so it shows no parallax), calls `update` at start and once a minute (every frame during a time-lapse), and `tick` on every drawn frame for the twinkle.

It is drawn the way the 2D planetarium draws it, from the same data:

- stars: real positions, magnitudes and colours from `SkyModel`; soft round points with a glow, sized by magnitude with the 2D renderer's curve, twinkling more toward the horizon; visibility (extinction, moonlight) from the model's `alpha`;
- the Milky Way from the model's 800 patches, summed once into a texture;
- planets (steady, coloured), the moon with its phase and lit-limb angle and a glow;
- the zenith-to-horizon gradient with the 2D renderer's altitude stops, and a dark ground below the horizon;
- optional guides: constellation figures and names, names of stars brighter than magnitude 1.6 and of planets, compass points.

What is read from `/assets/sky/sky.js` (v1.0.0): `SkyModel` (`new SkyModel({ lat, lon, time, mode: 'night' })`, `setLocation`, `setTime`, `setCatalog`, `getData()`, `catalogVersion`, `constellations`), `loadCatalog` with `stars.json` beside the module, and from `getData()`: `matrix`, `stars.count/eq/mag/alpha/colour/twinkle/names`, `planets.enu/alpha/mag/colour/names`, `milkyWay.count/eq/weight/size`, `moon.alt/vec/illumination/limbAngle/phaseName`, `sun.vec`, `sky.zenith/horizon/ground/milkyWay`; also the exports `guessLocation` and `PLANET_NAMES`. If any of those is renamed, `modelSky()` in `sky.js` is the one place to change. The module is loaded with a `HEAD` probe and a dynamic `import()` in try/catch and is never edited; if it is missing or fails, a built-in star field is drawn with the same renderer (`source === 'built-in'`).

Choices made here: the model is asked for its **night** look whatever the hour; star colours are the model's own (the same as the 2D planetarium); the place is guessed from the time zone, with Bakersfield, CA (`DEFAULT_PLACE`) as the fallback.

## Search (`panels.js`)

"Search" on the bar (and in the HUD; `/` on a keyboard) opens a panel in place of the content: the line being typed, up to six results, and a keyboard of Latin letters and digits that works with a ray, a fingertip, gaze dwell or the mouse. It searches the site's own `/search-index.json` with the home page's scoring. Choosing a result jumps to it: a photograph opens in the viewer, a project opens its app sheet (or its entry on the timeline), a section opens its area, `/panos/` opens Panoramas. Any other page is marked ↗ and choosing it leaves this view (and VR) for that page. Results are limited to what exists on the date the time machine is set to.

On a flat screen there is also an ordinary text field, so the system keyboard and its input methods work (that is how to search in Chinese, Japanese or Korean). In a headset the keyboard is Latin only.

## Time machine (`time.js`, `panels.js`)

The home page's `?when=` in a form that works inside a headset. `/xr/?when=<named day | YYYY-MM-DD | YYYY-MM-DDTHH:MM>` is honoured on arrival (so are links from the home page, and the older `?date=`), and "Time machine" on the bar opens a panel: step the year and the day, **Go**, one-tap named days, and **Back to the present**. While away, a line above everything reads "DESTINATION TIME · …", the bar gains Back to the present, and the URL carries `?when=`.

Travelling happens in place, because a page load would end the VR session. The change is hidden by a short fade: a dark shell closes round the head, the destination resolves out of noise in front of the visitor, the scene is rebuilt while it cannot be seen, and the shell opens. Nothing streams past, so there is no sense of being moved. With reduced motion asked for there is no fade; the scene changes and the destination is shown briefly.

What changes with the date (the home page's rules):

- **Past**: photographs taken later, apps and projects released later, and jobs and education begun later are removed everywhere: the walls, the timeline, the search, and the overview's four cards (their pictures, counts and spoken labels are drawn from the lists as they stand on that date; a section with nothing yet shows an empty frame and a count of 0; the tagline "fourteen years of work" is only shown in the present). One set of lists (`photos`, `panosNow`, `apps`, `resumeNow`, `projectsNow`) feeds everything, so nothing reads the full data by mistake.
- **Things with no date**: 3 photographs (`bmp-15`, `bmp-16`, `bmp-93`) and all 107 panoramas have no capture date in the site's data. They are shown from the day of the earliest dated photograph (21 June 2015) onward and hidden before it; between then and now they cannot be placed, so they all show. Skills have no dates either: the skills chart appears once there is a first job. In a past search, pages belonging to an app or tool appear only once that app exists; other pages (books, puzzles, privacy and so on) have no dates and always appear.
- **Future**: the Apps wall begins with unreadable cards for work not yet written (the year arrived in, the skipped stretch with its note, the first years after today), which flicker; selecting one shows the note. The dogs change by year: the gallery's Luma set is renamed for whoever is alive, stand-ins appear as colour-and-noise tiles (nobody has photographed them yet), and dogs who have gone move to a "best of doggos" set, where Luma keeps her real photographs.
- **Founder era** (from `future.founderFrom`): the overview is titled with the site's name, reads as started by Blaine Miller, and has a Founder note; nothing celebratory is shown.
- **The sky** is drawn for the destination date (at the chosen time, or the present time of day).

Not carried over from the home page: the hero statistics (there are none here), and switching away from the résumé view in the founder era (the Experience area stays available).

## Seasons (`seasons.js`)

The calendar in `content/site.json` drives effects round the visitor, on the real date or the time machine's: snow and a strand of Christmas lights in December, leaves in autumn, fireflies in summer, embers in October, petals at Easter, stars on Memorial and Veterans Day, confetti on birthdays, fireworks at New Year and on July 4 (the day's own colours from the data are used as given, so July 4 is red, white and blue). On the day itself the greeting is shown above everything and in the HUD. Luma's birthday is treated as one more day (confetti and her greeting).

The particles are one draw call (at most 480 points), the lights two; particles stay at least 70 cm away, are small and slow, and nothing covers the view. Effects are hidden inside a panorama. On a flat screen the page animates only while an effect is running. With reduced motion asked for there are no particles; the lights are simply on.

## Languages (`i18n.js`, `i18n/`)

Everything a visitor can read or hear in here goes through `tr(key, vars)`: the page, the HUD, every in-world button, sign, tile, caption and status line, the errors, and the sky's captions.

- **Which language**: exactly as `/i18n/i18n.js` does it: `?lang=`, then localStorage `wemiller-lang`, then the browser's languages, else English. A `?lang=` choice is stored under the same key, so it carries across the site.
- **Who wrote them**: the English is the site's own. The eight translations were written by Claude Opus subagents (two languages each), working only from the English strings and a brief of rules and context for each group of keys; not by the model that built this folder. To change or extend them, give a translator the `EN` object from `i18n.js` and the rules in this section. No native speaker has reviewed them.
- **Where the words are**: English is the `EN` object in `i18n.js` (always present, no request). Each other language is `i18n/<lang>.json` with the same 183 keys; a missing key falls back to English. To add or change a string, edit `EN` and the eight files. Values with `{name}` take variables. Three keys (`intro.p`, `intro.k1`–`k7`, `intro.plain`) contain markup and are set with `data-i18n-html`.
- **Markup**: `index.html` keeps English as its baked-in text and marks elements with `data-i18n`, `data-i18n-html` and `data-i18n-attr="attr:key"`, the site's own convention. `main.js` loads the strings and applies them before the scene starts.
- **Search, the time machine, the seasons and the volume control added no new strings**: their words are the site's own (`nav.search`, `search.*`, `tm.*`, `fut.*`, `season.*`, `bday.today`, `snd.volume`), read from `/i18n/index.<lang>.json` in all nine languages, English included.
- **The site's own content** is not re-translated here: app and project descriptions (`tl.<id>.desc`), dates (`tl.<id>.date`) and the six featured taglines (`ft.<id>`) are read from `/i18n/index.<lang>.json` (read only).
- **Text in textures**: the font stack names each platform's Chinese, Japanese and Korean faces; `ui.wrapLines` breaks between any two CJK characters (not before closing punctuation) as well as at spaces; in-world buttons are sized to the longest label they can show, and a row of them that would span more than about 70° is drawn slightly smaller instead.
- **Dates and numbers** use `Intl` for the language (months on the timeline, magnitudes).
- **Left as they are**: product and app names, people's names, proper names of stars.
- **Not translated, because the source has no translation**: photo titles and captions (`content/photos.json`); the résumé (job titles, companies, bullet points, education, skill names and the "4 - 6 years" group headings from `content/resume.json`); taglines of apps other than the six featured ones (`app-sheets.json` `g`); project tech-stack labels; the `<noscript>` message (it is shown only when no script can run). The browser's own error text inside "VR did not start: …" is whatever the browser gives.

## Music (`music.js`)

**Volume**: beside Music on the bar are −, the level and +, in steps of 10%; the HUD has a slider. The level is read from and written to localStorage `wm-vol` (0–1), the same key the home page's slider uses, and when the scene runs inside the home page it drives that page's own slider.

The "Music" button (HUD and the in-world bar) toggles ambient sound exactly as the home page does: Tom's `createRadio()` tuned to the `mix` station, with `/loop.mp3` as the fallback and for `saveData` connections. Nothing is fetched until the visitor reaches for the button. When the scene runs embedded in the home page, the button drives the home page's own `#sound` button instead, so there is one player.

## One tap from the home page (`offer.js`)

A WebXR session has to be requested inside a tap and cannot survive a page change, which is why going to `/xr/?enter=1` always costs a second tap. `offer.js` removes it: on the first tap of the banner's button it requests the session there and then, loads the scene into a hidden element on the home page (`start({ root, embedded: true, session, music, onExit })`), and removes it again when the session ends, leaving the visitor on the home page as it was. If anything fails, the button's ordinary link is followed.

It also moves `.xr-offer` to the bottom of the window (an injected rule; better moved into `assets/site.css`: `top: auto; bottom: calc(env(safe-area-inset-bottom, 0px) + 14px)`), and preloads the scene's modules once the banner is on screen (not on `saveData` connections).

The home page loads it when it shows the banner. That is in `assets/site.js`, where `xrOffer.hidden = false` is set (the same block no longer remembers "Not now": it hides the banner for that page view only):

```js
var s = doc.createElement('script'); s.type = 'module'; s.src = '/xr/offer.js'; doc.head.appendChild(s);
```

## Arriving from elsewhere

- `/xr/?enter=1`: if `navigator.xr` exists, one large focused **Enter VR** button is shown instead of the intro. Still the fallback for links from other pages.
- `/xr/#gallery`, `#panoramas`, `#apps`, `#experience` open that area; the hash follows the area in use and is cleared on the overview. They combine: `/xr/?enter=1#experience`.
- `?nowebgl` forces the no-WebGL card.

## To wire up (outside this folder; not done here)

1. Optional: move the banner's bottom position from `offer.js` into `assets/site.css` (the hook that loads `offer.js` is already in `assets/site.js`).
2. Add `https://wemiller.com/xr/` to `sitemap.xml`.
3. If the site's offline list or service worker enumerates files, `xr/offer.js` is new.
4. `window.__xr` is a small debugging handle left in `app.js`; remove it if you prefer.

## Tested / not tested

**Tested in desktop Chromium** against the local static server:

- flat mode: overview, all four areas, paging, photo sets, the slideshow (start from the Gallery, auto-advance), app details with both screenshot formats (Afterglow's wide shots, Haven's phone shots), Experience and its text paging, Sky only with constellations, the Tab list, number keys and Escape, deep-link hashes, `?nowebgl`;
- sky: drawn from the real `/assets/sky/sky.js` with its catalogue; switching to the built-in star field and back;
- XR logic with a **synthetic session** (a fake `XRSession` feeding head poses, controller rays, 25-joint hands and select events): content anchored to the entry pose and height; a pinched hand swept sideways while the head turns leaves the world exactly where it was; controller select; the bar in each state; Sky only, Constellations, Time-lapse and Show portfolio from the bar; slideshow start, next and pause from the bar; gaze dwell on a tile and on Back; a panorama opened and closed; thumbstick snap; re-anchoring on a reference-space reset; session end;
- `offer.js` on the home page with the same synthetic session: banner at the bottom, one `requestSession` on the first click, no navigation, scene removed and banner back on exit, a second entry working.

**Added after the second headset trial, tested the same way**: the picture tiles; previews at full size with transparent surrounds (Embr's watch and phones); the caption clear of the bar (its lower edge 20 cm above the bar's top); the Passthrough toggle in a simulated AR session (painted sky on entry, off and on again from the bar); leaving a simulated session landing on `/`; time-lapse speeds, and the sky slowing to the calm rate behind the portfolio and speeding up again in Sky only; pointing a controller at the moon (caption shown, kept after selecting); Set north here; a simulated compass heading turning the sky to match.

**Move handle, tested the same way**: dragging it with a controller by 0.5 rad across and 0.7 rad up moves the handle by exactly that and leaves it there; moving the pointer after release does nothing; selecting it while looking up from a lying position brings the content there; bare hands add no extra controls.

**Languages, tested the same way**: all eight files checked by script against the English (same 183 keys, every `{placeholder}` present, markup and link targets intact, Back and Prev different words); `?lang=ja` and `?lang=de` on screen and in a simulated session (page, HUD, the in-world bar in every state, tiles, sky captions, constellation names): no English left in the controls, CJK text drawn and wrapped in textures, the widest row within its limit. English unchanged with no language stored. The other six languages were checked by script only, not looked at on screen.

**Search, time machine, seasons, volume, tested the same way** (simulated session and flat screen): typing on the in-world keyboard and choosing a result with a controller (app, photograph); `/` and the text field on a flat screen; travelling to 2014 (overview cards: 0 photographs and 0 panoramas with empty frames, 2 apps with their two icons, a timeline with no roles; no search result for Haven or for panoramas), to 2021 (21 photographs, 3 apps, cards picturing only those), to 2015 (7 photographs, 2 apps, a shorter timeline, no result for an app not yet made), to Christmas by name (snow, lights, greeting), to 2041 (seven unreadable cards, dogs renamed, museum set), to 2080 (founder note, no season), and back; the fade reaching full dark and clearing; `?when=halloween&lang=ja` on arrival, fully in Japanese; particles moving; volume up and down writing `wm-vol`; the home page's one-tap launch still starting and cleaning up.

Not verified: reduced-motion behaviour (no way to switch it on in the test browser); how the fade, the effects and their frame rate feel in a real headset; fireworks and lights in passthrough; the volume proxy against the home page's real slider while music plays.

**Not re-tested this round** (unchanged code paths that passed before): `?enter=1`, music, poke, transient-pointer, the `local` fallback.

**Not tested on any real device.** To check in Afterglow and a headset:

- the Move handle: how the drag feels with a pinch (the hand ray is smoothed), and reading the content when it is overhead;
- passthrough on a real device: that an AR session with the painted sky really is indistinguishable from VR (no room showing through panels or at the edges), how the stars read against a lit room, and alignment with the real horizon;
- the compass: whether the headset or viewer delivers orientation events at all inside a session, and whether the heading is right when the phone is held in a viewer (landscape, upright). If it is wrong or absent, Set north here is the fallback;
- the one-tap entry itself (that the browser accepts a session requested in the banner's click, and how long the view is empty while the scene loads);
- star size and brightness, the Milky Way's strength, label sizes and the horizon in a headset (tuned on a flat screen only);
- frame rate with about 9,000 stars on a phone and a standalone headset;
- hand ray steadiness, pinch thresholds (18 / 34 mm), poke depth;
- Quest controllers: rays, trigger, thumbstick axis index; Vision Pro look-and-pinch; 3DoF dwell timing;
- whether the bar's height (about 30° below eye level) is comfortable, and photo size at 2 m;
- music started from inside VR on Safari-based browsers (a pinch or dwell may not count as a user gesture);
- real touch drag, the device-motion toggle, Safari, Firefox, real Lockdown Mode.
