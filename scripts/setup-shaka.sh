#!/usr/bin/env bash
# Copies Amazon's Vega Shaka Player build into src/vendor/shaka/ (gitignored).
#
# Amazon's polyfills are proprietary and can't be committed to this repo, so
# every checkout runs this once. See "Shaka Player (not included)" in
# README.md for how to download and build the package first.
#
# Usage: scripts/setup-shaka.sh <path to the extracted shaka-rel directory>

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path to shaka-rel>" >&2
  exit 1
fi

SHAKA_REL="$(cd "$1" && pwd)"
DIST="$SHAKA_REL/scripts/shaka-player/dist"
POLYFILLS="$SHAKA_REL/src/polyfills"
VENDOR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/vendor/shaka"

CLONE="$SHAKA_REL/scripts/shaka-player"
if [ ! -d "$CLONE/build" ]; then
  echo "No Shaka checkout at $CLONE. Run $SHAKA_REL/scripts/setup.sh first." >&2
  exit 1
fi
# Amazon's setup.sh can stop at the UI's CSS step (it fetches a Google Fonts
# stylesheet that now answers "Method Not Allowed") before the library is
# compiled. Caravela doesn't use Shaka's UI, so build the library without it,
# as all.py's "compiled" build does.
if [ ! -f "$DIST/shaka-player.compiled.js" ]; then
  for mode in release debug; do
    echo "Compiling Shaka ($mode, no UI)..."
    (cd "$CLONE" && python3 build/build.py --name compiled \
      +@complete -@ui -@polyfillForUI --force --mode "$mode")
  done
fi
if [ ! -d "$POLYFILLS" ]; then
  echo "No polyfills at $POLYFILLS. Is $SHAKA_REL the shaka-rel directory?" >&2
  exit 1
fi

rm -rf "$VENDOR"
mkdir -p "$VENDOR/dist"
# Only the library and its types; the rest of dist is build scaffolding.
for name in shaka-player.compiled shaka-player.compiled.debug; do
  cp "$DIST/$name.js" "$DIST/$name.d.ts" "$VENDOR/dist/"
done
cp -R "$POLYFILLS" "$VENDOR/polyfills"
# Shaka's Apache-2.0 licence, for the app's Licences screen (npm run licenses).
cp "$CLONE/LICENSE" "$VENDOR/LICENSE"
echo "Copied the Shaka build and Amazon's polyfills to $VENDOR"
