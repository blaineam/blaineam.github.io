#!/usr/bin/env python3
"""Render each app page's device frames in every language the app has screenshots for.

The pages show the app in transparent Monkr device frames. The App Store screenshots are
captured per locale by each app's capture rig — English at the capture dir's root, the other
eight in ASC-locale subdirectories beside it:

    <app repo>/screenshots/iphone-6.9/01-reader.png          (en-US)
    <app repo>/screenshots/iphone-6.9/ja/01-reader.png
    <app repo>/screenshots/iphone-6.9/de-DE/01-reader.png …

This script frames those raw captures through the app's transparent web Monkr project (the same
one scripts/render-site-frames.py uses: store frame, no gradient, no store caption — the page says
it in its own type), trims the canvas, and writes WebP at the page's 1x and 2x widths:

    apps/<slug>/assets/screens/<lang>/<scene>-<width>.webp
    apps/<slug>/assets/screens/manifest.json

The manifest lists every file with its content hash. i18n/i18n.js reads it to swap a tagged
<img data-i18n-src> to the visitor's language — or keep English when that locale has no render
yet — without probing for 404s, and uses the hash as the `?v=` cache stamp.

Why not the `framed/` directories: those are the finished App Store panels, with the store's
gradient and headline baked in. On a page they read as an advert pasted into an article.

    python3 scripts/sync-app-screens.py                   # every page in scripts/app-screens.json
    python3 scripts/sync-app-screens.py scripture-alone   # one page
    python3 scripts/sync-app-screens.py scripture-alone --force   # re-render even if unchanged
    python3 scripts/sync-app-screens.py --list            # which app repos have per-locale captures

Idempotent: each output records a hash of its inputs (capture bytes, Monkr project, widths) in
the manifest, and is only re-rendered when that changes. Re-running after an app's localized
screenshot sweep lands just adds the new locales. English is required for every scene (it is the
baked-in fallback); a locale missing a scene simply isn't listed for it.

Mirrored pages (apps/haven, apps/blip, apps/glint, apps/lathe) are rsynced from their own repos
and would be overwritten. Run this from here with `--dest <that repo's docs dir>/assets/screens`
and commit the output in the app repo instead; the mirror carries it over.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

SITE = pathlib.Path(__file__).resolve().parents[1]
APPS = pathlib.Path.home() / "Documents/mine/Personal/Apps"
CONFIG = SITE / "scripts/app-screens.json"
MONKR = pathlib.Path.home() / "Documents/scripts/monkr/bin/monkr.mjs"
MIRRORED = {"haven", "blip", "glint", "lathe"}

# App Store Connect locale directory → the site's language code (i18n/i18n.js LANGS).
ASC_TO_SITE = {
    "zh-Hans": "zh-Hans", "ja": "ja", "de-DE": "de", "fr-FR": "fr", "es-ES": "es",
    "ko": "ko", "pt-BR": "pt-BR", "it": "it",
}
SITE_LANGS = ["en", *ASC_TO_SITE.values()]

WEBP_QUALITY = 82


def _frames_module():
    """scripts/render-site-frames.py, for its transparent-project and alpha-crop helpers."""
    path = SITE / "scripts/render-site-frames.py"
    spec = importlib.util.spec_from_file_location("render_site_frames", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


FRAMES = _frames_module()


def sha(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def capture_dirs(captures: pathlib.Path) -> dict[str, pathlib.Path]:
    """{site lang: dir of raw captures} for every locale present."""
    found = {"en": captures}
    for asc, lang in ASC_TO_SITE.items():
        d = captures / asc
        if d.is_dir() and any(d.glob("*.png")):
            found[lang] = d
    return found


def find_scene(directory: pathlib.Path, scene: str) -> pathlib.Path | None:
    exact = directory / f"{scene}.png"
    if exact.is_file():
        return exact
    # Captures are sometimes renumbered; fall back to a unique substring match.
    matches = [p for p in sorted(directory.glob("*.png")) if scene in p.stem]
    return matches[0] if len(matches) == 1 else None


def webp_bytes(image: Image.Image, width: int) -> bytes:
    height = round(image.height * width / image.width)
    resized = image.resize((width, height), Image.LANCZOS) if width != image.width else image
    buffer = io.BytesIO()
    resized.save(buffer, "WEBP", quality=WEBP_QUALITY, method=6, alpha_quality=90)
    return buffer.getvalue()


def monkr_render(project: pathlib.Path, shots: list[pathlib.Path], out: pathlib.Path,
                 scale: int | None) -> list[pathlib.Path]:
    command = ["node", str(MONKR), "render", str(project), "--out", str(out),
               "--screenshots", *[str(p) for p in shots]]
    if scale:
        command += ["--scale", str(scale)]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(result.stdout + result.stderr)
        raise SystemExit(f"monkr render failed for {project.name}")
    # Monkr names each output after its screenshot's stem. Match on that, never on list order:
    # a glob comes back sorted, the page's scene order usually isn't.
    framed = [out / f"{shot.stem}.png" for shot in shots]
    missing = [p.name for p in framed if not p.is_file()]
    if missing:
        raise SystemExit(f"{project.name}: Monkr wrote no {', '.join(missing)} "
                         f"(got {', '.join(sorted(p.name for p in out.glob('*.png')))})")
    return framed


def named_project(path: pathlib.Path, scratch: pathlib.Path) -> pathlib.Path:
    """A `"project"` override, stripped to a transparent, caption-free frame like the default.

    The override exists for projects whose names don't follow the *-<device>.monkr pattern
    (Ridgeshot-iPhone.monkr, Pineline-ipad.monkr). Those are App Store projects: used as-is
    they would bake the store gradient and headline into the page render.
    """
    if not path.is_file():
        raise SystemExit(f"no Monkr project {path}")
    if "-web-" in path.name:
        return path
    project = json.loads(path.read_text())
    project["background"] = {
        "type": "transparent", "solidColor": "#000000",
        "gradientCss": None, "gradientName": None, "imageUrl": None,
    }
    project["textOverlay"] = None
    project["textBlocks"] = []
    made = scratch / f"web-{path.stem}.monkr"
    made.write_text(json.dumps(project, indent=2))
    return made


def sync_page(slug: str, page: dict, dest: pathlib.Path, app_dir: pathlib.Path,
              force: bool) -> dict:
    manifest_path = dest / "manifest.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.is_file() else {}
    files: dict[str, str] = dict(previous.get("files", {}))
    inputs: dict[str, str] = dict(previous.get("inputs", {}))
    sizes: dict[str, list[int]] = dict(previous.get("sizes", {}))
    written = skipped = 0

    for render in page["renders"]:
        device = render["device"]
        captures = app_dir / render["captures"]
        if not captures.is_dir():
            raise SystemExit(f"{slug}: no capture dir {captures}")
        widths = sorted(render["widths"])
        scale = render.get("scale")
        locales = capture_dirs(captures)

        with tempfile.TemporaryDirectory() as temporary:
            scratch = pathlib.Path(temporary)
            project = named_project(app_dir / render["project"], scratch) if render.get("project") \
                else FRAMES.transparent_project(app_dir, device, scratch)
            project_hash = sha(project.read_bytes())

            for lang, directory in locales.items():
                todo: list[tuple[str, pathlib.Path, str]] = []
                for scene in render["scenes"]:
                    shot = find_scene(directory, scene)
                    if shot is None:
                        if lang == "en":
                            raise SystemExit(f"{slug}: English capture for '{scene}' "
                                             f"missing in {directory}")
                        continue
                    if FRAMES.is_framed(shot):
                        raise SystemExit(f"{slug}: {shot} already has a transparent surround "
                                         "— it is a framed render, not a capture")
                    key = f"{lang}/{scene}"
                    fingerprint = sha(shot.read_bytes() + project_hash.encode()
                                      + json.dumps([widths, scale]).encode())
                    outputs = [dest / lang / f"{scene}-{w}.webp" for w in widths]
                    if (not force and inputs.get(key) == fingerprint
                            and all(p.is_file() for p in outputs)):
                        skipped += 1
                        continue
                    todo.append((scene, shot, fingerprint))
                if not todo:
                    continue

                out = scratch / f"out-{device}-{lang}"
                out.mkdir()
                framed = monkr_render(project, [s for _, s, _ in todo], out, scale)
                (dest / lang).mkdir(parents=True, exist_ok=True)
                for (scene, _shot, fingerprint), png in zip(todo, framed):
                    with Image.open(png) as image:
                        image = image.convert("RGBA")
                        box = image.getbbox()
                        if box:
                            image = image.crop(box)
                        for w in widths:
                            if w > image.width:
                                raise SystemExit(f"{slug}: {scene} is {image.width}px wide, "
                                                 f"can't make {w}px — lower the width or raise scale")
                            data = webp_bytes(image, w)
                            name = f"{lang}/{scene}-{w}.webp"
                            (dest / name).write_bytes(data)
                            files[name] = sha(data)[:8]
                        big = widths[-1]
                        sizes[scene] = [big, round(image.height * big / image.width)]
                    inputs[f"{lang}/{scene}"] = fingerprint
                    written += 1
                    print(f"  ✓ {slug} {lang:7} {scene}")

    manifest = {
        "_comment": "Written by scripts/sync-app-screens.py; read by i18n/i18n.js. "
                    "files: <lang>/<name> → content hash (the ?v= stamp). "
                    "sizes: <scene> → [width, height] of the largest file, for the img tag.",
        "langs": sorted({k.split("/", 1)[0] for k in files}, key=SITE_LANGS.index),
        "files": dict(sorted(files.items())),
        "sizes": dict(sorted(sizes.items())),
        "inputs": dict(sorted(inputs.items())),
    }
    text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    if not manifest_path.is_file() or manifest_path.read_text() != text:
        dest.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(text)
    total = sum(p.stat().st_size for p in dest.rglob("*.webp"))
    print(f"{slug}: {written} rendered, {skipped} unchanged; "
          f"{len(files)} files, {total / 1024:.0f} KB across {', '.join(manifest['langs'])}")
    return manifest


def list_availability() -> None:
    """Which app repos have per-locale raw captures, per device."""
    for screenshots in sorted(APPS.glob("**/screenshots")):
        if any(part in {"worktrees", "node_modules", "Archived", "Scratch", "Marketing"}
               for part in screenshots.parts):
            continue
        for device in sorted(p for p in screenshots.iterdir() if p.is_dir()):
            if not any(device.glob("*.png")):
                continue
            langs = sorted(capture_dirs(device), key=SITE_LANGS.index)
            print(f"{len(langs)}/9  {device.relative_to(APPS)}  [{' '.join(langs)}]")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("slugs", nargs="*", help="pages to sync; default: all configured")
    parser.add_argument("--force", action="store_true", help="re-render even when unchanged")
    parser.add_argument("--dest", type=pathlib.Path,
                        help="output dir (…/assets/screens); required for mirrored pages")
    parser.add_argument("--app-dir", type=pathlib.Path, help="override the configured app repo")
    parser.add_argument("--list", action="store_true",
                        help="show which app repos have per-locale captures, then exit")
    args = parser.parse_args(argv)

    if args.list:
        list_availability()
        return 0
    if not shutil.which("node") or not MONKR.is_file():
        raise SystemExit(f"needs node and Monkr at {MONKR}")

    config = {k: v for k, v in json.loads(CONFIG.read_text()).items() if not k.startswith("_")}
    slugs = args.slugs or list(config)
    if (args.dest or args.app_dir) and len(slugs) != 1:
        raise SystemExit("--dest/--app-dir take exactly one slug")

    stamped = []
    for slug in slugs:
        if slug not in config:
            raise SystemExit(f"{slug}: not in {CONFIG.relative_to(SITE)}")
        if slug in MIRRORED and not args.dest:
            raise SystemExit(f"{slug} is mirrored from its own repo — pass --dest "
                             "<that repo's docs dir>/assets/screens and commit it there")
        page = config[slug]
        app_dir = (args.app_dir or APPS / page["repo"]).expanduser()
        dest = (args.dest or SITE / "apps" / slug / "assets/screens").expanduser().resolve()
        sync_page(slug, page, dest, app_dir, args.force)
        try:
            dest.relative_to(SITE)
            stamped.append(f"apps/{slug}")
        except ValueError:
            pass

    # English src/srcset in the pages carry ?v= stamps of their own.
    for scope in stamped:
        subprocess.run([sys.executable, str(SITE / "scripts/cache-bust.py"), scope], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
