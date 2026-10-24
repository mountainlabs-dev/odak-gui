# Odak firmware

`firmware.json` lists the newest firmware for each Odak board. The desktop app reads it from
`https://raw.githubusercontent.com/mountainlabs-dev/odak-gui/main/firmware/firmware.json`
to offer updates; the `.uf2` files are attached to the `firmware-*` releases of this repository.

| Board | Firmware line | How to tell |
|---|---|---|
| v1 — original board | 1.x | start-up screen shows `v1.…` in the top-right corner |
| v2 — new board | 2.x | start-up screen shows `v2.…` |

To publish a build, see [`scripts/publish-firmware.sh`](../scripts/publish-firmware.sh) and
[`docs/FIRMWARE_UPDATES.md`](../docs/FIRMWARE_UPDATES.md).

To install a file by hand: hold BOOTSEL while plugging Odak in (or let the app restart it into
update mode), then copy the `.uf2` file onto the `RPI-RP2` drive.
