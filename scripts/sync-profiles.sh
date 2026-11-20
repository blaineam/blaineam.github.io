#!/bin/sh
# Publishes what scripts/build-site.mjs wrote into profiles/ to GitHub.
#
#   sh scripts/sync-profiles.sh           # dry run: shows what would change
#   sh scripts/sync-profiles.sh --apply   # sets the GitHub bio, pushes the profile README
#
# Needs the GitHub CLI, signed in as the account being updated (`gh auth status`). Nothing here
# runs in CI: it changes a public profile, so it only ever runs when you run it.
set -eu
cd "$(dirname "$0")/.."
BIOS=profiles/bios.md
README=profiles/github-profile-README.md
[ -f "$BIOS" ] && [ -f "$README" ] || { echo "Run node scripts/build-site.mjs first."; exit 1; }

# The fenced block under "## GitHub bio".
BIO=$(awk '/^## GitHub bio/{f=1} f&&/^```text/{g=1;next} g&&/^```/{exit} g{print}' "$BIOS")
USER=$(gh api user --jq .login)
REPO="$USER/$USER"

echo "GitHub bio for $USER:"
echo "  now: $(gh api user --jq '.bio // ""')"
echo "  new: $BIO"
echo "Profile README: $REPO/README.md ← $README"

if [ "${1:-}" != "--apply" ]; then
  echo
  echo "Dry run. Re-run with --apply to publish."
  exit 0
fi

gh api -X PATCH user -f bio="$BIO" --silent
echo "Bio updated."

SHA=$(gh api "repos/$REPO/contents/README.md" --jq .sha 2>/dev/null || true)
CONTENT=$(base64 < "$README" | tr -d '\n')
if [ -n "$SHA" ]; then
  gh api -X PUT "repos/$REPO/contents/README.md" -f message="Update profile README from blaineam.github.io" -f content="$CONTENT" -f sha="$SHA" --silent
else
  gh api -X PUT "repos/$REPO/contents/README.md" -f message="Add profile README from blaineam.github.io" -f content="$CONTENT" --silent
fi
echo "Profile README pushed to $REPO."
