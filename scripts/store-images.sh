#!/usr/bin/env bash
# Builds the Appstore icons and the Fire TV background from the brand assets:
#
#   small-icon-114.png             the Sail on its rounded navy square
#                                  (caravela-icon.svg), transparent corners
#   firetv-icon-1280x720.png       Sail + "Caravela" (caravela-pill.svg) on navy,
#                                  fitted inside the centred 882x448 safe area
#   firetv-background-1920x1080.png  navy with the Sail (caravela-icon.svg) on
#                                  the right, no text
#
# The Fire TV images have no alpha channel (Amazon rejects transparency there).
# SVGs are rendered with resvg (pinned below); ImageMagick does the rest.
# Screenshots aren't made here: see "Full-size captures" in docs/HANDOFF.md.
#
# Usage: scripts/store-images.sh <output directory>

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <output directory>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$1"
OUT="$(cd "$1" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

RESVG=(npx --yes @resvg/resvg-js-cli@2.6.2-beta.1 --no-system-font)
# No timestamps in the PNGs, so two runs give the same files.
PNG_OPTS=(-strip -define png:exclude-chunks=date,time)

render() { # <svg> <png> [resvg options]
  local log
  log=$("${RESVG[@]}" "${@:3}" "$1" "$2" 2>&1) || { echo "$log" >&2; exit 1; }
}

# The brand's navy, as a diagonal gradient over a w x h canvas that looks like
# the 16:9 strip (y 112-400) the launcher shows of the 512x512 pill.
navy_rect() { # <w> <h>
  local s a b
  s=$(awk -v w="$1" 'BEGIN { print w / 512 }')
  # t = (x + y + 112) / 1024 on the strip, as on the square pill.
  a=$(awk -v s="$s" 'BEGIN { print -56 * s }')
  b=$(awk -v s="$s" 'BEGIN { print 456 * s }')
  cat <<EOF
  <defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="$a" y1="$a" x2="$b" y2="$b"><stop offset="0" stop-color="#103457"/><stop offset="1" stop-color="#0a1f38"/></linearGradient>
  </defs>
  <rect width="$1" height="$2" fill="url(#bg)"/>
EOF
}

# The artwork of a brand SVG without its background <rect>, in its own
# 512x512 coordinates.
artwork() { # <svg>
  sed -n '/<defs>/,/<\/svg>/p' "$1" | grep -v '<rect ' | grep -v '</svg>'
}

# Fits <svg>'s artwork into a box of bw x bh centred on (cx, cy) of the
# canvas and prints the <g> for it. The real bounds come from a transparent
# render, not from the SVG's nominal box.
fitted() { # <svg> <bw> <bh> <cx> <cy>
  local probe="$WORK/probe.svg" k=8 bounds
  { echo '<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="4096" viewBox="0 0 512 512">'
    artwork "$1"
    echo '</svg>'; } > "$probe"
  render "$probe" "$WORK/probe.png"
  bounds=$(convert "$WORK/probe.png" -format '%@' info:)  # WxH+X+Y at scale k
  awk -v b="$bounds" -v k="$k" -v bw="$2" -v bh="$3" -v cx="$4" -v cy="$5" 'BEGIN {
    split(b, p, /[x+]/)
    w = p[1] / k; h = p[2] / k; x = p[3] / k; y = p[4] / k
    s = bw / w; if (bh / h < s) s = bh / h
    printf "  <g transform=\"translate(%.3f %.3f) scale(%.5f)\">\n", cx - (x + w / 2) * s, cy - (y + h / 2) * s, s
  }'
  artwork "$1"
  echo '  </g>'
}

flatten() { # <png in> <png out>
  convert "$1" -background '#0a1f38' -alpha remove -alpha off "${PNG_OPTS[@]}" "PNG24:$2"
}

# Small icon: the Sail alone, rendered straight at 114x114 (the pill's
# wordmark is unreadable that small). Transparency is allowed here.
render "$ROOT/assets/brand/caravela-icon.svg" "$WORK/small.png" --fit-width 114
convert "$WORK/small.png" "${PNG_OPTS[@]}" "PNG32:$OUT/small-icon-114.png"

# Fire TV icon: the pill's content filling the centred 882x448 safe area.
{ echo '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">'
  navy_rect 1280 720
  fitted "$ROOT/assets/brand/caravela-pill.svg" 882 448 640 360
  echo '</svg>'; } > "$WORK/icon.svg"
render "$WORK/icon.svg" "$WORK/icon.png"
flatten "$WORK/icon.png" "$OUT/firetv-icon-1280x720.png"

# Fire TV background: the Sail alone, 500 px tall, centred at (1260, 540).
# That keeps it on the right and inside the 1214x830 area whether Amazon
# centres it or puts it on the right (x 706-1920, y 125-955).
{ echo '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">'
  navy_rect 1920 1080
  fitted "$ROOT/assets/brand/caravela-icon.svg" 500 500 1260 540
  echo '</svg>'; } > "$WORK/background.svg"
render "$WORK/background.svg" "$WORK/background.png"
flatten "$WORK/background.png" "$OUT/firetv-background-1920x1080.png"

identify -format '%f %wx%h %[channels] %m\n' \
  "$OUT/small-icon-114.png" "$OUT/firetv-icon-1280x720.png" "$OUT/firetv-background-1920x1080.png"
