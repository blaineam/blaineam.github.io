#!/bin/sh
# /shell must run on whatever awk a machine has: BSD awk (macOS), mawk (Debian, Ubuntu), gawk,
# BusyBox awk (OpenWrt, Alpine) and the "one true awk". They disagree about small things (mawk
# will not take a local variable named like a function), and a slip only shows on the awk that
# minds. This draws every kind of screen with each awk found here and fails if any of them
# prints an error, exits non-zero or draws nothing.
#
#   sh scripts/tui-test.sh            test the generated ./shell
#   sh scripts/tui-test.sh path       test another copy
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=${1:-$ROOT/shell}
T=$(mktemp -d) || exit 1
trap 'rm -rf "$T"' EXIT
# everything up to where the script reaches for the terminal: the data, the renderer and tui()
sed '/^TTY=\/dev\/tty$/,$d' "$SRC" >"$T/head.sh"
grep -q '^tui() ' "$T/head.sh" || { echo "tui-test: $SRC does not look like the terminal script"; exit 1; }

BAD=0; RAN=0
try() {
  name=$1; shift
  command -v "$1" >/dev/null 2>&1 || { echo "  $name: not installed here, skipped"; return 0; }
  mkdir -p "$T/$name"
  bin=$(command -v "$1"); shift                # by its full path: the stand-in is itself called awk
  printf '#!/bin/sh\nexec %s "$@"\n' "$bin${*:+ $*}" >"$T/$name/awk"; chmod +x "$T/$name/awk"
  RAN=$((RAN + 1))
  (
    PATH="$T/$name:$PATH"; LANG=en_US.UTF-8; LC_ALL=en_US.UTF-8; export PATH LANG LC_ALL
    unset WEMILLER_LANG WEMILLER_WHEN WEMILLER_SEASONS 2>/dev/null
    . "$T/head.sh"
    bad=0; n=0
    # shot <what> <must-draw: 1|0> args...
    shot() {
      what=$1; must=$2; shift 2; n=$((n + 1))
      out=$(tui "$@" 2>"$T/err"); code=$?
      if [ "$code" != 0 ] || [ -s "$T/err" ] || { [ "$must" = 1 ] && [ -z "$out" ]; }; then
        bad=$((bad + 1)); echo "  $name: FAILED $what (exit $code)"; head -n 5 "$T/err" | sed 's/^/      /'
      fi
    }
    F="-v rows=30 -v cols=100 -v color=1 -v utf=1 -v clock=12:00:00 -v tick=5 -v vol=7 -v du=me -v df=zshlocal"
    for tab in 1 2 3 4 5; do
      shot "section $tab" 1 $F -v tab=$tab -v sel=1 -v lg=full
      shot "section $tab, short legend" 1 $F -v tab=$tab -v sel=0 -v lg=short
    done
    shot "help" 1 $F -v tab=1 -v lg=help
    shot "help, small window" 1 -v rows=16 -v cols=64 -v color=0 -v utf=0 -v tab=2 -v lg=help
    shot "search" 1 $F -v mode=1 -v q=haven -v ssel=0
    shot "time machine" 1 $F -v mode=2 -v psel=2
    shot "dotfiles question" 1 $F -v mode=3 -v tab=1
    shot "music notice" 1 $F -v tab=1 -v music=%dotok -v lg=short
    shot "warp" 1 $F -v warp=3 -v wfrom=
    shot "too small" 1 -v rows=10 -v cols=40 -v color=1 -v utf=1 -v tab=1
    shot "plain ASCII" 1 -v rows=24 -v cols=80 -v color=0 -v utf=0 -v tab=3 -v sel=0 -v lg=full
    for l in zh-Hans ja de fr es ko pt-BR it; do LANGC=$l; shot "language $l" 1 $F -v tab=1 -v lg=help; shot "dotfiles question, $l" 1 $F -v mode=3; done
    LANGC=en
    WHEN=2090-01-01; shot "the future" 1 $F -v tab=1 -v lg=short; shot "the future, projects" 1 $F -v tab=2 -v sel=0
    WHEN=christmas; shot "a named day" 1 $F -v tab=1 -v lg=short
    WHEN=1999-05-01; shot "the past" 1 $F -v tab=4 -v sel=0
    WHEN=
    shot "plain text" 1 -v want=plain
    shot "counts" 1 -v want=counts
    shot "card" 1 -v want=card -v cols=80 -v color=1 -v utf=1
    shot "resume" 1 -v want=resume
    shot "url" 1 -v want=url -v tab=2 -v sel=0
    shot "search count" 1 -v want=count -v q=haven
    shot "search hit" 0 -v want=hit -v q=haven -v sel=0
    shot "pick a day" 1 -v want=pick -v psel=1 -v td=
    [ "$bad" = 0 ] && echo "  $name: $n screens, no errors"
    exit "$bad"
  ) || BAD=$((BAD + 1))
}

echo "tui-test: $SRC"
try awk awk
try mawk mawk
try gawk gawk
try gawk-posix gawk --posix
try busybox busybox awk
try original-awk original-awk
[ "$RAN" -gt 0 ] || { echo "tui-test: no awk at all"; exit 1; }
if [ "$BAD" != 0 ]; then echo "tui-test: $BAD awk(s) failed"; exit 1; fi
echo "tui-test: all good on $RAN awk(s)"
