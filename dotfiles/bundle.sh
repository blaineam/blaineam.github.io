#!/bin/sh
# bundle.sh - pack the dotfiles (and, if asked, their packages) into one tarball that can
# be carried to a machine with no network. POSIX sh, so it also runs under BusyBox ash.
#
# On a connected machine:
#   sh bundle.sh                 dotfiles only (zshlocal + ashlocal + install.sh)
#   sh bundle.sh auto            ... plus packages for this machine's package manager
#   sh bundle.sh apt|dnf|yum|opkg|brew
#   sh bundle.sh -o /path/out.tar.gz auto
# or without a checkout:
#   curl -fsSL https://raw.githubusercontent.com/blaineam/blaineam.github.io/main/dotfiles/bundle.sh | sh -s -- auto
#
# On the air-gapped machine:
#   tar -xzf zshlocal-bundle.tar.gz && sh zshlocal-bundle/install.sh
# install.sh copies the dotfiles into place and records where the bundle is; the next
# shell installs the packages from it (same as starting it with ZSHLOCAL_BUNDLE=/path).
#
# For a DIFFERENT machine than this one (say a Mac or Ubuntu laptop building for a Rocky 9
# server, a Debian arm64 box or an OpenWrt router), name the target:
#   sh bundle.sh --target FAMILY:DISTRO:RELEASE:ARCH      (FAMILY: may be left out)
#   sh bundle.sh --target apt:debian:12:arm64
#   sh bundle.sh --target dnf:rocky:9:x86_64
#   sh bundle.sh --target ubuntu:24.04:amd64
#   sh bundle.sh --target opkg:openwrt:23.05.3:aarch64_cortex-a53
#   sh bundle.sh --target dnf:rhel:9:x86_64 --image rockylinux:9   (pick the image yourself)
#   sh bundle.sh --dry-run --target ...    print what would run; download and write nothing
# ZSHLOCAL_BUNDLE_TARGET=... is the same as --target.
# apt, dnf and yum targets are downloaded by the target's own package manager, inside a
# container of the target's image (docker or podman, --platform for the CPU). Without
# docker or podman the script stops and says so; it never falls back to this machine's
# packages. Another CPU needs emulation: Docker Desktop has it built in, on Linux install
# qemu-user-static / binfmt first. opkg targets need no container: the .ipk files come
# straight from the release's package feed, dependencies resolved from its Packages index.
# The bundle records the target, and the install side refuses it anywhere else.
#
# Honest limits - without --target, packages are downloaded FOR THIS MACHINE, so build the
# bundle on the same distro release and CPU architecture as the target:
#   apt    apt-get download of the full dependency closure. Self-contained, but large
#          (several hundred MB), and dpkg cannot resolve anything that is not in it.
#   dnf    dnf download --resolve --alldeps (needs dnf-plugins-core on dnf 4): full
#          closure. Installed on the target with all repos disabled.
#   yum    yumdownloader --resolve (needs yum-utils) only fetches dependencies that are
#          NOT installed here, so the target must have at least what this machine has.
#          With --target that means: at least what the distro's base container image has.
#   opkg   opkg download has no dependency resolution. This script follows "Depends:" by
#          hand and fetches what is not installed here, so build it on a device with the
#          same OpenWrt release and target as the one you are carrying it to.
#          With --target it reads the feed index instead and takes every dependency the
#          base and packages feeds carry. Names those feeds do not carry (libc, the kernel
#          and other parts of the firmware image) are assumed present and are listed.
#          OpenWrt releases that moved from opkg to apk are not covered.
#   brew   brew fetch --deps fills a Homebrew cache with bottles for THIS macOS version
#          and CPU. Homebrew has no offline mode: it must already be installed on the
#          target, and it may still try to reach the network. Best effort only.
#          There is no --target for brew: build on a matching Mac.
#   Windows  the bundle carries profile.ps1 and cmdlocal.cmd, but no Windows packages:
#          winget, scoop and choco cannot install from a bundle offline.
#   With --target on RHEL-family distros (rocky, almalinux, centos, rhel) EPEL is enabled
#   inside the download container, because htop, ncdu, rclone and others live there.
# Packages the repositories do not carry are skipped and listed, never an error.

