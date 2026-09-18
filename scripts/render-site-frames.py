#!/usr/bin/env python3
"""Render an app's store screenshots as transparent device frames for its page.

The portfolio pages used to show bare screenshots — a rectangle of app, no
device around it, sitting on the page background. Framed shots read as a
product; bare ones read as a bug report. Monkr already draws the frames for the
App Store, against a gradient; the same project with a transparent background
gives a frame that floats on whatever the page is painted in, light or dark.

    scripts/render-site-frames.py sami --app-dir ~/…/Sami/Sami
    scripts/render-site-frames.py kern --app-dir ~/…/Kern --device ipad

For each screenshot it renders through `<App>-web-<device>.monkr` — creating
that project from the App Store one, background switched to transparent, if it
does not exist yet — crops to the frame's own alpha bounds so the page controls
the spacing rather than Monkr's canvas, and runs pngquant so a page carrying
six of them is still a page worth loading.

Output lands in apps/<slug>/assets/images/frame-<scene>.png. Names are stable,
which matters: the images are served with a year-long max-age, so a changed
picture under an unchanged name is a picture nobody sees. Pass --suffix when
the content changes to write frame-<scene>-<suffix>.png and update the page to
match.
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

MONKR = pathlib.Path.home() / "Documents/scripts/monkr/bin/monkr.mjs"
SITE = pathlib.Path(__file__).resolve().parents[1]


def transparent_project(app_dir: pathlib.Path, device: str,
                        scratch: pathlib.Path) -> pathlib.Path:
    """The app's web frame project, made from its App Store one if needed."""
    shots = app_dir / "docs/appstore-screenshots"
    web = sorted(shots.glob(f"*-web-{device}.monkr"))
    if web:
        return web[0]

    store = sorted(shots.glob(f"*-{device}.monkr"))
    if not store:
        raise SystemExit(f"no {device} .monkr under {shots}")

    project = json.loads(store[0].read_text())
    # Everything about the frame stays; only the ground it stands on changes.
    project["background"] = {
        "type": "transparent", "solidColor": "#000000",
        "gradientCss": None, "gradientName": None, "imageUrl": None,
    }
    # Text written for a store panel ("Every photo, half the size") belongs to
    # the store panel. The page says that in its own words, in its own type.
    project["textOverlay"] = None
    project["textBlocks"] = []

    made = scratch / f"web-{device}.monkr"
    made.write_text(json.dumps(project, indent=2))
    return made


def crop_to_alpha(path: pathlib.Path) -> None:
    """Trim the transparent margin Monkr's canvas leaves around the frame."""
    with Image.open(path) as image:
        image = image.convert("RGBA")
        box = image.getbbox()
        if box and box != (0, 0, image.width, image.height):
            image.crop(box).save(path)


def compress(path: pathlib.Path) -> None:
    subprocess.run(
        ["pngquant", "--force", "--skip-if-larger", "--quality", "70-92",
         "--output", str(path), str(path)],
        check=False)


def render(slug: str, app_dir: pathlib.Path, device: str,
           scenes: list[str], suffix: str) -> int:
    # The input must be a raw capture — a picture of the screen and nothing
    # else. The pictures already on the pages cannot be used: most of them are
    # themselves framed renders, and there is no reliable way to tell. Some
    # carry a transparent surround, which is detectable; others were flattened
    # onto the frame's own gradient and look exactly like a screenshot to
    # everything except an eye. Framing one of those a second time draws a
    # phone inside a phone. So the capture rig's output, or nothing.
    raw = app_dir / "docs/appstore-screenshots" / device / "raw"
    if not raw.is_dir():
        raw = app_dir / "screenshots" / device
    if not raw.is_dir():
        raise SystemExit(
            f"{slug}: no raw captures for {device} under {app_dir} — run that "
            "app's capture rig first. Never feed the page's own images back in: "
            "most are already framed.")
    shots = sorted(raw.glob("*.png"))
    if scenes:
        wanted = []
        for scene in scenes:
            match = [p for p in shots if scene in p.stem]
            if not match:
                raise SystemExit(f"no screenshot matching '{scene}' in {raw}")
            wanted.append(match[0])
        shots = wanted
    if not shots:
        raise SystemExit(f"no screenshots in {raw}")

    # A screenshot that already carries alpha is already a framed render —
    # every page that was done by hand holds those. Framing it again puts a
    # phone inside a phone, which is exactly what it looks like.
    already = [p for p in shots if Image.open(p).mode in ("RGBA", "LA")]
    if already:
        raise SystemExit(
            f"{slug} {device}: {already[0].name} is already framed (it has an "
            "alpha channel) — point this at the app's raw captures instead")

    destination = SITE / "apps" / slug / "assets/images"
    destination.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as temporary:
        scratch = pathlib.Path(temporary)
        project = transparent_project(app_dir, device, scratch)
        out = scratch / "out"
        out.mkdir()
        result = subprocess.run(
            ["node", str(MONKR), "render", str(project), "--out", str(out),
             "--screenshots", *[str(p) for p in shots]],
            capture_output=True, text=True)
        if result.returncode != 0:
            sys.stderr.write(result.stdout + result.stderr)
            raise SystemExit(f"monkr render failed for {slug} {device}")

        framed = sorted(out.glob("*.png"))
        if len(framed) != len(shots):
            raise SystemExit(
                f"{slug} {device}: rendered {len(framed)} of {len(shots)} shots")

        for source, shot in zip(framed, shots):
            scene = shot.stem.split("-", 1)[-1]
            name = f"frame-{scene}{'-' + suffix if suffix else ''}.png"
            target = destination / name
            shutil.copyfile(source, target)
            crop_to_alpha(target)
            compress(target)
            size = target.stat().st_size // 1024
            print(f"  ✓ {slug}/{name}  ({size} KB)")

    return len(shots)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug", help="the page under apps/ to write into")
    parser.add_argument("--app-dir", required=True, type=pathlib.Path,
                        help="the app repo holding docs/appstore-screenshots")
    parser.add_argument("--device", default="iphone",
                        help="iphone, ipad, mac … (matches the .monkr name)")
    parser.add_argument("--scenes", nargs="*", default=[],
                        help="substrings of the shots to use, in page order")
    parser.add_argument("--suffix", default="",
                        help="appended to each name, to defeat the year-long cache")
    args = parser.parse_args()

    count = render(args.slug, args.app_dir.expanduser(), args.device,
                   args.scenes, args.suffix)
    print(f"{count} frame(s) written for {args.slug}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
