#!/usr/bin/env python3
"""Fill a page's 8 translated dictionaries from translations that already exist.

When a depth page (apps/<slug>/features|pricing|faq/) brings back copy the redesign cut, the
English is usually unchanged — and the i18n key is `slug + sha1[:6]` of the English, so the key
is unchanged too. Its translations are still in git, in the landing page's dictionaries at the
commit before the redesign. This copies them over instead of retranslating.

    python3 scripts/i18n-tag.py apps.enter-space.features          # writes the en dictionary
    python3 scripts/restore-i18n.py enter-space/features --from 42b76df^
    python3 scripts/restore-i18n.py sami --from 0ea36eb^            # a landing page works too

For every key in the page's en dictionary, each language takes the first value it finds in:
  1. the page's own <lang> dictionary, if it already has the key (never overwritten);
  2. the app's landing dictionary apps.<slug>.<lang>.json as it is now;
  3. the same dictionary at each --from commit, in the order given;
  4. any other page's current <lang> dictionary (shared strings: footer links, "FAQ", the
     download button) — only when the English matches exactly.
Keys found nowhere are listed and left out of the file (so check-app-page.py keeps failing on key
parity until they're written by hand — never shipped as English placeholders). Output files are sorted, like
every other dictionary here. `--check` reports without writing (exit 1 if anything is missing).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "i18n"
LANGS = ["zh-Hans", "ja", "de", "fr", "es", "ko", "pt-BR", "it"]


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def at_commit(commit: str, rel: str) -> dict:
    try:
        out = subprocess.run(["git", "show", f"{commit}:{rel}"], cwd=ROOT, check=True,
                             capture_output=True).stdout
    except subprocess.CalledProcessError:
        return {}
    return json.loads(out.decode("utf-8"))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("target", help="<slug> or <slug>/<sub>")
    parser.add_argument("--from", dest="commits", action="append", default=[],
                        help="a commit whose dictionaries hold the old translations (repeatable)")
    parser.add_argument("--check", action="store_true", help="report only; exit 1 if any are missing")
    args = parser.parse_args(argv)

    slug, _, sub = args.target.strip("/").partition("/")
    page_id = f"apps.{slug}.{sub}" if sub else f"apps.{slug}"
    en_path = I18N / f"{page_id}.en.json"
    english = load(en_path)
    if not english:
        print(f"{en_path.relative_to(ROOT)} is missing or empty — run scripts/i18n-tag.py {page_id} first")
        return 1
    current_en = {p: load(p) for p in I18N.glob("*.en.json") if p != en_path}

    missing_total = 0
    for lang in LANGS:
        out_path = I18N / f"{page_id}.{lang}.json"
        existing = load(out_path)
        sources = [load(I18N / f"apps.{slug}.{lang}.json")]
        sources += [at_commit(c, f"i18n/apps.{slug}.{lang}.json") for c in args.commits]
        result, missing = {}, []
        for key, value in english.items():
            if key in existing:
                result[key] = existing[key]
                continue
            found = next((s[key] for s in sources if key in s), None)
            if found is None:  # a string another page shares word for word
                for en_path_other, en_other in current_en.items():
                    if en_other.get(key) == value:
                        other = load(I18N / en_path_other.name.replace(".en.json", f".{lang}.json"))
                        if key in other:
                            found = other[key]
                            break
            if found is None:
                missing.append(key)
            else:
                result[key] = found
        missing_total += len(missing)
        print(f"  {out_path.name}: {len(result)}/{len(english)} filled"
              + (f", {len(missing)} missing: {', '.join(missing[:6])}{' …' if len(missing) > 6 else ''}"
                 if missing else ""))
        if not args.check:
            # Missing keys are left OUT, not filled with English: check-app-page.py then fails
            # on key parity until someone writes the translation, instead of shipping English.
            out_path.write_text(json.dumps(dict(sorted(result.items())), ensure_ascii=False, indent=2)
                                + "\n", encoding="utf-8")
    if missing_total:
        print(f"{missing_total} translation(s) not found — "
              + ("write them by hand." if args.check else
                 "left out of the files, so check-app-page.py fails until you add them by hand."))
    return 1 if (missing_total and args.check) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
