#!/usr/bin/env python3
"""Stamp local image URLs with a content hash, so a changed image reaches people.

GitHub Pages serves assets with a long cache lifetime, and the filenames never change — so
replacing a screenshot or an app icon leaves everyone who has already visited looking at the old
one, sometimes for weeks. Appending `?v=<hash of the file>` gives the browser a different URL to
fetch whenever, and only whenever, the bytes differ.

Content hash rather than a date or a build number on purpose: re-running this when nothing has
changed rewrites nothing, so the diff stays empty and a stamp never churns for its own sake.

    python3 scripts/cache-bust.py                 # every page
    python3 scripts/cache-bust.py apps/scripture-alone
    python3 scripts/cache-bust.py --check         # exit 1 if any stamp is stale (for CI)

Mirrored app directories are skipped: `mirror-app-docs.yml` rsyncs them from each app's own repo
and would overwrite anything stamped here. Stamp those at the source instead.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Rsynced from the app repos on a schedule; see scripts/../.github/workflows/mirror-app-docs.yml.
MIRRORED = {"apps/haven", "apps/blip", "apps/glint"}

SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".avif"}

# Our own absolute URLs are stamped too. `og:image` is written absolute because scrapers require
# it, and a share card is the worst place to serve a stale image: Facebook, iMessage and Slack all
# cache what they fetched the first time a link was shared, so an unstamped poster can outlive the
# design it was made for.
SITE_ORIGINS = ("https://wemiller.com/", "https://www.wemiller.com/")

# src="…", href="…", content="…" and url(…) — the attribute forms this site actually uses.
ATTRIBUTE = re.compile(r"""(?P<prefix>(?:src|href|content)\s*=\s*["'])(?P<url>[^"'>]+?)(?P<suffix>["'])""")
CSS_URL = re.compile(r"""(?P<prefix>url\(\s*['"]?)(?P<url>[^)'"]+?)(?P<suffix>['"]?\s*\))""")


def is_mirrored(path: Path) -> bool:
    relative = path.relative_to(ROOT).as_posix()
    return any(relative.startswith(f"{d}/") for d in MIRRORED)


def stamp_for(target: Path) -> str:
    return hashlib.sha1(target.read_bytes()).hexdigest()[:8]


def resolve(url: str, page: Path) -> Path | None:
    """The file a URL points at, or None when it isn't a local image we can hash."""
    absolute_here = next((o for o in SITE_ORIGINS if url.startswith(o)), None)
    if absolute_here:
        url = "/" + url[len(absolute_here):]
    elif url.startswith(("http://", "https://", "data:", "//", "mailto:", "#")):
        return None
    bare = url.split("?", 1)[0].split("#", 1)[0]
    if not bare or Path(bare).suffix.lower() not in SUFFIXES:
        return None
    base = ROOT if bare.startswith("/") else page.parent
    candidate = (base / bare.lstrip("/")).resolve()
    if not candidate.is_file():
        return None
    try:
        candidate.relative_to(ROOT)
    except ValueError:
        return None  # escaped the site root; not ours to stamp
    return candidate


def rewrite(text: str, page: Path) -> tuple[str, int]:
    changed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal changed
        url = match.group("url")
        target = resolve(url, page)
        if target is None:
            return match.group(0)
        bare, _, query = url.partition("?")  # the host, if any, stays in `bare`
        # Keep any query the author wrote; only our own v= is ours to replace.
        others = [p for p in query.split("&") if p and not p.startswith("v=")]
        wanted = "&".join([f"v={stamp_for(target)}", *others])
        rebuilt = f"{bare}?{wanted}"
        if rebuilt != url:
            changed += 1
        return f"{match.group('prefix')}{rebuilt}{match.group('suffix')}"

    text = ATTRIBUTE.sub(replace, text)
    text = CSS_URL.sub(replace, text)
    return text, changed


def pages(scope: str | None) -> list[Path]:
    base = ROOT if scope is None else (ROOT / scope)
    if base.is_file():
        return [base]
    found = [p for p in base.rglob("*.html") if not is_mirrored(p)]
    found += [p for p in base.rglob("*.css") if not is_mirrored(p)]
    return sorted(p for p in found if "node_modules" not in p.parts)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("scope", nargs="?", help="a directory or file; default is the whole site")
    parser.add_argument("--check", action="store_true",
                        help="report stale stamps and exit 1 without writing")
    arguments = parser.parse_args(argv)

    stale: list[str] = []
    total = 0
    for page in pages(arguments.scope):
        original = page.read_text(encoding="utf-8")
        updated, changed = rewrite(original, page)
        if changed:
            total += changed
            stale.append(f"{page.relative_to(ROOT)} ({changed})")
            if not arguments.check:
                page.write_text(updated, encoding="utf-8")

    if arguments.check:
        if stale:
            print("Stale image stamps — run scripts/cache-bust.py:")
            for line in stale:
                print(f"  {line}")
            return 1
        print("Every image stamp is current.")
        return 0

    if total:
        print(f"Stamped {total} image URL(s):")
        for line in stale:
            print(f"  {line}")
    else:
        print("Nothing to stamp; every image URL already carries its current hash.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
