#!/usr/bin/env python3
"""Point the mirrored app sites at their wemiller.com addresses.

apps/blip, apps/glint, apps/haven and apps/lathe are rsynced from each app's own repo, whose
pages may still name the old <slug>.wemiller.com subdomain in canonical, og:url, og:image and
hreflang tags. Those subdomains now only redirect here (each app repo's Pages deploy turns its
pages into redirects), so the mirror rewrites every such URL to https://wemiller.com/apps/<slug>/
and gives any page without a rel=canonical one naming its own address here.

Idempotent. Runs in mirror-app-docs right after the sync, before the cache busters are stamped.

Usage: scripts/canonicalize-mirrored.py [slug ...]   (default: the mirrored four)
"""
import pathlib
import re
import sys

DEFAULT_SLUGS = ["blip", "glint", "haven", "lathe"]
# Portfolio-only pages inside a mirrored folder (protected from the rsync): not the app's site.
SKIP = {"haven": ("app/", "bridge/")}
CANONICAL = re.compile(r"""<link\b[^>]*\brel\s*=\s*["']canonical["']""", re.I)


def page_url(slug: str, rel: str) -> str:
    if rel == "index.html":
        rel = ""
    elif rel.endswith("/index.html"):
        rel = rel[: -len("index.html")]
    return f"https://wemiller.com/apps/{slug}/{rel}"


def fix(slug: str, path: pathlib.Path, rel: str) -> bool:
    html = path.read_text(encoding="utf-8", errors="strict")
    out = html.replace(f"https://{slug}.wemiller.com/", f"https://wemiller.com/apps/{slug}/")
    out = re.sub(rf"https://{slug}\.wemiller\.com(?=[\"'])", f"https://wemiller.com/apps/{slug}/", out)
    if not CANONICAL.search(out):
        index = out.lower().find("</head>")
        if index != -1:
            out = out[:index] + f'<link rel="canonical" href="{page_url(slug, rel)}">\n' + out[index:]
    if out == html:
        return False
    path.write_text(out, encoding="utf-8")
    return True


def main(slugs: list[str]) -> int:
    root = pathlib.Path(__file__).resolve().parents[1]
    for slug in slugs:
        directory = root / "apps" / slug
        if not directory.is_dir():
            print(f"  {slug}: not mirrored here yet")
            continue
        changed = []
        for path in sorted(directory.rglob("*.html")):
            rel = path.relative_to(directory).as_posix()
            if rel.startswith(SKIP.get(slug, ())):
                continue
            if fix(slug, path, rel):
                changed.append(rel)
        print(f"  {slug}: {', '.join(changed) if changed else 'already canonical'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or DEFAULT_SLUGS))