set -u

BASE_URL="${ZSHLOCAL_BASE_URL:-https://raw.githubusercontent.com/blaineam/blaineam.github.io/main/dotfiles}"
OUT="zshlocal-bundle.tar.gz"
PM="none"
TARGET="${ZSHLOCAL_BUNDLE_TARGET:-}"
IMAGE=""
DRY=""

# Keep these lists in step with zshlocal (brew/apt/dnf) and ashlocal (opkg).
PKGS_BREW="git tmux htop vim imagemagick ffmpeg rclone ncdu the_silver_searcher fzf watch tree bandwhich"
PKGS_APT="git tmux htop vim imagemagick ffmpeg rclone ncdu silversearcher-ag fzf procps tree nethogs"
PKGS_RPM="git tmux htop vim-enhanced ImageMagick ffmpeg rclone ncdu the_silver_searcher fzf procps-ng tree nethogs"
PKGS_OPKG="${ZSHLOCAL_OPKG_PACKAGES:-htop tree ncdu tmux}"

usage() {
  echo "usage: sh bundle.sh [-o FILE] [none|auto|apt|dnf|yum|opkg|brew]"
  echo "       sh bundle.sh [-o FILE] [--dry-run] --target [FAMILY:]DISTRO:RELEASE:ARCH [--image IMAGE]"
  echo "  none (default) packs the dotfiles only; the others also download packages for this machine."
  echo "  --target downloads for another machine, e.g. apt:debian:12:arm64, dnf:rocky:9:x86_64,"
  echo "  ubuntu:24.04:amd64, opkg:openwrt:23.05.3:aarch64_cortex-a53 (needs docker or podman, except opkg)."
}

while [ $# -gt 0 ]; do
  case "$1" in
    -o|--output)
      if [ $# -lt 2 ]; then usage >&2; exit 2; fi
      OUT="$2"; shift 2 ;;
    -t|--target)
      if [ $# -lt 2 ]; then usage >&2; exit 2; fi
      TARGET="$2"; shift 2 ;;
    --target=*) TARGET="${1#--target=}"; shift ;;
    --image)
      if [ $# -lt 2 ]; then usage >&2; exit 2; fi
      IMAGE="$2"; shift 2 ;;
    --image=*) IMAGE="${1#--image=}"; shift ;;
    -n|--dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    none|auto|apt|dnf|yum|opkg|brew) PM="$1"; shift ;;
    *) usage >&2; exit 2 ;;
  esac
done

if [ "$PM" = "auto" ]; then
  if [ "$(uname -s)" = "Darwin" ]; then PM="brew"
  elif command -v apt-get >/dev/null 2>&1; then PM="apt"
  elif command -v dnf >/dev/null 2>&1; then PM="dnf"
  elif command -v yum >/dev/null 2>&1; then PM="yum"
  elif command -v opkg >/dev/null 2>&1; then PM="opkg"
  else
    echo "bundle: no supported package manager here, packing the dotfiles only." >&2
    PM="none"
  fi
fi

# --- --target: who the packages are for ---
T_FAM=""; T_ID=""; T_REL=""; T_ARCH=""; T_EXTRA=""; T_PLATFORM=""; CT_PLATFORM=""; EPEL=0
if [ -n "$TARGET" ]; then
  IFS=: read -r T1 T2 T3 T4 T5 <<EOF
