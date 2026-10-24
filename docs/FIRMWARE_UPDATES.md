# Firmware updates

The app checks which firmware an Odak runs, offers the newest one for its board, downloads it,
checks its SHA-256 and flashes it. It reads the list of firmware from one JSON file.

## How the app decides

1. On connect it sends `$PRINT_VERSION`. The reply `v2.9` means firmware 2.9 on a **v2** board;
   `v1.7` means a **v1** (original) board. The major version number is the board.
2. It compares that with the list. The device reports major.minor only, so a `2.9.1` build counts
   as `2.9`; publish a new minor version (`2.10`) when the app should offer an update.
3. When an update exists it asks once per session: *Update now* downloads and flashes it.
4. When the version can't be read (firmware older than `$PRINT_VERSION`, or the device does not
   answer, or it is not connected), the Firmware tab asks the user to hold the right-side button
   for 5 seconds, read the version on the start-up screen, and choose the board from a list.

## The firmware list

Default address (set in `src/firmware-updates.js`):

```
https://github.com/mountainlabs-dev/odak-firmware/releases/latest/download/firmware.json
```

Format:

```json
{
  "boards": {
    "v1": {
      "name": "Original board",
      "version": "1.7",
      "date": "2026-10-24",
      "url": "https://github.com/mountainlabs-dev/odak-firmware/releases/download/2026-10-24/odak-v1-1.7.uf2",
      "sha256": "…64 hex characters…",
      "notes": "Measurements no longer stop until a button press\nThis month page"
    },
    "v2": {
      "name": "New board",
      "version": "2.10",
      "date": "2026-10-24",
      "url": "https://github.com/mountainlabs-dev/odak-firmware/releases/download/2026-10-24/odak-v2-2.10.uf2",
      "sha256": "…",
      "notes": "Air Coach: action cards and results in the app"
    }
  }
}
```

Rules the app enforces:
- `url` must be `https://` (plain `http://` only for `127.0.0.1` while testing).
- The download must match `sha256` and be a valid UF2 image, or nothing is flashed.
- `notes` is shown to the user as plain text (new lines kept).

## Publishing a firmware (proposal)

The firmware source (`mountainlabs-dev/odak_embed`) is private, and the app downloads without a
login, so the files need a public home. Suggested: a public repository
`mountainlabs-dev/odak-firmware` that holds only release files.

For each release:

```bash
# in odak_embed, for each board line: build, then
sha256sum build/ODAK.uf2
cp build/ODAK.uf2 odak-v2-2.10.uf2

# write firmware.json with both boards (copy the previous one and change the board you release)
gh release create 2026-10-24 --repo mountainlabs-dev/odak-firmware \
  --title "Odak firmware 2026-10-24" --notes "v2.10: …" \
  odak-v1-1.7.uf2 odak-v2-2.10.uf2 firmware.json
```

Because the app reads `releases/latest/download/firmware.json`, publishing a new release is all it
takes; every release must include `firmware.json` and the files it points to.

## Testing a list locally

```bash
python3 -m http.server 8766 --directory ./test-firmware      # holds firmware.json and .uf2 files
ODAK_FIRMWARE_MANIFEST=http://127.0.0.1:8766/firmware.json npm start
```
