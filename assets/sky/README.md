# assets/sky: the real sky, for a place and time

A dependency-free simulation of the sky: where the sun and moon are, what colour the sky is, and
which stars and planets are up, for any date, time, latitude and longitude. One model, two ways to use it:

- **`SkyCanvas`**: a 2D `<canvas>` renderer (no WebGL, so it works in Safari Lockdown Mode). A
  horizon-up view toward a compass direction, with drag-to-pan, twinkle, constellations and a
  long-exposure star-trails mode.
- **Data API**: plain numbers and typed arrays (sun and moon directions, sky colours, stars as unit
  vectors with magnitude and colour) for another renderer, such as the three.js sky dome in `xr/`.

No servers, no third-party requests, no fonts. The only request it makes is a same-origin fetch of
`stars.json`. The place is guessed from the time zone; the Geolocation API is used only if the
visitor presses "Use my location" (opt-in, see below). Try it: open `assets/sky/demo.html` from the site's static server.

## Files

| File | What it is |
| --- | --- |
| `sky.js` | ES module: astronomy, `SkyModel`, `SkyCanvas`, `createSky`. Also sets `window.Sky`. |
| `sky-controls.js`, `sky-controls.css` | Optional control bar (time, speed, place, direction, look, toggles). |
| `sky-strings.js` | Every word the module shows, in nine languages; see [Languages](#languages). |
| `stars.json` | The star catalog the page loads: 8,404 stars from the Yale Bright Star Catalogue. |
| `starter.json` | Hand-entered bright stars and stick figures. Source of names and lines; never overwritten. |
| `build-stars.mjs` | Writes `stars.json`, from the starter set or from a full catalog. |
| `test.mjs` | Astronomy and translation checks: `node assets/sky/test.mjs`. |
| `demo.html` | Standalone demo with the controls. Add `?lang=ja` (or any of the nine) to see a language. |

## Replace the home page canvas

The home page already has `<section class="sky" id="contact"><canvas id="stars">`. Remove the
generative star-trail block in `assets/site.js` (the one under the comment `the sky behind "Say hello"`)
and add, as a module script:

```html
<script type="module">
  import { createSky } from '/assets/sky/sky.js';
  const canvas = document.getElementById('stars');
  if (canvas && canvas.getContext) {
    const sky = createSky(canvas, {
      trails: true,      // keep the long exposure as the default look (omit for a live sky)
      drag: false,       // the canvas sits behind the text there
      labels: false      // no compass letters behind the heading
    });
    // optional: let the page follow the simulated sun
    sky.model.on('daynight', (model, which) => { document.documentElement.dataset.sky = which; });
  }
</script>
```

The canvas takes its size from CSS (it must have a width and height from the layout; the existing
`.sky canvas` rule does that). The renderer handles device pixel ratio (capped at 2), resizing,
pausing when off screen or the tab is hidden, `prefers-reduced-motion` (a still frame; trails are
drawn as a finished exposure) and Save-Data / `prefers-reduced-data` (bright stars only, no
animation). From a classic script, load `sky.js` with `<script type="module" src>` and use
`window.Sky` after the `sky:ready` event on `window`.

Text over the sky: by day the sky is light blue, so white text needs help. Either keep the section
forced to night (`mode: 'night'`, true star positions, always dark) or put a scrim behind the text.

### Planetarium mode (hide the contact block, enjoy the sky)

One button clears whatever the page lays over the sky, lets the visitor drag in every direction to
look around like a 360 view (touch included), shows compass letters and names for the planets and
brightest stars, and puts everything back on a second press or Escape. The hidden
elements keep their space (no layout jump) and are made inert while hidden.

```js
import { createPlanetariumToggle } from '/assets/sky/sky-controls.js';
createPlanetariumToggle(sky, {
  host: document.getElementById('contact'),          // gets data-sky-view="on" while open
  hide: '.sky__inner > :not(.sky__tools):not(.sky__controls)',   // what to clear away
  button: document.getElementById('sky-planetarium'),            // your own button (must not be inside `hide`)
  labelTarget: document.querySelector('#sky-planetarium span'),  // optional: where the label text goes
  showLabel: 'Planetarium mode', hideLabel: 'Exit planetarium'   // pass translated strings here
});
```

Leave out `button` and it makes its own pill at the bottom centre of the host (styled by
`sky-controls.css`). On the home page, also lift the shade and the canvas opacity while open:
`.sky[data-sky-view="on"] .sky__shade { background: transparent }` and
`.sky[data-sky-view="on"] .sky__stars { opacity: 1 }`.

### Time machine (wind the sky to another date)

When the site's time machine changes the date, call `travelTo` instead of `setTime`:

```js
sky.view.travelTo(when + 'T21:00:00');     // returns a promise; 'now' or { live: true } returns to the clock
```

The sky rewinds or fast-forwards to the new time, blurred while it moves, and settles. The duration
grows gently with the size of the jump (about 0.6 s for an hour, 1.1 s for a day, 2.3 s for a year,
never more than 2.4 s). Long jumps do not spin through every day in between (that would strobe): the
sky skips to about a day before the target and winds in from there. With reduced motion or low data it
jumps straight there; if the canvas is off screen, the animation waits and plays when the sky is next seen. The control bar's "Now" button and date field use it too.

To add the control bar:

```html
<link rel="stylesheet" href="/assets/sky/sky-controls.css">
<div id="sky-controls"></div>
<script type="module">
  import { createSkyControls } from '/assets/sky/sky-controls.js';
  createSkyControls(sky, { container: document.getElementById('sky-controls') });
</script>
```

## Use the data API from three.js

```js
import { SkyModel, loadCatalog, enuToThree } from '/assets/sky/sky.js';

const model = new SkyModel({ catalog: await loadCatalog('/assets/sky/stars.json') });
const s = model.stars;

// Stars: build once in J2000 coordinates, then rotate the whole group each frame.
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(s.eq, 3));          // unit vectors
geo.setAttribute('color', new THREE.BufferAttribute(s.colour, 3));         // rgb 0..1 from B-V
geo.setAttribute('alpha', new THREE.BufferAttribute(s.alpha, 1));          // visibility now, 0..1
const stars = new THREE.Points(geo, starMaterial);                         // scale positions in the shader
stars.matrixAutoUpdate = false;
scene.add(stars);

const v = [0, 0, 0];
renderer.setAnimationLoop((t) => {
  if (model.advance(dt)) {                       // dt = real ms since the last frame; true when recomputed
    stars.matrix.fromArray(model.threeMatrix);   // J2000 -> x east, y up, z south (north is -z)
    geo.attributes.alpha.needsUpdate = true;
    sunLight.position.fromArray(enuToThree(model.sun.vec, v)).multiplyScalar(100);
    moonMesh.position.fromArray(enuToThree(model.moon.vec, v)).multiplyScalar(90);
    const c = model.sky;                         // colours are 0..255
    dome.material.uniforms.zenith.value.setRGB(c.zenith[0] / 255, c.zenith[1] / 255, c.zenith[2] / 255);
    dome.material.uniforms.horizon.value.setRGB(c.horizon[0] / 255, c.horizon[1] / 255, c.horizon[2] / 255);
    ambient.intensity = c.ambient;
  }
  renderer.render(scene, camera);
});
```

Light the moon mesh from the sun's direction and its phase comes out right for free;
`model.moon.illumination` and `model.moon.limbAngle` are there if you draw it as a sprite instead.
`model.visibleStars()` returns a plain array of `{ dir, mag, bv, colour, alpha, radius, name, real }`
if you would rather not touch typed arrays (it allocates; do not call it every frame).

## API

Conventions: degrees; azimuth from north through east; longitude east-positive; local vectors are
`[east, north, up]` unit vectors; colours are 0..255 unless noted.

### `new SkyModel(options)`

| Option | Default | |
| --- | --- | --- |
| `lat`, `lon` | guessed from the time zone | `guessLocation()`; unknown zones fall back to 36 N |
| `time` | now, following the clock | `Date`, ms, or ISO string |
| `rate` | `1` | simulated seconds per real second; `0` pauses |
| `mode` | `'auto'` | `'night'` or `'day'` forces that look; positions stay true |
| `catalog` | none | parsed `stars.json` |
| `maxMag` | `6.5` (`4.5` in low-data mode) | faintest catalog star kept |
| `lowData` | `false` | bright stars only, no filler, no Milky Way |
| `filler` | `'auto'` | decorative faint stars; auto = only when the catalog is the starter set |

Methods (all chainable): `setTime(t)`, `now()`, `setRate(r)`, `setLocation(lat, lon, source?)`,
`setMode('auto'|'night'|'day')`, `setLowData(bool)`, `setCatalog(json)`, `advance(dtMs)` (call once
per frame; returns `true` if the sky was recomputed), `update()`, `getData()`, `visibleStars()`,
`matrixAt(extraDegrees, out)`.

State you can read after any call (objects and arrays are reused, never reallocated):

- `model.time`, `lat`, `lon`, `lst` (local sidereal time), `live`, `rate`, `mode`, `locationSource`
  (`'timezone'`, `'offset'`, `'default'`, `'given'` or `'geolocation'`), `version` (bumps on every recompute).
- `model.sun`: `alt`, `az`, `vec`, `ra`, `dec`, `up`, `distAU`.
- `model.moon`: `alt`, `az`, `vec` (as seen from the observer, parallax included), `illumination`
  (0..1), `phase` (0 new, 0.5 full), `phaseName`, `waxing`, `elongation`, `limbAngle` (direction of
  the lit limb, clockwise from "toward the zenith"), `distKm`, `up`.
- `model.sky`: `phase` (`day`, `golden`, `civil`, `nautical`, `astronomical`, `night`: the real one),
  `look` (the one being shown, after `mode`), `isDay`, `zenith`, `horizon`, `glow` + `glowStrength`
  (the warm side of a twilight sky), `ground`, `sunColour`, `ambient` (0..1 light level),
  `limitingMagnitude`, `starVisibility` (0..1), `milkyWay` (0..1).
- `model.stars`: `count`, `realCount`, `eq` (J2000 unit vectors, static), `enu` (local, updated),
  `mag`, `bv`, `colour` (rgb 0..1), `alpha` (0..1 now; 0 below the horizon), `radius` (suggested CSS
  px), `real` (0 for decorative filler), `names` (`{ index: 'Sirius' }`).
- `model.planets`: Mercury to Neptune (`names`), `eq` (J2000 unit vectors), `enu`, `mag`, `alpha`
  (visibility now), `alt`, `az`, `elongation` (from the sun), `distAU`, `colour` (rgb 0..1), `radius`.
- `model.constellations`: `[{ id, name, paths: [Int32Array of star indices] }]`.
- `model.milkyWay`: `count`, `eq`, `enu`, `weight`, `size` (degrees): soft blobs along the galactic plane.
- `model.matrix` (3x3 row-major, J2000 to local) and `model.threeMatrix` (4x4 column-major, J2000 to
  three.js axes).

Events: `model.on(type, fn)` returns an unsubscribe function; `fn(model, detail)`.

| Event | Detail | When |
| --- | --- | --- |
| `daynight` | `'day'` or `'night'` | the shown sky crosses sunrise/sunset (use this to switch a theme) |
| `phase` | the new `look` | day, golden, civil, nautical, astronomical, night |
| `sunrise`, `sunset` | | the real sun crosses the horizon |
| `change` | `'time'`, `'rate'`, `'location'`, `'mode'`, `'catalog'` | something was set |
| `update` | | after every recompute (cheap; do not allocate in the handler) |

### `new SkyCanvas(canvas, model, options)`

| Option | Default | |
| --- | --- | --- |
| `azimuth` | `'auto'` | centre of view; auto faces the equator (the pole in trails mode) |
| `fov` | `100` | horizontal field of view |
| `horizon` | `0.1` | where the horizon sits, as a fraction of the height from the bottom |
| `trails` | `false` | long exposure; `trailSpeed` (degrees of sky per second, default 1.2) |
| `constellations` | `false` | stick figures and names |
| `planets` | `true` | draw the planets |
| `names` | `false` | label the planets and the brightest stars (planetarium mode turns this on) |
| `tilt` | `0` | degrees to raise the view, to see higher than the lowest 40° |
| `ground`, `labels`, `milkyWay`, `drag` | `true` | hills, compass letters, the band, drag to pan |
| `maxDpr`, `fps` | `2`, `20` | pixel-ratio cap; frame rate for twinkle (30 while fast-forwarding or trailing) |
| `reducedMotion`, `lowData` | `'auto'` | follow the media queries / Save-Data, or force with a boolean |

Methods: `travelTo(time, { duration?, live? })`, `setAzimuth(deg)`, `setTilt(deg)` (look higher, 0..90),
`setDrag(true | 'free' | false)` (true: touch drags sideways only so the page still scrolls; 'free': every
direction on touch too, which planetarium mode uses),
`setLabels(bool)`, `setNames(bool)`, `setTrails(bool)`, `setConstellations(bool)`, `setReducedMotion(bool)`,
`setLowData(bool)`, `invalidate()`, `destroy()`. Events: `view` (azimuth or tilt changed), `option`, `travel` (`'start'`, `'end'`).

### `createSky(canvas, options)` → `{ model, view, ready }`

Both option sets in one object, plus `catalogUrl` (default `stars.json` beside `sky.js`; `false` to
skip). `ready` resolves when the catalog has loaded; the sky draws without stars until then.

### Functions

`guessLocation(zone?)`, `requestLocation(model)`, `loadCatalog(url)`, `parseCatalog(json)`, `skyData(options)` (one-shot
`getData()`), `julianDay(ms)`, `gmstDeg(ms)`, `lstDeg(ms, lon)`, `sunEquatorial(ms)`,
`moonEquatorial(ms)`, `equatorialToHorizontal(ra, dec, ms, lat, lon)`,
`galacticToEquatorial(l, b)`, `enuToThree(v, out)`, `planetPosition(i, ms)` (0 Mercury .. 6 Neptune),
`PLANET_NAMES`. From `sky-controls.js`: `createSkyControls`, `createPlanetariumToggle`.

## Star data

`stars.json` schema (`format: "sky-stars"`, `version: 1`):

```json
{
  "format": "sky-stars", "version": 1, "epoch": "J2000",
  "source": "...", "licence": "...", "starter": false,
  "limit": 6.5,                    // complete to this magnitude
  "count": 8404,
  "columns": ["ra_deg", "dec_deg", "vmag", "b_v"],
  "stars": [101.288, -16.716, -1.46, 0, ...],     // flat, 4 numbers per star, brightest first
  "names": { "0": "Sirius" },                      // star index -> proper name
  "lines": [{ "id": "Ori", "name": "Orion", "paths": [[9, 175, 25, ...]] }]   // polylines of star indices
}
```

**What ships now is the Yale Bright Star Catalogue, 5th revised edition** (Hoffleit & Warren 1991;
CDS catalogue V/50): 8,404 stars to magnitude 6.5, 212 KB (84 KB gzipped). It carries no licence
restriction and is treated as public domain; cite it. Names and the 22 stick figures come from the
hand-entered `starter.json`, matched to the catalogue by position (all of its bright stars were found
within 0.1°, which is also the check that the file was read correctly).

It was built with:

```bash
node assets/sky/build-stars.mjs --fetch
```

Details worth knowing:

- The default source is the Harvard mirror, `http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz` (590,228
  bytes, sha256 `0471ced0...6036cdb`). The canonical CDS archive
  (`cdsarc.cds.unistra.fr/ftp/cats/V/50/catalog.gz`) was refused because its HTTPS certificate did not
  match its host name; pass `--url` to use it once that is fixed. The mirror is plain HTTP; the file
  is only parsed as text, and the converter refuses to write anything if the bright stars are not
  where it expects.
- `--mag 5.5` keeps about 2,900 stars for a smaller file; low-data mode already limits itself to the
  904 stars of magnitude 4.5 and brighter.
- `node assets/sky/build-stars.mjs` with no arguments goes back to the starter set: about 200
  hand-entered stars, with a decorative field of faint stars added by the model (flagged `real: 0`)
  so the night does not look empty. With the full catalogue in place there is no filler: every star
  drawn is real.
- An already-downloaded file works too (`node assets/sky/build-stars.mjs path/to/catalog.gz`). The HYG
  database CSV is also accepted, but it is CC BY-SA 4.0, which would make `stars.json` a share-alike
  derived work needing attribution.

## Languages

`sky-strings.js` holds every word the module shows, in the site's nine languages (en, zh-Hans, ja, de, fr, es,
ko, pt-BR, it): the control bar, its notes and status messages, the status line (twilight names, moon phases),
compass points, planet names, the 22 constellation figures, and the bright stars that have their own name in a
language (the rest keep their IAU names). `sky-controls.js` imports it; `sky.js` does not, and stays English
until told otherwise.