$TARGET
EOF
  case "$T1" in
    apt|dnf|yum|opkg) T_FAM="$T1"; T_ID="$T2"; T_REL="$T3"; T_ARCH="$T4"; T_EXTRA="$T5" ;;
    brew)
      echo "bundle: there is no --target for brew. Homebrew bottles have to be fetched on a Mac with the same macOS version and CPU: run 'sh bundle.sh brew' there." >&2
      exit 2 ;;
    *) T_FAM=""; T_ID="$T1"; T_REL="$T2"; T_ARCH="$T3"; T_EXTRA="$T4" ;;
  esac
  if [ -z "$T_ID" ] || [ -z "$T_REL" ] || [ -z "$T_ARCH" ] || [ -n "$T_EXTRA" ]; then
    echo "bundle: --target wants [FAMILY:]DISTRO:RELEASE:ARCH, for example apt:debian:12:arm64 (got '$TARGET')." >&2
    exit 2
  fi
  # Distro names as /etc/os-release spells them (that is what the install side compares).
  DEF_IMAGE=""; DEF_FAM=""
  case "$T_ID" in
    debian) DEF_FAM="apt"; DEF_IMAGE="debian:$T_REL" ;;
    ubuntu) DEF_FAM="apt"; DEF_IMAGE="ubuntu:$T_REL" ;;
    fedora) DEF_FAM="dnf"; DEF_IMAGE="fedora:$T_REL" ;;
    rocky|rockylinux) T_ID="rocky"; DEF_FAM="dnf"; DEF_IMAGE="rockylinux:$T_REL"; EPEL=1 ;;
    alma|almalinux) T_ID="almalinux"; DEF_FAM="dnf"; DEF_IMAGE="almalinux:$T_REL"; EPEL=1 ;;
    centos)
      EPEL=1
      case "$T_REL" in
        7|7.*) DEF_FAM="yum"; DEF_IMAGE="centos:7" ;;
        *) DEF_FAM="dnf"; DEF_IMAGE="quay.io/centos/centos:stream${T_REL%%.*}" ;;
      esac ;;
    rhel|redhat) T_ID="rhel"; DEF_FAM="dnf"; EPEL=1 ;;
    amzn|amazon|amazonlinux)
      T_ID="amzn"; DEF_IMAGE="amazonlinux:$T_REL"
      case "$T_REL" in 2) DEF_FAM="yum" ;; *) DEF_FAM="dnf" ;; esac ;;
    openwrt) DEF_FAM="opkg" ;;
  esac
  if [ -z "$T_FAM" ]; then T_FAM="$DEF_FAM"; fi
  if [ -z "$T_FAM" ]; then
    echo "bundle: do not know which package manager '$T_ID' uses; say it: --target apt|dnf|yum|opkg:$T_ID:$T_REL:$T_ARCH" >&2
    exit 2
  fi
  if [ -z "$IMAGE" ]; then IMAGE="$DEF_IMAGE"; fi
  case "$T_REL" in
    [0-9]*) ;;
    *) echo "bundle: give the release as a number (12, 24.04, 9), not a code name: '$T_REL'." >&2; exit 2 ;;
  esac
  if [ "$T_FAM" = "opkg" ]; then
    # opkg architectures are exact strings (opkg print-architecture, or OPENWRT_ARCH in
    # /etc/os-release on the device), so they are taken as typed.
    CT_PLATFORM=""
  else
    case "$T_ARCH" in
      amd64|x86_64|x64) T_ARCH="x86_64"; CT_PLATFORM="linux/amd64" ;;
      arm64|aarch64) T_ARCH="aarch64"; CT_PLATFORM="linux/arm64" ;;
      armhf|armv7|armv7l) T_ARCH="armv7l"; CT_PLATFORM="linux/arm/v7" ;;
      i386|i686|x86) T_ARCH="i686"; CT_PLATFORM="linux/386" ;;
      *) CT_PLATFORM="linux/$T_ARCH" ;;
    esac
    if [ -z "$IMAGE" ]; then
      echo "bundle: no default container image for '$T_ID'; name one with --image (for RHEL $T_REL a compatible rebuild such as rockylinux:$T_REL or almalinux:$T_REL)." >&2
      exit 2
    fi
  fi
  T_PLATFORM="$T_ID $T_REL $T_ARCH"
  PM="$T_FAM"
fi

fetch() { # fetch URL FILE
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 10 --max-time 60 "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 30 -O "$2" "$1"
  else
    echo "bundle: need curl or wget to download $1" >&2
    return 1
  fi
}

