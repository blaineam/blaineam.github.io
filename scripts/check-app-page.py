#!/usr/bin/env python3
"""Pre-commit checks for an app page against docs/app-page-design.md.

    python3 scripts/check-app-page.py scripture-alone            # the landing page
    python3 scripts/check-app-page.py enter-space/pricing        # one depth page
    python3 scripts/check-app-page.py --all                      # every landing + depth page

An app has one LANDING page (apps/<slug>/index.html — the funnel) and optional DEPTH pages
(apps/<slug>/{features,pricing,faq}/index.html — the detail). Both get the hard checks; only
the landing page gets the funnel's copy budget, because grids, tables, long lists and long
answers are what depth pages are for.

Hard failures (exit 1), every page:
  * the 9 dictionaries i18n/apps.<slug>[.<sub>].<lang>.json don't share one key set, or a
    data-i18n / data-i18n-html / data-i18n-attr key in the page is missing from them
  * an <img> without width and height, or a below-the-hero <img> without loading="lazy"
  * an <img data-i18n-src> whose English files aren't in its screens manifest
  * no App Store / Play link (or `data-cta` anchor, for pages with no store listing) at the
    end of the page (between </main> and the footer)
  * landing page: none in the hero either; depth page: none in the app's nav bar

Warnings, every page:
  * the app has depth pages but this page's nav doesn't link to all of them (and to the
    overview, from a depth page), or a depth page doesn't mark itself aria-current="page"
  * faq/: the last question isn't the EU availability item; pricing/: no price on the page
  * landing page with a faq/ page: no link from the FAQ teaser to it

Warnings (printed, exit 0), landing page only — the spec's copy budget:
  * more than 5 story sections (<section> inside <main>)
  * a paragraph outside the FAQ and footer over 40 words (CJK: ~2 chars per word)
  * a <ul>/<ol> with more than 4 items outside nav/footer/FAQ (a bullet wall)
  * a grid of 3+ sibling cards with a heading each (a feature wall)
  * more than 7 FAQ questions (the rest belong on faq/)
  * a web font (Google Fonts link or @font-face), except on the pages in
    WEBFONT_EXCEPTIONS (docs/app-page-design.md §3 documents each one) — every page
"""

from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ["en", "zh-Hans", "ja", "de", "fr", "es", "ko", "pt-BR", "it"]
MIRRORED = {"haven", "blip", "glint", "lathe"}
DEPTH_PAGES = ("features", "pricing", "faq")
# Pages whose typefaces ARE the identity; see docs/app-page-design.md §3 "Exceptions".
WEBFONT_EXCEPTIONS = {"revela"}
WEBFONT = re.compile(r"fonts\.googleapis\.com|fonts\.gstatic\.com|@font-face")
STORE = re.compile(r"apps\.apple\.com|play\.google\.com/store")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
        "param", "source", "track", "wbr"}


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children: list[Node] = []
        self.text: list[str] = []

    def ancestors(self):
        n = self.parent
        while n:
            yield n
            n = n.parent

    def inside(self, pred) -> bool:
        return any(pred(a) for a in self.ancestors())

    def all_text(self) -> str:
        out = list(self.text)
        for c in self.children:
            out.append(c.all_text())
        return " ".join(out)

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.text.append(data)


def words(text: str) -> int:
    cjk = len(re.findall(r"[぀-ヿ㐀-鿿가-힯]", text))
    latin = len(re.findall(r"[A-Za-zÀ-ÿ0-9’'-]+", text))
    return latin + cjk // 2


def classes(n: Node) -> set[str]:
    return set((n.attrs.get("class") or "").split())


def depth_pages(slug: str) -> list[str]:
    return [sub for sub in DEPTH_PAGES if (ROOT / "apps" / slug / sub / "index.html").is_file()]


