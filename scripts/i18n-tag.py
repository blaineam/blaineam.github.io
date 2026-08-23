#!/usr/bin/env python3
"""Tag user-visible copy in the portfolio's static pages with data-i18n keys
and extract per-page English dictionaries to /i18n/<page>.en.json.

Idempotent: elements that already carry data-i18n* attributes are skipped.
"""
import hashlib
import json
import os
import re
import sys
from html import unescape
from html.parser import HTMLParser

import pathlib
REPO = str(pathlib.Path(__file__).resolve().parents[1])

# (relative html path, page id, canonical url, switcher corner)
PAGES = [
    ("index.html", "index", "https://wemiller.com/", "top-right"),
    ("apps/index.html", "apps", "https://wemiller.com/apps/", "bottom-right"),
    ("support/index.html", "support", "https://wemiller.com/support/", "bottom-right"),
] + [
    (f"apps/{slug}/index.html", f"apps.{slug}", f"https://wemiller.com/apps/{slug}/", "bottom-left")
    for slug in [
        "aperion", "ari-helper", "deepsi", "embr", "enter-space", "luma-editor",
        "mi-speaks", "pano-owl", "pinline", "revela", "ridgeshot", "sami",
        "sightquick", "tilebreak", "tri-add", "wise-flyer", "zap",
    ]
]

LANGS = ["zh-Hans", "ja", "de", "fr", "es", "ko", "pt-BR", "it"]

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}
INLINE = {"a", "strong", "em", "b", "i", "span", "br", "code", "small", "sup",
          "sub", "u", "cite", "time", "wbr"}
UNIT_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "a", "button",
             "span", "div", "cite", "td", "th", "summary", "figcaption", "dt",
             "dd", "blockquote", "time", "strong", "em", "label", "small"}
SKIP_SUBTREE = {"script", "style", "svg", "noscript", "select", "iframe",
                "audio", "video", "template", "head"}

SKIP_EXACT = {s.lower() for s in [
    # glossary / product names that must never be translated; skipping them
    # entirely when they stand alone keeps dictionaries lean.
    "Enter Space", "Haven", "Ari", "Ari Helper", "Sami", "Pano Owl", "Blip",
    "Glint", "Tilebreak", "Tri-Add", "Zap", "Embr", "Mi Speaks", "Revela",
    "Ridgeshot", "SightQuick", "Pinline", "Luma Editor", "Wise Flyer",
    "DeepSi", "Doppel", "Time Portal", "Space Inspector", "Git Mirror",
    "Theater", "rclone", "WebDAV", "SFTP", "SMB", "Samba", "FTP", "S3",
    "FSKit", "Dropbox", "Google Drive", "OneDrive", "pCloud", "Box", "Mega",
    "Backblaze B2", "Azure Files", "Azure Blob Storage",
    "Google Cloud Storage", "Nextcloud", "Seafile", "iPhone", "iPad", "Mac",
    "Apple TV", "Apple Watch", "Apple Silicon", "Finder", "Files",
    "Spotlight", "Time Machine", "Family Sharing", "Game Center",
    "iCloud Keychain", "App Store", "Shortcuts", "App Intents", "QuickLook",
    "Face ID", "Touch ID",
    # extra site-specific proper nouns
    "Blaine Miller", "Aperion", "Asteroic", "Monkr", "GitHub", "LinkedIn",
    "iOS", "iPadOS", "macOS", "watchOS", "visionOS", "Apple", "Swift",
    "SwiftUI", "MOA", "MIL", "TestFlight", "✨ Ari Helper",
]}

WS = re.compile(r"\s+")
TAGS = re.compile(r"<[^>]+>")


def collapse(s):
    return WS.sub(" ", s).strip()


def key_for(value):
    plain = unescape(TAGS.sub(" ", value))
    words = re.findall(r"[a-z0-9]+", plain.lower())[:4]
    slug = "-".join(words)[:36] or "str"
    return slug + "." + hashlib.sha1(value.encode("utf-8")).hexdigest()[:6]


class Node:
    __slots__ = ("tag", "attrs", "start", "open_end", "content_end", "children",
                 "parent")

    def __init__(self, tag, attrs, start, open_end, parent):
        self.tag = tag
        self.attrs = dict(attrs)
        self.start = start
        self.open_end = open_end       # offset just after '>' of start tag
        self.content_end = open_end    # filled by end tag
        self.children = []
        self.parent = parent