platform() {
  if [ "$(uname -s)" = "Darwin" ]; then
    echo "macos $(sw_vers -productVersion 2>/dev/null | cut -d. -f1) $(uname -m)"
  elif [ "$PM" = "opkg" ]; then
    echo "$( if [ -r /etc/os-release ]; then . /etc/os-release; fi; echo "${ID:-unknown} ${VERSION_ID:-unknown} ${OPENWRT_ARCH:-$(uname -m)}" )"
  else
    echo "$( if [ -r /etc/os-release ]; then . /etc/os-release; fi; echo "${ID:-unknown} ${VERSION_ID:-unknown}" ) $(uname -m)"
  fi
}

# --- Scripts that run INSIDE the target's container. /out is the bundle's package
# directory; PKGS, EPEL, HOST_UID and HOST_GID come in through the environment. ---
CT_APT='export DEBIAN_FRONTEND=noninteractive
apt-get update -qq || exit 1
cd /out || exit 1
closure=$(for p in $PKGS; do
  apt-cache depends --recurse --no-recommends --no-suggests --no-conflicts --no-breaks --no-replaces --no-enhances "$p" 2>/dev/null || echo "$p" >> /out/.missed
done | grep "^[a-z0-9]" | sort -u)
[ -n "$closure" ] || exit 1
apt-get download $closure >/dev/null 2>&1 || for p in $closure; do
  apt-get download "$p" >/dev/null 2>&1 || echo "$p" >> /out/.missed
done
chown -R "$HOST_UID:$HOST_GID" /out 2>/dev/null
exit 0'
CT_DNF='dnf -y -q install dnf-plugins-core >/dev/null 2>&1
if [ "$EPEL" = 1 ]; then dnf -y -q install epel-release >/dev/null 2>&1; fi
dnf download -q --resolve --alldeps --destdir /out $PKGS >/dev/null 2>&1 || for p in $PKGS; do
  dnf download -q --resolve --alldeps --destdir /out "$p" >/dev/null 2>&1 && continue
  if [ "$p" = ffmpeg ] && dnf download -q --resolve --alldeps --destdir /out ffmpeg-free >/dev/null 2>&1; then continue; fi
  echo "$p" >> /out/.missed
done
chown -R "$HOST_UID:$HOST_GID" /out 2>/dev/null
exit 0'
CT_YUM='yum -y -q install yum-utils >/dev/null 2>&1
if [ "$EPEL" = 1 ]; then yum -y -q install epel-release >/dev/null 2>&1; fi
for p in $PKGS; do
  yumdownloader -q --resolve --destdir /out "$p" >/dev/null 2>&1 || echo "$p" >> /out/.missed
done
chown -R "$HOST_UID:$HOST_GID" /out 2>/dev/null
exit 0'

container_runtime() { # prints docker or podman, or nothing
  if command -v docker >/dev/null 2>&1; then echo docker
  elif command -v podman >/dev/null 2>&1; then echo podman
  fi
}

no_runtime() {
  echo "bundle: --target $TARGET needs docker or podman to run the $IMAGE image, and neither is installed." >&2
  echo "bundle: install Docker Desktop (macOS, Windows) or docker.io / podman (Linux) and run this again," >&2
  echo "bundle: or run 'sh bundle.sh $T_FAM' on a machine that is $T_PLATFORM. No bundle was written." >&2
}

