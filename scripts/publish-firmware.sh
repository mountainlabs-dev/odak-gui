#!/usr/bin/env bash
# Publish an Odak firmware build so the desktop app offers it as an update.
#
#   scripts/publish-firmware.sh <board> <version> <file.uf2> "<release notes>"
#   scripts/publish-firmware.sh v2 2.9.5 ../odak_embed-v2fix/build/ODAK.uf2 "Air Coach; measurement fix"
#
# It uploads the file to a GitHub release (tag firmware-<board>-<version>, not marked latest, so app
# releases stay "latest"), then updates firmware/firmware.json. Commit and push that file to main:
# the app reads the list from there. Needs: gh (logged in), node, sha256sum.
set -euo pipefail

REPO=mountainlabs-dev/odak-gui
die() { echo "error: $*" >&2; exit 1; }

[ $# -ge 3 ] || die "usage: $0 <v1|v2> <version> <file.uf2> \"<notes>\""
board=$1 version=$2 uf2=$3 notes=${4:-}

[[ $board =~ ^v[0-9]+$ ]] || die "board must look like v1 or v2"
[[ $version =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || die "version must look like 2.9 or 2.9.5"
[ "v${version%%.*}" = "$board" ] || die "firmware $version is for board v${version%%.*}, not $board"
[ -f "$uf2" ] || die "no such file: $uf2"
# Every UF2 block starts with the magic "UF2\n"
[ "$(head -c 4 "$uf2")" = "$(printf 'UF2\n')" ] || die "$uf2 is not a UF2 firmware image"

tag="firmware-$board-$version"
name="odak-$board-$version.uf2"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp "$uf2" "$work/$name"
sha=$(sha256sum "$work/$name" | cut -d' ' -f1)
url="https://github.com/$REPO/releases/download/$tag/$name"
today=$(date +%Y-%m-%d)

echo "Publishing $name ($sha) as $tag"
gh release create "$tag" --repo "$REPO" --latest=false \
  --title "Odak firmware $version ($board board)" --notes "${notes:-Odak firmware $version for the $board board.}" \
  "$work/$name"

list="$(dirname "$0")/../firmware/firmware.json"
BOARD="$board" VERSION="$version" URL="$url" SHA="$sha" DATE="$today" NOTES="$notes" LIST="$list" node -e '
  const fs = require("fs");
  const e = process.env;
  const list = fs.existsSync(e.LIST) ? JSON.parse(fs.readFileSync(e.LIST, "utf8")) : { boards: {} };
  list.boards = list.boards || {};
  list.boards[e.BOARD] = {
    name: e.BOARD === "v1" ? "Original board" : e.BOARD === "v2" ? "New board" : `Board ${e.BOARD}`,
    version: e.VERSION, date: e.DATE, url: e.URL, sha256: e.SHA, notes: e.NOTES,
  };
  fs.writeFileSync(e.LIST, JSON.stringify(list, null, 2) + "\n");
'
echo "Updated firmware/firmware.json. Now: git add firmware/firmware.json && git commit -m \"Firmware $board $version\" && git push"