The language is the page's: whatever `/i18n/i18n.js` last applied (it fires `i18n:applied` on `document`), else
a non-English `<html lang>`, `?lang=`, `localStorage["wemiller-lang"]`, `navigator.languages`, then English.
The bar and the canvas labels re-label themselves when the visitor switches language. Dates, percentages and
numbers are formatted for that language. A string missing from a language falls back to English.

```js
import { localizeSky, skyStrings, skyLang, onSkyLang } from './sky-strings.js';
localizeSky(sky);            // canvas labels follow the page language (the bar and planetarium toggle call this)
skyStrings('de').now;        // "Jetzt"
view.setStrings({ compass: [...8], planets: [...7], stars: { Sirius: '…' }, figures: { Ori: '…' } }); // or by hand
```

To change a translation, edit that language's block in `sky-strings.js`; `node assets/sky/test.mjs` checks that
every language has every string. The eight translations were produced by a separate model (Claude Opus) from
the English strings with context notes, and have not been reviewed by native speakers. Not translated: the date field itself (the browser draws it in its own language), the demo page's own
text, and the planetarium button's label when the host page passes its own (the home page does, from its
dictionary).

## Location, and the opt-in "Use my location" button

By default nothing asks the visitor for anything: the place is a city-level guess from the time zone
name. The control bar adds a "Use my location" button with this note beside it: "Optional. Your
browser will ask first. Your location is only used on this page to place the sky, and is never
stored or sent anywhere." Pressing it calls `requestLocation(model)`, which is the only code path
that touches the Geolocation API. The browser shows its own permission prompt; the result is rounded
to about a kilometre, set on the model (`locationSource` becomes `'geolocation'`), and kept only in
memory. If permission is refused the bar says so and points at the latitude and longitude fields.
The button is hidden where the browser has no Geolocation or the page is not a secure context; pass
`geolocation: false` to `createSkyControls` to leave it out. A host page with its own UI should call
`requestLocation(model)` from a click, with the same kind of notice, never on page load.