# Download for an apt/dnf/yum target with the target's own package manager.
#   $1 = package directory on this machine
target_container() {
  case "$T_FAM" in
    apt) CT_SCRIPT="$CT_APT"; CT_PKGS="$PKGS_APT" ;;
    dnf) CT_SCRIPT="$CT_DNF"; CT_PKGS="$PKGS_RPM" ;;
    *) CT_SCRIPT="$CT_YUM"; CT_PKGS="$PKGS_RPM" ;;
  esac
  CT="$(container_runtime)"
  if [ -z "$CT" ]; then
    no_runtime
    return 3
  fi
  VOL="$1:/out"
  if [ "$CT" = "podman" ]; then VOL="$1:/out:Z"; fi
  if [ -n "$DRY" ]; then
    echo "+ $CT run --rm --platform $CT_PLATFORM -e PKGS='$CT_PKGS' -e EPEL=$EPEL -e HOST_UID=$(id -u) -e HOST_GID=$(id -g) -v '$VOL' $IMAGE sh -c '"
    echo "$CT_SCRIPT" | sed 's/^/    /'
    echo "  '"
    return 0
  fi
  echo "bundle: downloading for $T_PLATFORM inside $IMAGE ($CT, $CT_PLATFORM)..."
  if ! "$CT" run --rm --platform "$CT_PLATFORM" -e PKGS="$CT_PKGS" -e EPEL="$EPEL" \
      -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" -v "$VOL" "$IMAGE" sh -c "$CT_SCRIPT"; then
    echo "bundle: the $IMAGE container failed (is the $CT daemon running? does the image exist for $CT_PLATFORM? another CPU needs qemu/binfmt emulation). No bundle was written." >&2
    return 4
  fi
  if [ -f "$1/.missed" ]; then
    MISSED="$MISSED $(sort -u "$1/.missed" | tr '\n' ' ')"
    rm -f "${1:?}/.missed"
  fi
  return 0
}

# Download for an opkg target straight from the release's package feeds.
#   $1 = package directory on this machine
target_opkg() {
  OPKG_DIR="$1"
  FEED_BASE="${ZSHLOCAL_OPKG_FEED_URL:-https://downloads.openwrt.org/releases/$T_REL/packages/$T_ARCH}"
  if [ -n "$DRY" ]; then
    for feed in base packages; do
      echo "+ fetch $FEED_BASE/$feed/Packages.gz   (index: Package, Depends, Filename, SHA256sum)"
    done
    echo "+ resolve the dependencies of: $PKGS_OPKG"
    echo "+ fetch $FEED_BASE/<feed>/<Filename> for each of them, and check its SHA256sum"
    return 0
  fi
  echo "bundle: reading the package index at $FEED_BASE ..."
  TABLE="$WORK/opkg-index.tsv"
  : > "$TABLE"
  for feed in base packages; do
    if ! fetch "$FEED_BASE/$feed/Packages.gz" "$WORK/Packages.$feed.gz"; then
      echo "bundle: could not get $FEED_BASE/$feed/Packages.gz. The release must be exact (23.05.3, not 23.05) and the architecture spelled as 'opkg print-architecture' shows it on the device. No bundle was written." >&2
      return 4
    fi
    # name <TAB> feed/filename <TAB> sha256 <TAB> dependencies
    gzip -dc "$WORK/Packages.$feed.gz" | awk -v feed="$feed" '
      BEGIN { RS = ""; FS = "\n" }
      {
        name = ""; file = ""; sum = "-"; deps = ""
        for (i = 1; i <= NF; i++) {
          if ($i ~ /^Package: /) name = substr($i, 10)
          else if ($i ~ /^Filename: /) file = substr($i, 11)
          else if ($i ~ /^SHA256sum: /) sum = substr($i, 12)
          else if ($i ~ /^Depends: /) deps = substr($i, 10)
        }
        gsub(/\([^)]*\)/, "", deps); gsub(/,/, " ", deps)
        if (name != "" && file != "") print name "\t" feed "/" file "\t" sum "\t" deps
      }' >> "$TABLE"
  done
  TODO="$PKGS_OPKG"
  SEEN=" "
  TOP=" $PKGS_OPKG "
  ASSUMED=""
  while [ -n "$TODO" ]; do
    # shellcheck disable=SC2086
    set -- $TODO
    p="$1"; shift; TODO="$*"
    case "$SEEN" in *" $p "*) continue ;; esac
    SEEN="$SEEN$p "
    ROW="$(awk -F '\t' -v p="$p" '$1 == p { print; exit }' "$TABLE")"
    if [ -z "$ROW" ]; then
      case "$TOP" in
        *" $p "*) MISSED="$MISSED $p" ;;
        *) ASSUMED="$ASSUMED $p" ;;
      esac
      continue
    fi
    FILE="$(printf '%s\n' "$ROW" | cut -f2)"
    SUM="$(printf '%s\n' "$ROW" | cut -f3)"
    DEPS="$(printf '%s\n' "$ROW" | cut -f4)"
    IPK="$OPKG_DIR/${FILE##*/}"
    if ! fetch "$FEED_BASE/$FILE" "$IPK"; then
      echo "bundle: could not download $FEED_BASE/$FILE. No bundle was written." >&2
      return 4
    fi
    if [ "$SUM" != "-" ]; then
      GOT=""
      if command -v sha256sum >/dev/null 2>&1; then GOT="$(sha256sum "$IPK" | cut -d' ' -f1)"
      elif command -v shasum >/dev/null 2>&1; then GOT="$(shasum -a 256 "$IPK" | cut -d' ' -f1)"
      fi
      if [ -n "$GOT" ] && [ "$GOT" != "$SUM" ]; then
        echo "bundle: checksum mismatch for ${FILE##*/}. No bundle was written." >&2
        return 4
      fi
    fi
    TODO="$TODO $DEPS"
  done
  if [ -n "$ASSUMED" ]; then
    echo "bundle: not in the base/packages feeds, assumed to be part of the firmware on the device:$ASSUMED"
  fi
  return 0
}

