#!/usr/bin/env python3
"""Stamp local image, script and stylesheet URLs with a content hash, so a change reaches people.

The CDN in front of GitHub Pages serves images, `.js` and `.css` with `cache-control:
max-age=31536000` — a year — and the filenames never change. Replacing a screenshot leaves everyone
who has already visited looking at the old one; worse, an unstamped `<script src="/i18n/i18n.js">`
kept returning visitors on the pre-localized-renders script, so every page showed English device
frames whatever the language. Appending `?v=<hash of the file>` gives the browser a different URL to
fetch whenever, and only whenever, the bytes differ.

Stylesheets are rewritten before the HTML that links them: a CSS file's own `url(…)` stamps change
its bytes, and the page's stamp for that CSS has to be the hash of the rewritten file.

Content hash rather than a date or a build number on purpose: re-running this when nothing has
changed rewrites nothing, so the diff stays empty and a stamp never churns for its own sake.

    python3 scripts/cache-bust.py                 # every page
    python3 scripts/cache-bust.py apps/scripture-alone
    python3 scripts/cache-bust.py --check         # exit 1 if any stamp is stale (for CI)
    python3 scripts/cache-bust.py ~/…/Haven/web   # a mirrored site's SOURCE, outside this repo
    python3 scripts/cache-bust.py --mirrored apps/haven apps/blip   # after the mirror's rsync

Mirrored app directories are skipped by default: `mirror-app-docs.yml` rsyncs them from each app's
own repo and would overwrite anything stamped here. Stamp the source repo (pass its directory), and
the mirror workflow re-runs this with `--mirrored` right after its rsync as a backstop — the stamps
are content hashes, so both give the same answer and the mirror commits nothing extra.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Rsynced from the app repos on a schedule; see scripts/../.github/workflows/mirror-app-docs.yml.
MIRRORED = {"apps/haven", "apps/blip", "apps/glint", "apps/lathe"}

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".avif"}
# Our own scripts and stylesheets: served with the same year-long lifetime as images.
CODE_SUFFIXES = {".js", ".mjs", ".css"}
SUFFIXES = IMAGE_SUFFIXES | CODE_SUFFIXES

# Our own absolute URLs are stamped too. `og:image` is written absolute because scrapers require
# it, and a share card is the worst place to serve a stale image: Facebook, iMessage and Slack all
# cache what they fetched the first time a link was shared, so an unstamped poster can outlive the
# design it was made for.
SITE_ORIGINS = ("https://wemiller.com/", "https://www.wemiller.com/")

# src="…", href="…", content="…" and url(…) — the attribute forms this site actually uses.
ATTRIBUTE = re.compile(r"""(?P<prefix>(?:src|href|content)\s*=\s*["'])(?P<url>[^"'>]+?)(?P<suffix>["'])""")
# srcset="a.webp 400w, b.webp 800w" — a comma-separated list, each URL stamped on its own.
SRCSET = re.compile(r"""(?P<prefix>srcset\s*=\s*["'])(?P<value>[^"'>]+)(?P<suffix>["'])""")
CSS_URL = re.compile(r"""(?P<prefix>url\(\s*['"]?)(?P<url>[^)'"]+?)(?P<suffix>['"]?\s*\))""")


def is_mirrored(path: Path) -> bool:
    relative = path.relative_to(ROOT).as_posix()
    return any(relative.startswith(f"{d}/") for d in MIRRORED)


def stamp_for(target: Path) -> str:
    return hashlib.sha1(target.read_bytes()).hexdigest()[:8]


def resolve(url: str, page: Path, base_dir: Path = ROOT) -> Path | None:
    """The file a URL points at, or None when it isn't a local asset we can hash.

    Root-relative URLs (`/i18n/i18n.js`) always mean this site, even on a mirrored page scanned in
    its source repo; relative ones may resolve inside `base_dir` (that source repo) instead."""
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
    for allowed in {ROOT, base_dir}:
        try:
            candidate.relative_to(allowed)
            return candidate
        except ValueError:
            continue
    return None  # escaped the site root; not ours to stamp


def rewrite(text: str, page: Path, base_dir: Path = ROOT) -> tuple[str, int]:
    changed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal changed
        url = match.group("url")
        target = resolve(url, page, base_dir)
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

    candidate = re.compile(r"(?P<prefix>^|,)(?P<space>\s*)(?P<url>[^\s,]+)")

    def replace_srcset(match: re.Match[str]) -> str:
        def one(m: re.Match[str]) -> str:
            inner = replace(re.match(r"(?P<prefix>)(?P<url>.+)(?P<suffix>)", m.group("url")))
            return f"{m.group('prefix')}{m.group('space')}{inner}"
        value = candidate.sub(one, match.group("value"))
        return f"{match.group('prefix')}{value}{match.group('suffix')}"

    text = SRCSET.sub(replace_srcset, text)
    text = ATTRIBUTE.sub(replace, text)
    text = CSS_URL.sub(replace, text)
    return text, changed


def scope_dir(scope: str | None) -> Path:
    if scope is None:
        return ROOT
    base = Path(scope).expanduser()
    return (base if base.is_absolute() else (Path.cwd() / base)).resolve()


def pages(scope: str | None, include_mirrored: bool = False) -> list[Path]:
    """Stylesheets first, then pages — see the module docstring for why the order matters."""
    base = scope_dir(scope)
    if not base.exists():  # a path relative to the site root rather than the cwd
        base = (ROOT / scope).resolve()
    if base.is_file():
        return [base]

    def keep(p: Path) -> bool:
        # .claude/ holds other sessions' git worktrees — whole checkouts of this site. Walking into
        # them rewrote dozens of files in someone else's working tree.
        if "node_modules" in p.parts or ".claude" in p.parts or ".git" in p.parts:
            return False
        try:
            p.relative_to(ROOT)
        except ValueError:
            return True  # a source repo outside this site; nothing in it is mirrored
        return include_mirrored or not is_mirrored(p)

    sheets = sorted(p for p in base.rglob("*.css") if keep(p))
    html = sorted(p for p in base.rglob("*.html") if keep(p))
    return sheets + html


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("scope", nargs="*",
                        help="directories or files (in this site or a mirrored site's source repo); "
                             "default is the whole site")
    parser.add_argument("--check", action="store_true",
                        help="report stale stamps and exit 1 without writing")
    parser.add_argument("--mirrored", action="store_true",
                        help="also stamp the mirrored app directories (the mirror workflow, after rsync)")
    arguments = parser.parse_args(argv)

    stale: list[str] = []
    total = 0
    for scope in arguments.scope or [None]:
        base = scope_dir(scope)
        base_dir = base if base.is_dir() else ROOT
        for page in pages(scope, arguments.mirrored):
            original = page.read_text(encoding="utf-8")
            updated, changed = rewrite(original, page, base_dir)
            if changed:
                total += changed
                try:
                    label = page.relative_to(ROOT)
                except ValueError:
                    label = page
                stale.append(f"{label} ({changed})")
                if arguments.check:
                    continue
                page.write_text(updated, encoding="utf-8")

    if arguments.check:
        if stale:
            print("Stale asset stamps — run scripts/cache-bust.py:")
            for line in stale:
                print(f"  {line}")
            return 1
        print("Every asset stamp is current.")
        return 0

    if total:
        print(f"Stamped {total} asset URL(s):")
        for line in stale:
            print(f"  {line}")
    else:
        print("Nothing to stamp; every asset URL already carries its current hash.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