def check(target: str) -> int:
    slug, _, sub = target.strip("/").partition("/")
    if sub and sub not in DEPTH_PAGES:
        print(f"{target}: not a depth page ({', '.join(DEPTH_PAGES)}) — not checked")
        return 0
    page = ROOT / "apps" / slug / (f"{sub}/index.html" if sub else "index.html")
    dict_id = f"apps.{slug}.{sub}" if sub else f"apps.{slug}"
    page_label = target.strip("/")
    if slug in MIRRORED:
        print(f"{slug}: mirrored — check it in its source repo")
        return 0
    if not page.is_file():
        print(f"  ✗ {page_label}: {page.relative_to(ROOT)} doesn't exist")
        return 1
    siblings = depth_pages(slug)
    src = page.read_text(encoding="utf-8")
    tree = Tree()
    tree.feed(src)
    nodes = list(tree.root.walk())
    errors: list[str] = []
    warns: list[str] = []

    # --- i18n parity ---------------------------------------------------------------------
    dicts = {}
    for lang in LANGS:
        p = ROOT / "i18n" / f"{dict_id}.{lang}.json"
        if not p.is_file():
            errors.append(f"missing dictionary {p.name}")
            continue
        dicts[lang] = json.loads(p.read_text(encoding="utf-8"))
    if "en" in dicts:
        base = set(dicts["en"])
        for lang, d in dicts.items():
            extra, missing = set(d) - base, base - set(d)
            if extra or missing:
                errors.append(f"{lang}: {len(missing)} keys missing, {len(extra)} extra vs en "
                              f"(e.g. {sorted(missing or extra)[:3]})")
        used = set(re.findall(r'data-i18n(?:-html)?="([^"]+)"', src))
        for pairs in re.findall(r'data-i18n-attr="([^"]+)"', src):
            used |= {p.split(":", 1)[1].strip() for p in pairs.split(";") if ":" in p}
        for key in sorted(used - base):
            errors.append(f"page uses key {key} that isn't in the dictionaries "
                          "(run scripts/i18n-tag.py, then patch the 8 translations)")

    # --- images --------------------------------------------------------------------------
    hero = next((n for n in nodes if n.tag == "header" or "hero" in " ".join(classes(n))
                 or "dp-header" in classes(n)), None)
    in_hero = set(id(n) for n in hero.walk()) if hero else set()
    manifests: dict[Path, dict] = {}
    for n in nodes:
        if n.tag != "img":
            continue
        a = n.attrs
        label = a.get("src", "?")[:60]
        if n.inside(lambda x: x.tag in ("nav", "footer")):
            continue
        if not a.get("width") or not a.get("height"):
            errors.append(f"<img {label}> has no width/height (layout shift)")
        if id(n) not in in_hero and a.get("loading") != "lazy" and "sa-share" not in str(a):
            errors.append(f"<img {label}> below the hero isn't loading=\"lazy\"")
        if "data-i18n-src" in a:
            urls = [a.get("src", "")] + [c.strip().split()[0] for c in a.get("srcset", "").split(",") if c.strip()]
            for url in filter(None, urls):
                bare = url.split("?")[0]
                if "/screens/en/" not in "/" + bare:
                    errors.append(f"data-i18n-src image {bare} isn't under screens/en/")
                    continue
                head, rest = ("/" + bare).split("/screens/en/", 1)
                mpath = (page.parent / head.lstrip("/") / "screens/manifest.json").resolve()
                if mpath not in manifests:
                    manifests[mpath] = json.loads(mpath.read_text()) if mpath.is_file() else {}
                if f"en/{rest}" not in manifests[mpath].get("files", {}):
                    errors.append(f"{bare} not in {mpath.relative_to(ROOT)} — run scripts/sync-app-screens.py")

    # --- CTA at hero and at the end ------------------------------------------------------
    # A store link, or — for a page with no store listing (a shelved app, a direct
    # download) — an anchor the page marks as its primary download with `data-cta`.
    links = [n for n in nodes if n.tag == "a"
             and (STORE.search(n.attrs.get("href", "")) or "data-cta" in n.attrs)]
    main = next((n for n in nodes if n.tag == "main"), None)
    nav = next((n for n in nodes if n.tag == "nav"), None)
    if sub:
        if not nav or not any(l.inside(lambda x: x is nav) for l in links):
            errors.append("no App Store / Play link in the nav bar (a depth page's first CTA)")
    elif hero and not any(id(l) in in_hero for l in links):
        errors.append("no App Store / Play link in the hero")
    footer = next((n for n in nodes if n.tag == "footer"), None)
    if main:
        after_main = False
        tail_has_cta = False
        for n in tree.root.walk():
            if n is main:
                after_main = True
                continue
            if after_main and n is footer:
                break
            if after_main and n in links and not n.inside(lambda x: x is main) \
                    and "floating-appstore" not in classes(n):
                tail_has_cta = True
        if not tail_has_cta:
            errors.append("no download link between </main> and the footer (the closing CTA)")

    # --- the app's pages link to each other ----------------------------------------------
    if siblings and nav:
        hrefs = {n.attrs.get("href", "").rstrip("/").split("/")[-1] or ".."
                 for n in nav.walk() if n.tag == "a"}
        for other in siblings:
            if other != sub and other not in hrefs:
                warns.append(f"nav doesn't link to {other}/ (the app's sub-nav lists every page)")
        if sub and ".." not in hrefs:
            warns.append("nav doesn't link back to the overview (../)")
        if sub and not any(n.attrs.get("aria-current") == "page" for n in nav.walk()):
            warns.append('nav doesn\'t mark this page aria-current="page"')
    faq_items = [n for n in nodes if "faq-item" in classes(n)]
    if sub == "faq" and faq_items:
        last = " ".join(faq_items[-1].all_text().split())
        if "European Union" not in last:
            warns.append("the last FAQ item isn't the EU availability question (§6)")
    if sub == "pricing" and not re.search(r"[$€£¥]\s?\d", src):
        warns.append("no price on the pricing page")
    if not sub and "faq" in siblings and "faq/" not in src:
        warns.append("the FAQ teaser doesn't link to faq/ (\"See all questions →\")")

    if sub:  # depth pages: grids, tables, long lists and long answers are the point
        if slug not in WEBFONT_EXCEPTIONS and WEBFONT.search(src):
            warns.append("loads a web font (spec: none)")
        return report(page_label, errors, warns)

    # --- copy budget (warnings) ----------------------------------------------------------
    if len(faq_items) > 7:
        warns.append(f"{len(faq_items)} FAQ questions on the landing page (spec: ≤ 7; the rest go on faq/)")
    if main:
        stories = [c for c in main.children if c.tag == "section"]
        if len(stories) > 5:
            warns.append(f"{len(stories)} story sections in <main> (spec: 3–5)")
    skip = lambda x: x.tag in ("nav", "footer") or "faq" in (x.attrs.get("class") or "") \
        or x.attrs.get("id") in ("faq", "shared-verse")
    for n in nodes:
        if n.tag == "p" and not n.inside(skip) and "faq" not in (n.attrs.get("class") or ""):
            count = words(n.all_text())
            if count > 40:
                warns.append(f"{count}-word paragraph: “{' '.join(n.all_text().split())[:70]}…”")
        if n.tag in ("ul", "ol") and not n.inside(skip):
            items = [c for c in n.children if c.tag == "li"]
            if len(items) > 4:
                warns.append(f"<{n.tag}> with {len(items)} items — a bullet wall?")
        kids = [c for c in n.children if c.tag in ("div", "article", "li")]
        carded = [c for c in kids if any(g.tag in ("h3", "h4") for g in c.walk())]
        if len(carded) >= 3 and not n.inside(skip) and n.tag != "#root":
            warns.append(f"{len(carded)} sibling cards with headings in "
                         f"<{n.tag} class=\"{n.attrs.get('class', '')}\"> — a feature wall?")
    if slug not in WEBFONT_EXCEPTIONS and WEBFONT.search(src):
        warns.append("loads a web font (spec: none; add to WEBFONT_EXCEPTIONS + document it "
                     "in docs/app-page-design.md §3 only if the face is the app's identity)")

    return report(page_label, errors, warns)


def report(label: str, errors: list[str], warns: list[str]) -> int:
    for e in errors:
        print(f"  ✗ {label}: {e}")
    for w in warns:
        print(f"  ! {label}: {w}")
    if not errors and not warns:
        print(f"  ✓ {label}")
    elif not errors:
        print(f"  ✓ {label} (warnings only)")
    return 1 if errors else 0


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    slugs = argv
    if argv == ["--all"]:
        apps = sorted(p.parent.name for p in (ROOT / "apps").glob("*/index.html")
                      if p.parent.name not in MIRRORED and not p.parent.name.startswith("_"))
        slugs = [t for a in apps for t in [a] + [f"{a}/{sub}" for sub in depth_pages(a)]]
    return max(check(s) for s in slugs)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