if [ -n "$DRY" ]; then
  echo "bundle: dry run. Nothing is downloaded and nothing is written."
  echo "bundle: would pack zshlocal, ashlocal, profile.ps1, cmdlocal.cmd, install.sh and MANIFEST into $OUT"
  if [ -n "$TARGET" ]; then
    echo "bundle: target '$T_PLATFORM' with $T_FAM; the bundle's PLATFORM file would say exactly that"
    case "$T_FAM" in
      opkg) target_opkg "<bundle>/packages/opkg" ;;
      apt) target_container "<bundle>/packages/apt" ;;
      *) target_container "<bundle>/packages/rpm" ;;
    esac
    exit $?
  fi
  case "$PM" in
    none) echo "bundle: no packages" ;;
    *) echo "bundle: would download packages for THIS machine ($(platform)) with its own $PM" ;;
  esac
  exit 0
fi

WORK="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/zshlocal-bundle.$$")"
mkdir -p "$WORK" || exit 1
trap 'rm -rf "${WORK:?}"' EXIT
trap 'exit 1' INT TERM
ROOT="$WORK/zshlocal-bundle"
mkdir -p "$ROOT" || exit 1

# --- The dotfiles: from next to this script when it is a checkout, else downloaded. ---
SRC=""
case "$0" in
  *bundle.sh) SRC="$(cd "$(dirname "$0")" 2>/dev/null && pwd)" ;;
esac
for f in zshlocal ashlocal; do
  if [ -n "$SRC" ] && [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$ROOT/$f"
  elif ! fetch "$BASE_URL/$f" "$ROOT/$f"; then
    echo "bundle: could not get $f, giving up." >&2
    exit 1
  fi
done
# The Windows flavours ride along (no Windows packages: see the limits above).
for f in profile.ps1 cmdlocal.cmd; do
  if [ -n "$SRC" ] && [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$ROOT/$f"
  elif ! fetch "$BASE_URL/$f" "$ROOT/$f" 2>/dev/null; then
    rm -f "${ROOT:?}/${f:?}"
    echo "bundle: could not get $f, leaving it out." >&2
  fi
done

# --- Packages ---
MISSED=""
D=""
if [ -n "$TARGET" ]; then
  # Another machine's packages. Any failure here stops the script: a bundle that claims a
  # target but holds nothing for it (or holds this machine's packages) must not exist.
  case "$T_FAM" in
    apt) D="$ROOT/packages/apt" ;;
    opkg) D="$ROOT/packages/opkg" ;;
    *) D="$ROOT/packages/rpm" ;;
  esac
  mkdir -p "$D" || exit 1
  if [ "$T_FAM" = "opkg" ]; then
    target_opkg "$D" || exit $?
  else
    target_container "$D" || exit $?
  fi
  if [ -z "$(find "$D" -type f 2>/dev/null | head -n 1)" ]; then
    echo "bundle: nothing was downloaded for $T_PLATFORM. No bundle was written." >&2
    exit 4
  fi
  PM_NATIVE="none"
