# Firmware updates

The app checks which firmware an Odak runs, offers the newest one for its board, downloads it,
checks its SHA-256 and flashes it. It reads the list of firmware from one JSON file.

## How the app decides

1. On connect it sends `$PRINT_VERSION`. The reply `v2.9` means firmware 2.9 on a **v2** board;
   `v1.7` means a **v1** (original) board. The major version number is the board.
2. It compares that with the list; a missing part counts as 0 (`v2.9` = 2.9.0 < 2.9.5).
   **Firmware must report its full version** (`$PRINT_VERSION` → `v2.9.5`, and the same on the
   start-up screen). A build that says `v2.9` while being 2.9.5 would be offered 2.9.5 on every
   connect.
3. When an update exists it asks once per session: *Update now* downloads and flashes it.
4. When the version can't be read (firmware older than `$PRINT_VERSION`, or the device does not
   answer, or it is not connected), the Firmware tab asks the user to hold the right-side button
   for 5 seconds, read the version on the start-up screen, and choose the board from a list.

## The firmware list

`firmware/firmware.json` on the `main` branch of this repository (public), read by the app from:

```
https://raw.githubusercontent.com/mountainlabs-dev/odak-gui/main/firmware/firmware.json
```

Format:

```json
{
  "boards": {
    "v2": {
      "name": "New board",
      "version": "2.9.5",
      "date": "2026-10-24",
      "url": "https://github.com/mountainlabs-dev/odak-gui/releases/download/firmware-v2-2.9.5/odak-v2-2.9.5.uf2",
      "sha256": "…64 hex characters…",
      "notes": "Air Coach action cards\nMeasurements no longer stop until a button press",
      "notes_tr": "Hava Koçu öneri kartları\nÖlçümler artık bir düğmeye basılana kadar durmaz"
    },
    "v1": { "…": "same fields" }
  }
}
```

Rules the app enforces:
- `url` must be `https://` (plain `http://` only for `127.0.0.1` while testing).
- The download must match `sha256` and be a valid UF2 image, or nothing is flashed.
- `notes` is shown to the user as plain text (new lines kept). `notes_tr` (optional) is shown
  instead when the app is in Turkish.

## Publishing a firmware

The `.uf2` files are attached to releases tagged `firmware-<board>-<version>`. They are never marked
"latest", so app releases (`v0.6.0` …) stay the latest release and the app build workflow (which
runs on `v*` tags) is not triggered.

```bash
scripts/publish-firmware.sh v2 2.9.5 ../odak_embed-v2fix/build/ODAK.uf2 "Air Coach action cards"
git add firmware/firmware.json && git commit -m "Firmware v2 2.9.5" && git push
```

The script checks that the version matches the board (2.x only for v2) and that the file is a UF2
image, uploads it, and writes the URL and SHA-256 into `firmware/firmware.json`. Devices are offered
the update as soon as that commit is on `main`.

## Testing a list locally

```bash
python3 -m http.server 8766 --directory ./test-firmware      # holds firmware.json and .uf2 files
ODAK_FIRMWARE_MANIFEST=http://127.0.0.1:8766/firmware.json npm start
```
