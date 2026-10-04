#!/usr/bin/env python3
"""Tag every App Store, Google Play and Microsoft Store link with the page it sits on.

The stores each report where a visitor came from, but only if the link says so, in the store's own
URL parameters. Nothing here tracks anyone: the site and the apps collect nothing, and the stores
only count campaign names they were handed in the URL.

  * App Store (`apps.apple.com/…/id<digits>`) — `pt=<provider token>&ct=<campaign>&mt=8`. App Store
    Connect's App Analytics lists `ct` under Campaigns. Apple ignores `ct` without `pt`, so with no
    token configured the links carry `ct` and `mt` alone, ready for the day it is pasted in.
  * Google Play (`play.google.com/store/apps/details?id=…`) — `referrer=utm_source=…&utm_medium=…
    &utm_campaign=<slug>`, URL-encoded as one parameter; Play Console reports it under acquisition.
  * Microsoft Store (`apps.microsoft.com/…`) — `cid=<campaign>`, Partner Center's custom campaign ID.
    The legacy `/store/detail/<ID>` form becomes `/detail/<ID>`: its redirect drops the query.

The campaign is derived from the page's path (`apps/enter-space/pricing/index.html` →
`wm-enter-space-pricing`, the home page → `wm-home`), so a new page is tagged correctly without
anyone choosing a name. Existing parameters (`?platform=mac`, `l=`, `hl=`) are kept, the store's own
campaign parameters are replaced rather than added a second time, and re-running rewrites nothing:
the output is a function of the page path and `scripts/store-links.json` alone.

    python3 scripts/store-links.py                  # every page, dictionary, projects.json, README
    python3 scripts/store-links.py apps/sami        # one directory
    python3 scripts/store-links.py --check          # exit 1 if any link is untagged or stale (CI)
    python3 scripts/store-links.py --mirrored       # also the mirrored app sites (the workflows)

Mirrored app directories (the same list `cache-bust.py` keeps) are skipped by default, because
`mirror-app-docs.yml` rsyncs them from each app's repo and would overwrite anything written here.
The mirror workflow runs this with `--mirrored` right after its rsync, and the deploy workflow runs it
again before every publish, so those pages are tagged without their source repos knowing.

Text-level rewriting on purpose: JSON dictionaries keep their exact bytes, key order and escaping,
and only the URLs themselves change.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
CONFIG = Path(__file__).resolve().parent / "store-links.json"


def _cache_bust():
    """The mirrored-directory lists live in cache-bust.py; one list, so the two never disagree."""
    spec = importlib.util.spec_from_file_location("cache_bust", Path(__file__).with_name("cache-bust.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_cb = _cache_bust()
# Tom's web app stamps its own asset URLs, but it is still rsynced over by the mirror, so for this
# script it is simply one more mirrored directory.
MIRRORED = set(_cb.MIRRORED) | set(_cb.SELF_STAMPED)

# Files outside HTML that hold store links people end up following.
EXTRA_FILES = ("apps/projects.json", "README.md")

# A URL runs until a quote, angle bracket, whitespace, backslash (a JSON-escaped quote follows),
# backtick or closing parenthesis (Markdown links).
URL_CHARS = r"""[^\s"'<>\\`)]"""
STORE_URL = re.compile(
    rf"https?://(?:apps\.apple\.com|itunes\.apple\.com|play\.google\.com|apps\.microsoft\.com)/{URL_CHARS}*"
)
APPLE_PATH = re.compile(r"^https?://(?:apps|itunes)\.apple\.com/(?:[^?#]*/)?id\d+$")
PLAY_PATH = re.compile(r"^https?://play\.google\.com/store/apps/details$")
MICROSOFT_PATH = re.compile(r"^https?://apps\.microsoft\.com/.+")
# The legacy `/store/detail/[name/]<ID>` form redirects to `/detail/<id>` and drops the query on
# the way, `cid` included, so those links are rewritten to the form the store serves.
MICROSOFT_LEGACY = re.compile(r"^(https?://apps\.microsoft\.com)/store/detail/(?:[^/?#]+/)?([0-9A-Za-z]{12})/?$")
TRAILING_PUNCTUATION = ".,;:!"


def load_config() -> dict:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    token = str(config.get("appStoreProviderToken") or "").strip()
    if token and not token.isdigit():
        raise SystemExit(f"{CONFIG.name}: appStoreProviderToken must be digits (got {token!r})")
    config["appStoreProviderToken"] = token
    return config


def page_path(path: Path) -> str:
    """The site path a file belongs to: `apps/sami/faq/index.html` → `apps/sami/faq`.

    A dictionary belongs to the page it translates: `i18n/apps.sami.faq.de.json` → `apps/sami/faq`,
    `apps/haven/i18n/docs.en.json` → `apps/haven/docs`, `i18n/index.en.json` → the home page."""
    relative = path.relative_to(ROOT).as_posix()
    parts = relative.split("/")
    if len(parts) >= 2 and parts[-2] == "i18n" and relative.endswith(".json"):
        directory = "/".join(parts[:-2])
        page_id = parts[-1].rsplit(".", 2)[0]  # drop "<lang>.json"
        sub = "" if page_id == "index" else page_id.replace(".", "/")
        return "/".join(p for p in (directory, sub) if p)
    if relative.endswith("/index.html") or relative == "index.html":
        return relative[: -len("index.html")].rstrip("/")
    if relative.endswith(".html"):
        return relative[: -len(".html")]
    return relative


def slug_for(path: Path, config: dict) -> str:
    relative = path.relative_to(ROOT).as_posix()
    overrides = config.get("slugOverrides", {})
    if relative in overrides:
        slug = overrides[relative]
    else:
        site_path = page_path(path)
        if site_path in overrides:
            slug = overrides[site_path]
        elif site_path == "":
            slug = "home"
        elif site_path.startswith("apps/"):
            slug = site_path[len("apps/"):]
        else:
            slug = site_path
    slug = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-") or "home"
    prefix = config.get("campaignPrefix", "wm-")
    room = int(config.get("maxCampaignLength", 40)) - len(prefix)
    if len(slug) > room:
        digest = hashlib.sha1(slug.encode("utf-8")).hexdigest()[:4]
        slug = f"{slug[: room - 5].rstrip('-')}-{digest}"
    return slug


def split_url(url: str) -> tuple[str, list[str], str, str]:
    """(base, query parameters, separator, fragment). `&amp;` is kept if the author wrote it."""
    url, hash_mark, fragment = url.partition("#")
    base, _, query = url.partition("?")
    separator = "&amp;" if "&amp;" in query else "&"
    params = [p for p in query.split(separator) if p] if query else []
    return base, params, separator, (hash_mark + fragment)


def without(params: list[str], *names: str) -> list[str]:
    return [p for p in params if p.split("=", 1)[0] not in names]


def tag(url: str, slug: str, config: dict) -> str:
    base, params, separator, fragment = split_url(url)
    prefix = config.get("campaignPrefix", "wm-")
    if APPLE_PATH.match(base):
        params = without(params, "pt", "ct", "mt")
        token = config["appStoreProviderToken"]
        if token:
            params.append(f"pt={token}")
        params += [f"ct={prefix}{slug}", "mt=8"]
    elif PLAY_PATH.match(base):
        if not any(p.startswith("id=") for p in params):
            return url
        referrer = dict(config.get("playReferrer", {}))
        referrer["utm_campaign"] = slug
        value = "&".join(f"{k}={v}" for k, v in referrer.items())
        params = without(params, "referrer") + [f"referrer={quote(value, safe='')}"]
    elif MICROSOFT_PATH.match(base):
        base = MICROSOFT_LEGACY.sub(r"\1/detail/\2", base)
        params = without(params, "cid") + [f"cid={prefix}{slug}"]
    else:
        return url
    return f"{base}?{separator.join(params)}{fragment}"


def rewrite(text: str, slug: str, config: dict) -> tuple[str, int]:
    changed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal changed
        url = match.group(0)
        trailing = ""
        while url and url[-1] in TRAILING_PUNCTUATION:  # prose: "…on the App Store at <url>."
            trailing = url[-1] + trailing
            url = url[:-1]
        tagged = tag(url, slug, config)
        if tagged != url:
            changed += 1
        return tagged + trailing

    return STORE_URL.sub(replace, text), changed


def is_mirrored(path: Path) -> bool:
    relative = path.relative_to(ROOT).as_posix()
    return any(relative.startswith(f"{d}/") for d in MIRRORED)


def files(scope: str | None, include_mirrored: bool) -> list[Path]:
    base = ROOT if scope is None else Path(scope).expanduser()
    if not base.is_absolute():
        base = (Path.cwd() / base) if (Path.cwd() / base).exists() else (ROOT / base)
    base = base.resolve()
    try:
        base.relative_to(ROOT)
    except ValueError:
        raise SystemExit(f"{scope}: outside the site; slugs come from site paths")
    if base.is_file():
        return [base]

    def keep(p: Path) -> bool:
        # .claude/ holds other sessions' worktrees — whole checkouts of this site.
        if "node_modules" in p.parts or ".claude" in p.parts or ".git" in p.parts:
            return False
        return include_mirrored or not is_mirrored(p)

    found = set(base.rglob("*.html"))
    found |= {p for p in base.rglob("*.json") if p.parent.name == "i18n"}
    found |= {ROOT / f for f in EXTRA_FILES if (ROOT / f).is_file()}
    return sorted(p for p in found if keep(p) and (p == base or base in p.parents))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("scope", nargs="*", help="directories or files in this site; default is all of it")
    parser.add_argument("--check", action="store_true", help="report stale links and exit 1 without writing")
    parser.add_argument("--mirrored", action="store_true",
                        help="also tag the mirrored app directories (the workflows, after rsync)")
    arguments = parser.parse_args(argv)
    config = load_config()

    stale: list[str] = []
    total = 0
    for scope in arguments.scope or [None]:
        for path in files(scope, arguments.mirrored):
            original = path.read_bytes().decode("utf-8")  # bytes: keep line endings exactly
            if "apple.com" not in original and "google.com" not in original and "microsoft.com" not in original:
                continue
            updated, changed = rewrite(original, slug_for(path, config), config)
            if not changed:
                continue
            total += changed
            stale.append(f"{path.relative_to(ROOT)} ({changed})")
            if not arguments.check:
                path.write_bytes(updated.encode("utf-8"))

    if arguments.check:
        if stale:
            print("Store links missing their campaign tags — run scripts/store-links.py:")
            print("\n".join(f"  {line}" for line in stale))
            return 1
        print("Every store link carries its campaign tags.")
        return 0
    if total:
        print(f"Tagged {total} store link(s):")
        print("\n".join(f"  {line}" for line in stale))
    else:
        print("Nothing to tag; every store link is current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
