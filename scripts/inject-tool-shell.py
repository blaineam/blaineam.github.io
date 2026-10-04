#!/usr/bin/env python3
"""Fit the web apps mirrored under /tools/<slug>/app/ into their marketing pages.

tools/tom/app/ is rsynced from Tom's own repo (mirror-app-docs.yml), so nothing
committed into it here survives the next mirror. Right after the sync this adds
one small inline script before </body> of the app's page. It:

  * remembers that this visitor has entered the app (localStorage
    `tools.<slug>.entered`), so the marketing page at /tools/<slug>/ sends
    returning visitors straight into the app;
  * adds an "About <Name>" link back to that page (`../?about`, which the
    marketing page never redirects away from) next to the app's GitHub link.

The link is built at runtime on purpose: Tom's service worker crawls the
page's literal src/href attributes when it installs, and a literal link to the
portfolio would have it crawl the whole site.

Idempotent: a page that already carries the marker is left alone.

Usage: scripts/inject-tool-shell.py [slug ...]   (default: tom)
"""
import pathlib
import sys

MARKER = "data-tools-shell"
APPS = {
    # slug: (display name, CSS selector of the element the link goes after)
    "tom": ("Tom", 'footer a[href*="github.com/blaineam/Tom"]'),
}

SCRIPT = """<script {marker}>
  /* Added by the portfolio's mirror (scripts/inject-tool-shell.py). */
  (function () {{
    try {{ localStorage.setItem('tools.{slug}.entered', '1'); }} catch (e) {{}}
    function add() {{
      var anchor = document.querySelector('{selector}');
      var link = document.createElement('a');
      link.href = '../?about';
      link.textContent = 'About {name}';
      if (anchor && anchor.parentNode) {{
        anchor.parentNode.insertBefore(link, anchor.nextSibling);
        anchor.parentNode.insertBefore(document.createTextNode(' \\u00b7 '), link);
      }}
    }}
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  }})();
</script>
"""


def inject(path: pathlib.Path, slug: str, name: str, selector: str) -> bool:
    html = path.read_text(encoding="utf-8")
    if MARKER in html:
        return False
    index = html.rfind("</body>")
    if index == -1:
        return False
    tag = SCRIPT.format(marker=MARKER, slug=slug, name=name, selector=selector)
    path.write_text(html[:index] + tag + html[index:], encoding="utf-8")
    return True


def main(slugs: list[str]) -> int:
    root = pathlib.Path(__file__).resolve().parents[1]
    for slug in slugs:
        name, selector = APPS[slug]
        page = root / "tools" / slug / "app" / "index.html"
        if not page.is_file():
            print(f"  {slug}: not mirrored here yet")
            continue
        print(f"  {slug}: {'shell added' if inject(page, slug, name, selector) else 'already has the shell'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:] or list(APPS)))
