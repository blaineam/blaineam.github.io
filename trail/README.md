# The Trail

A trail of five camps across the map. It is a litmus, not an exam: most of it has no right
answer, and what is kept is how someone went about it. The reasoning behind the design is kept
out of this repository on purpose.

| File | What it is |
|---|---|
| `index.html`, `trail.css` | The page frame: map, sign-in, the stage area, the patch screen, Luma |
| `engine.js` | Signs the hiker in, draws the map, walks a camp's stages, saves the run, counts hints |
| `trail.js` | The list of camps, in order. A camp whose module is missing is "not open yet" |
| `camps/<id>.js` | One camp each: `trailhead`, `workshop`, `shelter`, `overlook`, `summit` |
| `camps/common.js` | Stage builders camps share: a decision with no right answer, a campfire question |
| `scenery.js` | Every drawing: the map, the scene at the top of a stage, the campfire. Luma is her own photograph (`luma.webp`) |
| `manners.js` | Whether a piece of text is acceptable: no rudeness, and nothing promotional in anything public |
| `seal.js`, `send.js`, `config.json` | Sealing a finished run to the owner's key and sending it without a server |
| `register.js`, `register.json`, `lights.json` | The public register and the lights on the map, for people who chose to sign and were approved |
| `desk/` | The owner's private reading desk: keys, shares, reading runs |
| `words.js`, `guide.json` | Translation (`t()`), the hiker's language, and who the trail guide is today (written by the site build from `content/site.json`) |

Everything a hiker reads goes through `t('English sentence', { values })` from `words.js`; the
English sentence is the key. `node scripts/trail-words.mjs` collects every sentence into
`i18n/trail.en.json`, `--check` fails if that file is stale, and `--gaps --list` says what each
language in `i18n/trail.<lang>.json` is missing. A sentence with no translation stays English.
The guide's name is never written in a sentence: use `{guide}`. The manners check (`manners.js`)
only knows English words.

A hiker can go back to any finished stage (the step chips) or camp (the list under the map) to
mend a slip, and is taken back to where they had got to afterwards.

Everything runs in the browser. The run is saved on the device (`localStorage`, `wm-trail-v2`).

## Writing a camp

A camp module's default export:

```js
export default {
  id: 'workshop',                 // must match the file name and the list in trail.js
  name: 'The Workshop', sub: 'Craft',
  intro: 'One sentence under the camp name.',
  stages: [
    { id: 'pipes', label: 'The leak',         // label: the chip in the step list (2-3 words)
      title: '1. Find the leak',              // optional: the card heading (default "n. label")
      cls: 'fire',                            // optional: extra class on the card
      hints: ['first hint', 'second', 'last'],// optional: Luma's hints, given in order, counted
      mount(el, ctx) { /* build the stage inside el */ } },
  ],
  tally: (parts) => [['Label', 'value'], …],  // rows for the patch screen; parts[stageId] = that stage's data
};
```

`mount(el, ctx)` builds its own DOM inside `el` (use `h` from `engine.js`) and gets:

| | |
|---|---|
| `ctx.data` | This stage's saved object. Put anything worth keeping on it: answers, choices, counts, the path taken. `hints` and `ms` are kept by the engine |
| `ctx.save()` | Save now (the engine also saves on `done` and on leaving) |
| `ctx.seed`, `ctx.rng(salt)` | The hiker's 32-bit seed, and a seeded random generator. Use it for anything that should differ per hiker; never `Math.random()` for puzzle content |
| `ctx.say(text, good?)` | The status line under the stage (`aria-live`) |
| `ctx.done(delayMs?)` | The stage is finished: move on (after a pause to let a success message be read) |
| `ctx.setHints(hints)` | Replace Luma's hints when they depend on the puzzle generated |
| `ctx.onLeave(fn)` | Clean up timers, listeners, canvases when the stage is left |
| `ctx.hiker`, `ctx.reduced` | The trail name; whether reduced motion is on |
| `ctx.camp` | All of this camp's stage data so far |

A stage may also set `scene` (`trail`, `bench`, `hut`, `fork`, `cairn`, `peak`; a stage with `cls: 'fire'` always gets the campfire) and `time` (`day`, `dusk`, `night`), which colour the sky. Everything a hiker writes is checked for manners when the stage finishes.

Rules every stage holds to:

- **Checked by state, not by a string.** Decide success by examining what the hiker built or
  chose. Do not compare against an answer written in the source, and do not write hashes of
  answers either.
- **Different for each hiker** where it can be: numbers, layouts, which variant, from `ctx.rng`.
  Make sure every generated puzzle is solvable (search for a solution when generating, and try
  another seed if there is none).
- **Keep the path.** Record attempts, retries, order of moves, what was tried first.
- **Choices and campfire questions have no right answer.** Never score, rank or hint at a
  preferred option. Accept any honest answer of a reasonable length.
- **Playful.** It should feel like a puzzle on a trail, not a form. Things to touch and move.
- Keyboard reachable, labelled for screen readers, works at phone width, honours reduced
  motion, no yellow or gold. Colours come from `/assets/shell.css` (`--wm-*`); the green is
  `var(--wm-green, #5fd3b0)`.
- Plain English a non-specialist could follow, and no first person from Blaine.
- Camp-specific CSS goes in `trail/camps/<id>.css`, loaded by the module itself
  (`document.head.append(h('link', { rel: 'stylesheet', href: new URL('./<id>.css', import.meta.url) }))`),
  with class names prefixed by the camp id so camps cannot collide.

`camps/trailhead.js` is the worked example: a canvas puzzle, a puzzle using the site's sky
module, a balance with an adversarial crate, a decision and a campfire question.
