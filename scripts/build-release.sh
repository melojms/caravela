#!/usr/bin/env bash
# Builds the Release VPKGs with the version and build number set explicitly.
#
# The version is the [package] version in manifest.toml (the first version
# line, which the release workflow bumps). The Appstore needs a build number
# of at least 1 that goes up with every submission, so it's derived from the
# version: major * 1000000 + minor * 1000 + patch (1.2.3 -> 1002003).
# Never change this formula once a version is on the store: a later version
# could get a lower build number.
#
# Usage: scripts/build-release.sh [build-vega flags, e.g. --target armv7]
# MANIFEST overrides the manifest the version is read from.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="${MANIFEST:-$ROOT/manifest.toml}"

version=$(sed -n 's/^version = "\(.*\)"$/\1/p' "$MANIFEST" | head -1)

if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "Error: the version in $MANIFEST must be X.Y.Z with plain numbers, got '$version'" >&2
  exit 1
fi

# 10# keeps a leading zero from being read as octal.
major=$((10#${BASH_REMATCH[1]}))
minor=$((10#${BASH_REMATCH[2]}))
patch=$((10#${BASH_REMATCH[3]}))

if ((minor >= 1000 || patch >= 1000)); then
  echo "Error: minor and patch must be below 1000 to derive the build number, got $version" >&2
  exit 1
fi

number=$((major * 1000000 + minor * 1000 + patch))

if ((number < 1)); then
  echo "Error: the build number must be at least 1, got $number from $version" >&2
  exit 1
fi

echo "Version: $version"
echo "Build number: $number"

cd "$ROOT"
npx react-native build-vega --build-type Release \
  --build-version "$version" --build-number "$number" "$@"