class TreeParser(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=True)
        self.src = src
        self.line_offsets = [0]
        for m in re.finditer(r"\n", src):
            self.line_offsets.append(m.end())
        self.roots = []
        self.stack = []
        self.warnings = []

    def _offset(self):
        line, col = self.getpos()
        return self.line_offsets[line - 1] + col

    def _add(self, node):
        if self.stack:
            self.stack[-1].children.append(node)
        else:
            self.roots.append(node)

    def handle_starttag(self, tag, attrs):
        start = self._offset()
        raw = self.get_starttag_text() or ""
        node = Node(tag, attrs, start, start + len(raw), self.stack[-1] if self.stack else None)
        self._add(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        start = self._offset()
        raw = self.get_starttag_text() or ""
        node = Node(tag, attrs, start, start + len(raw), self.stack[-1] if self.stack else None)
        node.content_end = node.open_end
        self._add(node)

    def handle_endtag(self, tag):
        end = self._offset()
        # pop until matching tag; tolerate stray end tags
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i].tag == tag:
                for j in range(len(self.stack) - 1, i - 1, -1):
                    self.stack[j].content_end = end
                    if j > i:
                        self.warnings.append(
                            f"implicitly closed <{self.stack[j].tag}> at </{tag}>")
                del self.stack[i:]
                return
        self.warnings.append(f"stray </{tag}> at offset {end}")


def descendants_inline(node):
    for c in node.children:
        if c.tag not in INLINE:
            return False
        if not descendants_inline(c):
            return False
    return True


def subtree_has_i18n(src, node):
    return "data-i18n" in src[node.start:node.content_end]


def direct_text(src, node):
    parts = []
    pos = node.open_end
    for c in node.children:
        parts.append(src[pos:c.start])
        pos = c.content_end
        # skip past end tag of child (find next '>')
        if c.tag not in VOID and src[pos:pos + 2] == "</":
            gt = src.find(">", pos)
            pos = gt + 1 if gt >= 0 else pos
    parts.append(src[pos:node.content_end])
    return " ".join(parts)


HAS_LETTERS = re.compile(r"[A-Za-z]{2}")


def collect_units(src, node, units):
    if node.tag in SKIP_SUBTREE:
        return
    attrs = node.attrs
    if "data-i18n" in attrs or "data-i18n-html" in attrs:
        # already tagged (previous run): re-extract for the dictionary
        content = src[node.open_end:node.content_end]
        if "data-i18n" in attrs:
            units.append((node, "existing-text", collapse(unescape(content)),
                      attrs["data-i18n"]))
        else:
            units.append((node, "existing-html", collapse(content),
                          attrs["data-i18n-html"]))
        return
    if "data-i18n-attr" in attrs:
        for pair in attrs["data-i18n-attr"].split(";"):
            if ":" not in pair:
                continue
            aname, akey = pair.split(":", 1)
            aval = attrs.get(aname.strip())
            if aval:
                units.append((node, "existing-attr", aval, akey.strip()))
        for c in node.children:
            collect_units(src, c, units)
        return
    if node.tag in UNIT_TAGS:
        content = src[node.open_end:node.content_end]
        if "data-i18n" not in content and descendants_inline(node):
            plain = unescape(TAGS.sub(" ", content))
            if HAS_LETTERS.search(plain) and collapse(plain).lower() not in SKIP_EXACT:
                if node.children:
                    dt = unescape(direct_text(src, node))
                    if HAS_LETTERS.search(dt):
                        units.append((node, "html", collapse(content), None))
                        return
                    # no meaningful direct text → descend into children
                else:
                    units.append((node, "text", collapse(unescape(content)), None))
                    return
    for c in node.children:
        collect_units(src, c, units)


def find_node(nodes, tag):
    for n in nodes:
        if n.tag == tag:
            return n
        r = find_node(n.children, tag)
        if r:
            return r
    return None


def insert_attr(src, node, attr, key):
    """Return (pos, text) edit inserting attribute into node's start tag."""
    raw = src[node.start:node.open_end]
    if raw.endswith("/>"):
        pos = node.open_end - 2
    else:
        pos = node.open_end - 1
    return (pos, f' {attr}="{key}"')


