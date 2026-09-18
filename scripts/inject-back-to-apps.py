#!/usr/bin/env python3
"""Add the back-to-apps pill to the app sites this repo mirrors.

The sites under apps/blip, apps/glint, apps/haven and apps/lathe are rsynced
from each app's own repo, so nothing committed into them here survives the
next mirror. The mirror workflow runs this immediately after the sync, which
puts one script tag before </body> on every page: apps/_shared/back-to-apps.js
draws a small pill with the app's icon and name, linking back to /apps/.

Idempotent — a page that already references the script is left alone.

Usage: scripts/inject-back-to-apps.py [slug ...]   (default: the mirrored four)
"""
import pathlib
import sys

TAG = '<script defer src="/apps/_shared/back-to-apps.js"></script>'
DEFAULT_SLUGS = ["blip", "glint", "haven", "lathe"]


def inject(path: pathlib.Path) -> bool:
    html = path.read_text(encoding="utf-8", errors="strict")
    if "back-to-apps.js" in html:
        return False
    index = html.rfind("</body>")
    if index == -1:
        return False
    path.write_text(html[:index] + "  " + TAG + "\n" + html[index:], encoding="utf-8")
    return True


def main(slugs: list[str]) -> int:
    root = pathlib.Path(__file__).resolve().parents[1]
    touched = 0
    for slug in slugs:
        directory = root / "apps" / slug
        if not directory.is_dir():
            print(f"  {slug}: not mirrored here yet")
            continue
        pages = sorted(directory.rglob("*.html"))
        added = sum(inject(page) for page in pages)
        touched += added
        print(f"  {slug}: {added} of {len(pages)} page(s) given the pill")
    print(f"{touched} page(s) changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:] or DEFAULT_SLUGS))