else
  PM_NATIVE="$PM"
fi
case "$PM_NATIVE" in
  apt)
    D="$ROOT/packages/apt"; mkdir -p "$D"
    echo "bundle: resolving the apt dependency closure..."
    # shellcheck disable=SC2086
    CLOSURE="$(apt-cache depends --recurse --no-recommends --no-suggests --no-conflicts \
      --no-breaks --no-replaces --no-enhances $PKGS_APT 2>/dev/null | grep '^[a-z0-9]' | sort -u)"
    echo "bundle: downloading $(echo "$CLOSURE" | wc -l | tr -d ' ') packages with apt-get download..."
    # shellcheck disable=SC2086
    if ! ( cd "$D" && apt-get download $CLOSURE >/dev/null 2>&1 ); then
      # A virtual or unavailable name fails the batch: go one at a time.
      for p in $CLOSURE; do
        ( cd "$D" && apt-get download "$p" >/dev/null 2>&1 ) || MISSED="$MISSED $p"
      done
    fi
    ;;
  dnf)
    D="$ROOT/packages/rpm"; mkdir -p "$D"
    echo "bundle: downloading with dnf download --resolve --alldeps..."
    # shellcheck disable=SC2086
    if ! dnf download -q --resolve --alldeps --destdir "$D" $PKGS_RPM >/dev/null 2>&1; then
      for p in $PKGS_RPM; do
        dnf download -q --resolve --alldeps --destdir "$D" "$p" >/dev/null 2>&1 || MISSED="$MISSED $p"
      done
    fi
    ;;
  yum)
    D="$ROOT/packages/rpm"; mkdir -p "$D"
    if command -v yumdownloader >/dev/null 2>&1; then
      echo "bundle: downloading with yumdownloader --resolve..."
      for p in $PKGS_RPM; do
        yumdownloader -q --resolve --destdir "$D" "$p" >/dev/null 2>&1 || MISSED="$MISSED $p"
      done
    else
      echo "bundle: yumdownloader not found (install yum-utils); no packages downloaded." >&2
      MISSED="$PKGS_RPM"
    fi
    ;;
  opkg)
    D="$ROOT/packages/opkg"; mkdir -p "$D"
    echo "bundle: downloading with opkg download..."
    TODO="$PKGS_OPKG"
    SEEN=" "
    TOP=" $PKGS_OPKG "
    while [ -n "$TODO" ]; do
      # shellcheck disable=SC2086
      set -- $TODO
      p="$1"; shift; TODO="$*"
      case "$SEEN" in *" $p "*) continue ;; esac
      SEEN="$SEEN$p "
      # A dependency that is already installed here is assumed to be on the target too.
      case "$TOP" in
        *" $p "*) ;;
        *) if opkg list-installed "$p" 2>/dev/null | grep -q .; then continue; fi ;;
      esac
      if ! ( cd "$D" && opkg download "$p" >/dev/null 2>&1 ); then
        MISSED="$MISSED $p"
        continue
      fi
      DEPS="$(opkg info "$p" 2>/dev/null | sed -n 's/^Depends: //p' | head -n 1 | sed 's/([^)]*)//g' | tr ',' ' ')"
      TODO="$TODO $DEPS"
    done
    ;;
  brew)
    D="$ROOT/packages/brew"; mkdir -p "$D"
    if command -v brew >/dev/null 2>&1; then
      echo "bundle: fetching bottles with brew fetch --deps..."
      for p in $PKGS_BREW; do
        HOMEBREW_CACHE="$D" HOMEBREW_NO_AUTO_UPDATE=1 brew fetch --deps "$p" >/dev/null 2>&1 || MISSED="$MISSED $p"
      done
    else
      echo "bundle: brew not found; no bottles fetched." >&2
      MISSED="$PKGS_BREW"
    fi
    ;;