def js_slug(s):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def extract_timeline(src):
    """Pull the timeline project array out of index.html's inline script and
    build dictionary entries for its user-visible strings (dates,
    descriptions, and sentence-like stack tags)."""
    import subprocess
    m = re.search(r"<div class=\"btn-group\"></div>\s*<script>\s*(\[\{.*?\])\s*\.map\(\(item, index\)",
                  src, re.S)
    if not m:
        print("  [error] timeline array not found in index.html")
        sys.exit(1)
    arr_js = m.group(1)
    out = subprocess.run(
        ["node", "-e",
         "const a = eval(process.argv[1]); process.stdout.write(JSON.stringify(a));",
         arr_js],
        capture_output=True, text=True)
    if out.returncode != 0:
        print("  [error] node eval of timeline failed:", out.stderr[:400])
        sys.exit(1)
    items = json.loads(out.stdout)
    d = {}
    for item in items:
        slug = js_slug(item["title"])
        d[f"tl.{slug}.date"] = item["date"]
        d[f"tl.{slug}.desc"] = collapse(item["description"])
        for tag in item.get("stack", []):
            if len(tag) > 24:  # sentence-like award/achievement chips
                d[f"tag.{js_slug(tag)}"] = tag
    print(f"  timeline: {len(items)} projects extracted")
    return d


def process_page(rel, page_id, url, pos_corner):
    path = os.path.join(REPO, rel)
    src = open(path, encoding="utf-8").read()
    parser = TreeParser(src)
    parser.feed(src)
    parser.close()
    for w in parser.warnings:
        print(f"  [warn] {rel}: {w}")

    body = find_node(parser.roots, "body")
    if body is None:
        print(f"  [error] {rel}: no <body>")
        return None

    units = []
    collect_units(src, body, units)

    dictionary = {}
    edits = []
    for node, kind, value, existing_key in units:
        k = existing_key if existing_key else key_for(value)
        if k in dictionary and dictionary[k] != value:
            print(f"  [error] key collision {k} in {rel}")
            sys.exit(1)
        dictionary[k] = value
        if kind in ("text", "html"):
            attr = "data-i18n" if kind == "text" else "data-i18n-html"
            edits.append(insert_attr(src, node, attr, k))

    if page_id == "index":
        dictionary.update(extract_timeline(src))

    # <title> and meta description
    m = re.search(r"<title>(.*?)</title>", src, re.S)
    if m and collapse(m.group(1)):
        dictionary["_title"] = collapse(unescape(m.group(1)))
    m = re.search(r'<meta name="description" content="(.*?)"', src, re.S)
    if m:
        dictionary["_meta.description"] = collapse(unescape(m.group(1)))

    # head injection: hreflang alternates + i18n runtime
    if "i18n/i18n.js" not in src:
        links = [f'  <link rel="alternate" hreflang="x-default" href="{url}">',
                 f'  <link rel="alternate" hreflang="en" href="{url}">']
        for lang in LANGS:
            links.append(
                f'  <link rel="alternate" hreflang="{lang}" href="{url}?lang={lang}">')
        block = ("\n".join(links) + "\n"
                 f'  <script src="/i18n/i18n.js" defer data-page="{page_id}"'
                 f' data-pos="{pos_corner}"></script>\n')
        head_end = src.find("</head>")
        if head_end < 0:
            print(f"  [error] {rel}: no </head>")
            sys.exit(1)
        edits.append((head_end, block))

    # apply edits (descending offset)
    edits.sort(key=lambda e: e[0], reverse=True)
    out = src
    for pos, text in edits:
        out = out[:pos] + text + out[pos:]

    with open(path, "w", encoding="utf-8") as f:
        f.write(out)

    dict_path = os.path.join(REPO, "i18n", f"{page_id}.en.json")
    with open(dict_path, "w", encoding="utf-8") as f:
        json.dump(dictionary, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print(f"  {rel}: {len(dictionary)} strings → i18n/{page_id}.en.json")
    return dictionary


def main():
    os.makedirs(os.path.join(REPO, "i18n"), exist_ok=True)
    only = sys.argv[1:] or None
    total = 0
    for rel, page_id, url, corner in PAGES:
        if only and page_id not in only:
            continue
        print(f"processing {rel} …")
        d = process_page(rel, page_id, url, corner)
        if d:
            total += len(d)
    print(f"total strings: {total}")


if __name__ == "__main__":
    main()
