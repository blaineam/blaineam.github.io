#!/usr/bin/env python3
"""Rewrite the <div class="footer-links"> block on every /apps/<slug>/index.html
page to the canonical list below. Each page excludes itself (matches existing
convention on most pages; normalizes the outliers like Asteroic that didn't
include themselves, and adds Blip/Glint that previously lived on subdomains).

Pages not in ORDER that still carry the canonical list (CANONICAL_EXTRA) are
rewritten too; pages with a deliberately shorter or reordered footer (BESPOKE)
and the mirrored app dirs (MIRRORED) are never touched.

Usage: update-footers.py [--check]
  --check   report pages whose footer would change and exit 1; write nothing
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / "apps"

# (slug, label) in the order shown in the grid, minus external apps.
ORDER = [
    ("pinline",     "Pinline"),
    ("enter-space", "Enter Space"),
    ("blip",        "Blip"),
    ("ari-helper",  "Ari Helper"),
    ("sami",        "Sami"),
    ("tilebreak",   "Tilebreak"),
    ("mi-speaks",   "Mi Speaks"),
    ("embr",        "Embr"),
    ("deepsi",      "DeepSi"),
    ("luma-editor", "Luma Editor"),
    ("wise-flyer",  "Wise Flyer"),
    ("glint",       "Glint"),
]

# Pages outside the grid order that use the same full list. They are not in
# ORDER, so they never exclude themselves and nobody links to them from here.
CANONICAL_EXTRA = ["aperion", "kern", "ridgeshot", "scripture-alone"]

# Hand-curated footers (shorter lists or their own order). Listed so the
# omission is deliberate, not forgotten; edit these pages by hand.
BESPOKE = ["pano-owl", "sightquick", "tri-add", "zap", "revela", "lathe"]

# Synced from each app's own repo by mirror-app-docs.yml; an edit here is
# overwritten within the hour. Change the source repo instead.
MIRRORED = ["haven", "blip", "glint"]

# Page-specific links appended after the app list. Sami runs on Lathe, so
# its page links there; dropping it would orphan Lathe from the app pages.
PAGE_EXTRAS = {
    "sami": [("lathe", "Lathe")],
}

FOOTER_RE = re.compile(
    r'<div class="footer-links">.*?</div>',
    re.DOTALL,
)


# Site-wide links that follow the app list. The data-i18n keys are the ones
# scripts/i18n-tag.py mints for these exact labels (slug + sha1[:6] of the
# English), so rewriting the block keeps the footer translatable.
SITE_LINKS = [
    ("/privacy/", "Privacy",   "privacy.cf0148"),
    ("/terms/",   "Terms",     "terms.a55a27"),
    ("/support/", "Support",   "support.f32d5a"),
    ("/",         "Portfolio", "portfolio.036b18"),
]


def build_block(self_slug: str) -> str:
    lines = ['<div class="footer-links">',
             '        <a href="../" class="footer-link" data-i18n="all-apps.429449">All Apps</a>']
    for slug, label in ORDER:
        if slug == self_slug:
            continue
        lines.append(f'        <a href="../{slug}/" class="footer-link">{label}</a>')
    for slug, label in PAGE_EXTRAS.get(self_slug, []):
        lines.append(f'        <a href="../{slug}/" class="footer-link">{label}</a>')
    for href, label, key in SITE_LINKS:
        lines.append(f'        <a href="{href}" class="footer-link" data-i18n="{key}">{label}</a>')
    lines.append('      </div>')
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true",
                        help="report footers that would change; write nothing")
    args = parser.parse_args()

    slugs = [slug for slug, _ in ORDER] + CANONICAL_EXTRA
    stale = []
    for slug in slugs:
        if slug in MIRRORED or slug in BESPOKE:
            continue
        html_path = APPS / slug / "index.html"
        if not html_path.exists():
            print(f"skip {slug}: no index.html")
            continue
        html = html_path.read_text()
        new_block = build_block(slug)
        new_html, count = FOOTER_RE.subn(new_block, html, count=1)
        if count == 0:
            print(f"WARN {slug}: no <div class=\"footer-links\"> found")
            continue
        if new_html == html:
            print(f"unchanged {slug}")
        elif args.check:
            stale.append(slug)
            print(f"would update {slug}")
        else:
            html_path.write_text(new_html)
            print(f"updated {slug}")
    return 1 if stale else 0


if __name__ == "__main__":
    sys.exit(main())
