#!/usr/bin/env bash
# Packages extension/ into a zip suitable for Chrome Web Store upload.
# Output: dist/nanochat-<version>.zip (version read from manifest.json).
#
# Excludes dev artifacts that ship in the source tree but shouldn't be in the
# store package (icons/preview.html, .DS_Store, etc.). Stages to a temp dir
# first so the source tree is never touched.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/extension"
DIST="$ROOT/dist"

if [ ! -f "$SRC/manifest.json" ]; then
  echo "error: $SRC/manifest.json not found" >&2
  exit 1
fi

VERSION="$(node -e "console.log(require('$SRC/manifest.json').version)")"
if [ -z "$VERSION" ]; then
  echo "error: could not read version from manifest.json" >&2
  exit 1
fi

ZIP_NAME="nanochat-$VERSION.zip"
ZIP_PATH="$DIST/$ZIP_NAME"

mkdir -p "$DIST"
rm -f "$ZIP_PATH"

STAGE="$(mktemp -d -t nanochat-store-XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

cp -R "$SRC" "$STAGE/extension"

# Strip dev-only files from the staged copy.
rm -f "$STAGE/extension/icons/preview.html"
rm -f "$STAGE/extension/icons/icon.svg"
find "$STAGE/extension" -name '.DS_Store' -delete
find "$STAGE/extension" -name '*.map' -delete

# Sanity check: manifest must still be there after stripping.
if [ ! -f "$STAGE/extension/manifest.json" ]; then
  echo "error: manifest.json missing from staging dir" >&2
  exit 1
fi

# Zip from inside the staged extension/ so paths in the archive are flat
# (manifest.json at root, not extension/manifest.json) — CWS requires this.
( cd "$STAGE/extension" && zip -r -q -X "$ZIP_PATH" . )

echo "Built: $ZIP_PATH"
echo "Size:  $(du -h "$ZIP_PATH" | cut -f1)"
echo
echo "Contents:"
unzip -l "$ZIP_PATH"