esac

if [ -n "$TARGET" ]; then
  # The intended target, not this machine: this is what the install side compares.
  echo "$T_PLATFORM" > "$D/PLATFORM"
elif [ "$PM" != "none" ]; then
  platform > "$D/PLATFORM"
fi

# --- install.sh, run on the target ---
cat > "$ROOT/install.sh" <<'INSTALL'
#!/bin/sh
# Put the bundled dotfiles in place on a machine with no network.
# Run from anywhere: sh /path/to/zshlocal-bundle/install.sh
# Keep this directory where it is until you have opened a new shell once.
HERE="$(cd "$(dirname "$0")" && pwd)" || exit 1

add_line() { # add_line FILE LINE  (once)
  if ! grep -qsF "$2" "$1"; then
    printf '%s\n' "$2" >> "$1"
  fi
}

if command -v zsh >/dev/null 2>&1 || command -v bash >/dev/null 2>&1; then
  cp "$HERE/zshlocal" "$HOME/.zshlocal" || exit 1
  add_line "$HOME/.zshrc" '[ -f ~/.zshlocal ] && source ~/.zshlocal'
  add_line "$HOME/.bashrc" '[ -f ~/.zshlocal ] && source ~/.zshlocal'
  rm -f "$HOME/.zshlocal-setup-done" "$HOME/.zshlocal-setup-skipped"
  if [ -d "$HERE/packages" ]; then
    printf '%s\n' "$HERE" > "$HOME/.zshlocal-bundle"
    echo "Installed ~/.zshlocal. Open a new shell: it installs the packages from $HERE/packages (no network)."
  else
    echo "Installed ~/.zshlocal. This bundle has no packages; add 'export ZSHLOCAL_OFFLINE=1' above the source line to skip the connectivity check for good."
  fi
else
  cp "$HERE/ashlocal" "$HOME/.ashlocal" || exit 1
  add_line "$HOME/.profile" '[ -f ~/.ashlocal ] && . ~/.ashlocal'
  rm -f "$HOME/.ashlocal-setup-done" "$HOME/.ashlocal-setup-skipped"
  if [ -d "$HERE/packages" ]; then
    printf '%s\n' "$HERE" > "$HOME/.ashlocal-bundle"
    echo "Installed ~/.ashlocal. Log in again (or: . ~/.ashlocal): it installs the packages from $HERE/packages (no network)."
  else
    echo "Installed ~/.ashlocal. This bundle has no packages; log in again (or: . ~/.ashlocal)."
  fi
fi
INSTALL

{
  echo "built: $(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null)"
  echo "built-on: $(platform)"
  if [ -n "$TARGET" ]; then
    echo "target: $T_PLATFORM"
    if [ "$T_FAM" = "opkg" ]; then echo "source: $FEED_BASE"; else echo "source: container image $IMAGE ($CT_PLATFORM)"; fi
  fi
  echo "package-manager: $PM"
  if [ "$PM" != "none" ]; then
    echo "package-files: $(find "$D" -type f ! -name PLATFORM 2>/dev/null | wc -l | tr -d ' ')"
    echo "not-downloaded:${MISSED:- (none)}"
  fi
} > "$ROOT/MANIFEST"

# --- Pack ---
case "$OUT" in
  /*) ;;
  *) OUT="$(pwd)/$OUT" ;;
esac
if ! tar -czf "$OUT" -C "$WORK" zshlocal-bundle 2>/dev/null; then
  # A tar without gzip support (some BusyBox builds).
  ( cd "$WORK" && tar -cf - zshlocal-bundle | gzip > "$OUT" ) || { echo "bundle: could not write $OUT" >&2; exit 1; }
fi

echo "bundle: wrote $OUT ($(du -h "$OUT" 2>/dev/null | cut -f1 | tr -d ' '))"
if [ -n "$MISSED" ]; then
  echo "bundle: not downloaded (not in the enabled repositories, or virtual):$MISSED"
fi
echo "bundle: on the target run: tar -xzf $(basename "$OUT") && sh zshlocal-bundle/install.sh"
