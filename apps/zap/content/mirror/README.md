# Open Trivia Database — local mirror

A complete local copy of the [Open Trivia Database](https://opentdb.com)
question bank, committed to this repo as a **durable backup and self-hostable
source**. If OpenTDB ever disappears, Zap's entire content pipeline still works
from this folder — no internet required.

## License

OpenTDB content is licensed under **Creative Commons Attribution-ShareAlike 4.0
(CC BY-SA 4.0)**: https://creativecommons.org/licenses/by-sa/4.0/

This mirror is redistributed under the same license. **Attribution:** Open
Trivia Database (https://opentdb.com). If you reuse it, keep this attribution
and license your version under CC BY-SA 4.0. (See also `../content/ATTRIBUTION.md`.)

## Structure

```
opentdb-mirror/
├── categories.json     the full OpenTDB category list  [{ id, name }]
├── meta.json           fetch date, totals, per-category counts + filenames
└── questions/
    └── <id>-<slug>.json   every question in that category, OpenTDB's native shape
```

Each question keeps OpenTDB's original fields (decoded to clean UTF-8):

```json
{
  "category": "Entertainment: Video Games",
  "type": "multiple",
  "difficulty": "easy",
  "question": "…",
  "correct_answer": "…",
  "incorrect_answers": ["…", "…", "…"]
}
```

## Refresh the mirror

Re-pull the whole database from OpenTDB (every category, paged to exhaustion via
a session token, ~10 minutes due to the ~1 req/5 s rate limit):

```sh
node ../Tools/mirror_opentdb.mjs
# or a single category:
node ../Tools/mirror_opentdb.mjs --category 15
```

## Self-host Zap's content entirely from this mirror

The mirror is the upstream source; the rest of the chain is already
self-hosted. To regenerate and ship Zap's questions **without touching
opentdb.com**:

```sh
# 1. Rebuild the curated category packs from the LOCAL mirror (offline):
node ../Tools/update_content.mjs --from-mirror

# 2. That also recompiles content/<id>.pack.json + content/manifest.json and the
#    bundled offline snapshot. Publish content/ to your OTA host:
#       https://wemiller.com/zap-content/   (manifest.json + *.pack.json)

# 3. The app fetches the manifest from there, verifies sha256, and updates —
#    no App Store release needed.
```

So the full path — **mirror (backup) → build packs → host packs → app OTA** — is
entirely under your control and survives OpenTDB going away.
