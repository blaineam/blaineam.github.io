# /edit/ — the content editor

A private, server-free editor for wemiller.com. It is a static page: plain ES modules, no
framework, no CDN, no build step. The code is public; what makes it private is that nothing can
be changed without a GitHub token that only the repository's owner can create.

## How it works

- **Sign-in.** The owner pastes a GitHub *fine-grained* personal access token (this repository
  only, **Contents: Read and write**). It is stored in that browser's `localStorage`
  (`wm-edit:token`) and sent only to `https://api.github.com`. Classic tokens (`ghp_…`) are
  refused. Before any of the editor is built, the token is checked with
  `GET /repos/{owner}/{repo}` (`permissions.push` must be true) and the branch must exist.
  "Forget this device" (Settings) removes it.
  The sign-in card has a button that opens GitHub's new-token page with the form filled in
  through the query parameters GitHub documents ("Pre-filling fine-grained personal access
  token details using URL parameters"): `name`, `description`, `target_name` (the owner),
  `expires_in=90` and `contents=write`. GitHub has no parameter for choosing the repository,
  so "Only select repositories → this repository" stays a written step. The link is built
  from the owner and repository in "Repository and branch", opens in a new tab with
  `rel="noopener"`, and carries settings only. Pull requests are opened from a compare link,
  not the API, so no pull-request permission is asked for.
- **The only network hosts** are the site's own origin and `api.github.com`; a
  Content-Security-Policy `<meta>` in `index.html` enforces that. The page is `noindex`.
- **Reading.** `content/site.json`, `projects.json`, `photos.json`, `resume.json` through the
  Contents API, plus the listing of `slides/` and `scripts/build-site.mjs` (only to learn which
  photographs the build names, so they cannot be deleted).
- **Editing.** Edits live in a draft in the browser and work offline. Nothing is written until
  **Changes → Commit** (or **Publish to a separate branch**), which shows every file with a
  diff and asks for confirmation.
- **Drafts.** A draft is the whole set of unsent edits: the JSON changes, the order, and the
  image files waiting to be uploaded. Drafts are kept in IndexedDB (`wm-edit` → `drafts` and
  `blobs`) and written a quarter of a second after every edit; when the page is closing, the
  text of the draft is also put in `localStorage` (`wm-edit:mirror`) in case the IndexedDB
  write does not finish, and picked up at the next load. The top bar shows the open draft and
  when it was last saved. **Drafts** (the button with the draft's name) lists them: open,
  rename, duplicate (pictures included), delete, new. Drafts are separate for each repository
  and base branch. Opening a draft reloads the page and lays it over the latest files (a
  three-way merge, as after any change in the repository).
- **Publish to a separate branch.** Instead of committing to the branch being edited, a draft
  can be sent to a branch of its own (default name `draft/<draft name>`): blobs → tree →
  commit, then `POST /git/refs` creates the branch at that commit, so the live branch is
  never touched. Publishing the same draft again adds a commit to that branch (`PATCH`,
  never forced). The editor then links to GitHub's compare page, where the owner opens the
  pull request in their own session; the editor does not call the pull-request API, so the
  token needs nothing beyond Contents. The draft stays as it is. Once the pull request is
  merged, the next load sees that the draft's files are on the base branch (same git blob id)
  and stops listing them.
- **Saving.** One commit through the Git Data API: blobs → tree (on top of the branch's tree) →
  commit → `PATCH refs/heads/<branch>` with `force: false`. If the branch moved, the editor
  reloads the files, reapplies the draft (a three-way merge per JSON value) and either carries on
  (nothing it touches changed, which is the normal case after the deploy's own commit) or stops
  and asks the owner to look at the diff again. It never force-pushes.
- **Formatting.** Files are not re-serialised. `js/jsonpatch.js` parses the text with positions
  and replaces, inserts or removes only the values that changed, so blank lines, one-photo-per-line
  and aligned columns survive, `_help` keys and unknown keys are untouched. Every result is
  re-parsed and compared with the draft; if that ever fails the file is written with plain
  `JSON.stringify` and the Changes panel says so.
- **Validation** (`js/validate.js`) mirrors what `scripts/build-site.mjs` throws on (mode,
  featured ids, hero photographs exist, …) plus the shapes its templates rely on. Commit is
  disabled while anything fails.
- **Photos.** Picked, dropped or taken with the camera; resized so the long side is at most
  2400 px (orientation applied), encoded as WebP (quality 0.82) on a canvas, which drops all
  metadata from the uploaded file. Names continue the `bmp-<n>.webp` sequence. Alt text is the
  one thing that must be typed.
- **Watermark.** The signature is drawn into the bottom-right corner on the same canvas
  (`js/watermark.js`). The placement was measured on the photographs already in `/slides`:
  the ink is 22.5% of the long side wide, its right edge 0.92% of the long side from the right
  and its lowest stroke 0.58% of the long side from the bottom (at 2400 px: 540 px wide, 23 px
  and 14 px in), the same for landscape and portrait. It is drawn at 82% opacity with no
  shadow, because that is what the existing ones measure (their strokes peak at about 200 to
  225 of 255 on a dark corner; the same file at 100% gives 255). The transparent border of the PNG is
  cut off first, so those numbers are for the ink itself. The PNG is `edit/watermark.png`; a
  file chosen under Settings → Watermark (kept in this browser only) takes precedence. Each
  new photo has a "Watermark" switch in its form, with the result shown and a link to the
  full-size file; Settings has the default. To make the switch work without the original, a
  clean resized copy (no watermark, no metadata, quality 0.95) is kept in the browser until
  the photo is committed; it is never uploaded.
- **Dog tags.** **Luma** and **Nova** are checkboxes under "Sets" in each photo's form; a photo
  can have either or both, and either puts it on the Luma & Nova page (and on that dog's own
  page). Both are also filters above the grid and in the media picker.
- **Pre-filled from the file.** Before the re-encode, `js/exif.js` (own code, no library) reads
  the original and the form opens with whatever it found, each field marked "From the photo",
  editable, and removable ("Clear camera details" empties them all). Written to the photo's
  entry in `content/photos.json`:

  | Key | From | Notes |
  |---|---|---|
  | `taken` | EXIF DateTimeOriginal, else CreateDate | `YYYY-MM-DD`; impossible dates, years before 1990 and future dates are ignored |
  | `camera` | Make + Model | iPhone/iPad as is; make added when the model lacks it (`NIKON Z 8` → `Nikon Z 8`); `Canon EOS R5m2` → `Canon EOS R5 Mark II`; DJI → `DJI drone`; Noritsu / Frontier / Darkroom / "scan" → `Film (lab scan)`, and then no date or exposure fields |
  | `lens` | LensModel | left out for iPhone/iPad |
  | `focal35` | FocalLengthIn35mmFilm, else FocalLength × crop | crop = 36 mm ÷ (pixel width ÷ FocalPlaneXResolution, in the FocalPlaneResolutionUnit); left out when that gives no plausible sensor (3 to 70 mm wide) |
  | `aperture` | FNumber | one decimal, a number |
  | `shutter` | ExposureTime | text: `1/250`, `15`, `0.4` |
  | `iso` | ISOSpeedRatings, else RecommendedExposureIndex | integer |
  | `title`, `caption` | XMP `dc:title` / `dc:description`, then IPTC object name / headline / caption, then EXIF ImageDescription (caption only) | camera boilerplate such as "OLYMPUS DIGITAL CAMERA" is ignored |

  Only those tag numbers are read. The GPS directory is never followed, and serial numbers,
  owner, artist, copyright and every other tag are skipped unread. Containers understood: JPEG
  (Exif, XMP and IPTC segments), WebP (EXIF / XMP chunks), PNG (`eXIf`), and a scan of the first
  megabyte of anything else (HEIC, TIFF) for an Exif block; a file it cannot follow just leaves
  the fields empty. For photographs already on the site the form shows what
  `content/photo-meta.json` recovered as the fallback.
- **Media picker** (`js/views/picker.js`). Every place that asks for a picture already on the
  site opens the same dialog: hero photographs for a view (Text → Switches), the featured
  photographs (Photos → Choose featured), a project's icon and a project's screenshots. It has
  a thumbnail grid (thumbnails load lazily as they scroll into view), a search box (title,
  caption, description, file name, camera), filters (sets, featured, new, no description,
  camera and year for photographs; folder for project files), a large preview of the
  highlighted item with its details and pixel size, "View full size", and Select / Cancel.
  Fields that take several pictures allow ticking several. The Upload tab runs the same
  processing as the matching upload elsewhere (photographs: metadata read, WebP, location
  stripped, watermark) and ticks what was added; an upload stays in the draft even if the
  picker is then cancelled. The grid is a listbox: arrow keys, Home and End move, Space ticks,
  Enter ticks (or, where only one can be chosen, chooses and closes), Escape cancels; the
  count and the choice are announced.
- **Project icons.** Project → Icon → Upload: the middle square of any picture is saved as
  `projects/<id>.webp` at 128 px (the timeline) and `projects/lg/<id>.webp` at 256 px (the
  featured card and the app sheet; the build uses that file when it exists), and `icon` is
  filled in. The files are plain squares: the site rounds the corners in CSS, and the form
  shows both sizes rounded the same way.
- **Project screenshots.** Project → Preview screenshots edits `gallery`. "Choose from
  existing" lists the images under `apps/<name>/assets/` (and `gallery/`, `screenshots/`,
  `images/` inside it); "Upload" resizes each picture to at most 960 px tall and writes it
  twice, as `projects/gallery/<id>/<name>.webp` (the path `gallery` names) and as
  `projects/shots/<id>/<name>.webp` (the file the site shows, which the build would otherwise
  make), so it works without waiting for the build. An app with its own framed set under
  `apps/<name>/assets/screens/` is shown as such: the build uses that set and ignores
  `gallery`.
- **Preview.** The live site's own page is loaded in a same-origin `<iframe>` and the pending
  edits are applied to its DOM. The Preview pane lists what it can and cannot show. **Full
  screen** (also offered next to Commit) puts the same frame over the whole window with the
  blue outlines off, so the page looks as it will; "Back to editing" or Escape returns.
- **Dry run.** On a local development host only (`localhost`, `127.0.0.1`, `*.localhost`,
  `*.test`) the sign-in card offers a dry run: it reads `../content/*.json` from the same
  origin and, instead of committing, lists the exact requests a commit would send.

## Files

| File | What it is |
|---|---|
| `index.html`, `edit.css` | The page and its styles (tokens copied from `assets/shell.css`) |
| `watermark.png` | The signature drawn onto new photographs |
| `js/main.js` | Sign-in gate, app frame, tabs, settings |
| `js/github.js` | REST client and the dry-run stand-in |
| `js/store.js` | Base files, drafts, pending photos and project files, saving, commit, publish to a branch, rebase |
| `js/db.js` | IndexedDB: image files and saved drafts |
| `js/watermark.js` | Finds the watermark PNG, trims it, places and draws it |
| `js/jsonpatch.js` | Format-preserving JSON patch, three-way merge, line diff |
| `js/validate.js` | Pre-commit checks |
| `js/exif.js`, `js/image.js` | EXIF reader; resize and WebP conversion for photos, icons and screenshots |
| `js/ui.js` | DOM helpers (text is always inserted as text), dialogs, drag-to-reorder |
| `js/views/*.js` | Photos, Projects, Text (+ switches), Resume, Preview, Changes |
| `js/views/picker.js` | The shared media picker |

## How it is wired into the rest of the site

All of this is in place; it is listed so that a change on either side is made on both.

1. **Kept out of listings.** `scripts/build-site.mjs` has `edit` in `skipDir`, so the page is
   not in `search-index.json`, and the build never adds it to `sitemap.xml`. `robots.txt` does
   not disallow it on purpose: a crawler has to be able to read the page's `noindex`.
2. **JPEG uploads from Safari.** Safari's canvas has not been able to encode WebP. The editor
   checks at run time; when it cannot, and Settings → "Upload JPEG when this browser cannot
   write WebP" is on (the default), it commits `slides/bmp-<n>.jpg` (already resized, metadata
   removed) with the `photos.json` entry keyed `bmp-<n>.webp`. The build converts every
   `slides/*.jpg` to WebP with `sharp` and deletes the JPEG before it lists `slides/`, and the
   deploy commits the result (`git add -A slides`). This needs `sharp`, which the deploy
   installs; a local build without it leaves the JPEG where it is.
3. **`taken` and `camera`.** Keys in a `content/photos.json` entry (documented in its `_help`).
   The build uses them for the camera filter and falls back to `content/photo-meta.json`
   (recovered from the originals). The editor reads that file too and shows its value as the
   fallback under each field; typing a value overrides it.
4. **Deleted photographs.** The editor removes `slides/<name>` and its `photos.json` entry; the
   build removes the orphaned `slides/thumbs/<name>` and drops it from the manifest.
5. **Protected photographs.** Any `bmp-<n>.webp` named in `scripts/build-site.mjs` cannot be
   deleted from the editor. If those names move to a content file, tell `js/store.js`
   (`protectedPhotos`) where to look.
6. **Preview hooks.** `js/views/preview.js` relies on this markup from the home page template:
   `data-i18n`, `data-i18n-html`, `data-i18n-attr="attr:key;…"`; `#g a.ph#bmp-<n>` with
   `data-title`, `data-caption`, `.ph__t`, classes `is-feat`, `t-120`, `t-luma`, `t-nova`;
   `details.tl#p-<id>` (`summary strong`, `summary time`, `.tl__body > p`, `.chips`, `a.tl__go`);
   `a.card[data-app]` (`h3`, `.card__tag`); `.jobs article.job`; `.skills dl > div`. If the
   template changes these, the preview silently shows less; update it together.
7. **Deploy.** A commit made with a personal access token triggers the workflow like any push.
   Changed English strings still need translating by hand (the build only reports them).
8. **Documentation.** README → "Editing the site" describes `/edit/`. The editor is
   deliberately not linked from the site.
9. **Project files.** The editor writes `projects/<icon>`, `projects/lg/<id>.webp`,
   `projects/gallery/<id>/*` and `projects/shots/<id>/*` itself. This relies on the build
   using `projects/lg/<id>.webp` and `projects/shots/<id>/<name>.webp` when they already exist
   and on `gallery` paths only having to exist. From a browser that cannot write WebP
   (Safari) the icon is one 256 px JPEG at `projects/<id>.jpg` (no `lg` file, so an older
   `projects/lg/<id>.webp` would still win on the featured card) and a screenshot is a JPEG
   under `projects/gallery/<id>/`, which the build turns into `projects/shots/…` and the
   deploy commits.
10. **Watermark numbers.** `PLACE` in `js/watermark.js`. If the photographs ever change size
    or the signature changes, measure again rather than adjusting by eye.

Not covered by the editor: the framed screenshot sets under `apps/<name>/assets/screens/`
(they come from each app's own tooling), `views.*.cta`, `tints`, `explore`, `social`, `contact`, `bios`, `domains`, and the `private`
block of the resume. They are preserved untouched.

## What has been tested, and what has not

The metadata reader was run against generated files carrying the tags: an iPhone JPEG (with GPS,
serial and owner tags present, none of which came out), a big-endian Canon file needing the crop
calculation (35 mm on full frame → 35), an APS-C file without a recorded pixel width (23 mm →
35 with the decoded width, omitted without it), a Noritsu scan, a DJI file, a file with impossible
dates, XMP + IPTC + ImageDescription together, IPTC only, a HEIC-like container with and without
an Exif block, a truncated file and garbage. In the browser a generated 3000×4000 JPEG carrying
EXIF, GPS and XMP pre-filled all nine fields, and the WebP that would be uploaded contained none
of it.

The additions (watermark, project files, drafts, branches, full screen) were tested in the
browser dry run at 375 px and desktop: two generated photos (4000×3000 and 3000×4000) came
out 2400 px with the signature measuring 22.5% of the long side, 23 px from the right and
14 px from the bottom, which is what the existing 2400 px slides measure; the per-photo switch
removed and restored it; a 1024×768 picture became a 128 px and a 256 px icon from its middle
square; two uploaded screenshots (one 2796 px tall, one with a clashing name) came out 960 px
tall and renamed; choosing from the existing gallery images, and the framed-set notice for an
app that has one; the request list for a commit and for publishing to a branch (ending in
`POST /git/refs`); the full-screen preview with the new photos and the new icon in the page;
a reload restoring every picture; the close-of-page copy in `localStorage` being picked up;
creating, renaming, duplicating (own copies of the pictures), switching and deleting drafts.
Publishing twice to one branch, and the "already merged" clean-up, were run against a
stand-in client that records calls instead of sending them.

The media picker was tested the same way at 375 px and desktop: 184 photographs listed,
search ("luma" → 48), the Luma filter (50), arrow keys moving the highlight and the large
preview following it, Space and Enter ticking, the full-size view, featuring a photo, adding
a hero photograph, choosing an existing icon with Enter, choosing screenshots by folder, and
uploading through the Upload tab (a screenshot, and a photograph that came out watermarked
at 2400 px with the mark 23 px and 14 px in and its strokes peaking at 225). Not tested with
a real screen reader, on a real touch screen, or with drag and drop onto the dialog.

Tested in a browser against the local files (dry run), at 360 px and desktop, light and dark:
the sign-in gate (classic and malformed tokens refused, token field cleared, nothing stored,
editor not built), all five editors, WebP conversion and EXIF reading with a generated 4000×3000
JPEG (output 2400×1800, no EXIF left), alt-text and delete validation, keyboard and pointer
reordering, the diff, the request list a commit would send, draft persistence across reloads,
the three-way merge (another session changed `content/site.json` mid-test), and the preview.

**Not tested:** what GitHub's token form actually shows when the prefilled link is opened.
The browser used for testing is not signed in to GitHub, so the link only reached GitHub's
sign-in page (which kept the parameters in its return address). The parameter names are
from GitHub's documentation, read on 2026-11-19.

**Not tested, because it needs a real token:** every call to `api.github.com`. That is: token
verification and whether `permissions.push` reflects a fine-grained token's own permission or
only the owner's role (if it is the latter, a read-only token passes the gate and GitHub refuses
at commit time, with nothing written); reading through the Contents API; creating blobs, trees
and commits; moving the branch; deleting a file through a tree entry with `sha: null`; the
"branch moved" retry against a real branch; committing while offline-then-online; and the JPEG
upload followed by a real deploy (the conversion step itself was run on a scratch copy);
creating a branch with `POST /git/refs` and adding to it; whether a fine-grained token with
only Contents may create a branch (it should: a ref is repository contents); the clean-up
after a pull request is merged, against real blob ids; and how the deploy treats
`projects/gallery/` (nothing lists that folder, so nothing should). Also untested: real
Safari on iOS (where icons and screenshots take the JPEG path), a real phone camera file, the
watermark on real photographs (only flat test frames were used; a white signature will be
faint on a bright corner, as on the existing photos), and IndexedDB limits with many large
drafts on a phone.

## First safe trial

1. On GitHub, create a branch from `main` named `edit-trial` (it is never deployed).
2. Create the fine-grained token as the sign-in card describes.
3. Open `/edit/`, open "Repository and branch", set the branch to `edit-trial`, save, then paste
   the token.
4. Change one string, one photo title, add one photo with alt text (open the full-size link
   and look at the watermark), and delete one unimportant photo. Open **Changes**, read the
   diff, look at **Full-screen preview**, commit.
5. On GitHub, open the commit on `edit-trial`: it should be a single commit containing exactly
   the files listed, with only the changed lines different in the JSON files and the new image
   under `slides/`.
6. Reload the editor (it should show no pending changes), make one more edit and commit again to
   exercise the parent-moved path.
7. Optional: with the editor open, edit a content file on `edit-trial` in GitHub's web editor,
   then commit a different edit from the editor; it should say the repository changed and ask
   you to review, not overwrite.
8. Still on `edit-trial`: replace one project's icon, upload one screenshot, then **Publish to
   a separate branch**. On GitHub there should be a new branch one commit ahead of
   `edit-trial`, and the link should open a pull request into `edit-trial`. Merge it, reload
   the editor: the draft should show nothing pending.
9. If all of that is right: Settings → branch `main` → Save and reload. Delete `edit-trial`
   and the draft branch.
