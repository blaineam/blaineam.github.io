#!/usr/bin/env python3
"""Rewrite the <div class="footer-links"> block on every /apps/<slug>/index.html
page to the canonical list below. Each page excludes itself (matches existing
convention on most pages; normalizes the outliers like Asteroic that didn't
include themselves, and adds Blip/Glint that previously lived on subdomains).
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / "apps"

# (slug, label) in the order shown in the grid, minus external apps.
ORDER = [
    ("enter-space", "Enter Space"),
    ("blip",        "Blip"),
    ("ari-helper",  "Ari Helper"),
    ("asteroic",    "Asteroic"),
    ("sami",        "Sami"),
    ("mi-speaks",   "Mi Speaks"),
    ("embr",        "Embr"),
    ("deepsi",      "DeepSi"),
    ("luma-editor", "Luma Editor"),
    ("wise-flyer",  "Wise Flyer"),
    ("glint",       "Glint"),
]

FOOTER_RE = re.compile(
    r'<div class="footer-links">.*?</div>',
    re.DOTALL,
)


def build_block(self_slug: str) -> str:
    lines = ['<div class="footer-links">',
             '        <a href="../" class="footer-link">All Apps</a>']
    for slug, label in ORDER:
        if slug == self_slug:
            continue
        lines.append(f'        <a href="../{slug}/" class="footer-link">{label}</a>')
    lines += [
        '        <a href="/privacy/" class="footer-link">Privacy</a>',
        '        <a href="/terms/" class="footer-link">Terms</a>',
        '        <a href="/" class="footer-link">Portfolio</a>',
        '      </div>',
    ]
    return "\n".join(lines)


def main() -> None:
    slugs = [slug for slug, _ in ORDER]
    for slug in slugs:
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
        if new_html != html:
            html_path.write_text(new_html)
            print(f"updated {slug}")
        else:
            print(f"unchanged {slug}")


if __name__ == "__main__":
    main()