## Aiming with a phone (opt-in)

On touch devices with orientation sensors the control bar shows "Aim with my phone", with the note
"Optional. Point your phone at the sky and the view follows. Its compass and tilt sensors are only
read on this page." Pressing it calls `view.followDevice(true)` (iOS shows its own permission prompt;
it must come from a tap), after which the view's direction and height follow where the back of the
phone points. Press again, or call `view.followDevice(false)`, to stop. Pass
`deviceOrientation: false` to `createSkyControls` to leave the button out. This has not been tried
on a real phone: the maths is tested, the sensors' behaviour (especially iOS's compass heading when
the phone is held upright) is not.

## Accuracy, and what is approximate

Checked by `test.mjs` against Meeus's worked examples, almanac equinox/solstice/moon-phase times, the
2024-04-08 eclipse (moon on the sun from Mazatlán, not from Sydney), and known star separations.

- Sun: about 0.01°. Moon: about 0.3° (low-precision series), parallax included. Stars: catalog
  positions, precessed to the date. Good to a fraction of a degree, which is a pixel or two here.
- Not modelled: atmospheric refraction (things near the horizon are really about half a degree
  higher), nutation, aberration, proper motion, the observer's height.
- Planets: Keplerian elements (JPL approximate positions, valid 1800-2050), good to a few arcminutes
  (checked against the 2020 Jupiter-Saturn conjunction, a Meeus example and recent oppositions and
  elongations). Magnitudes are simple formulas; Saturn's rings are not modelled. With names on, a
  planet that is above the horizon is marked even in daylight or when too faint to see (Neptune).
- Sky colours are hand-tuned keyframes on the sun's altitude, not a scattering model. The sun and
  moon are drawn about three times their true size so they read at this scale.
- The Milky Way is a procedural band along the galactic plane, brighter toward the centre, with no
  dark lanes.
- The place is a city-level guess from the time zone. The control bar shows times in the browser's
  time zone, not the simulated place's.
- A wide strip only shows the lowest 40° or so of sky until you look up (`setTilt`, mouse drag, or the
  "Looking up" slider).
- Forcing "day" at night shows a blue sky with no sun disc (the sun really is below the horizon).
