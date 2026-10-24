# ODAK Air Quality Monitor — Web Version

The desktop GUI as a web page. It talks to the device straight from the browser
through the **Web Serial API**, so there is nothing to install.

## Requirements

- **Google Chrome or Microsoft Edge** (or another Chromium browser) on Windows,
  macOS, Linux or ChromeOS. Firefox, Safari and all iPhone/iPad browsers do not
  support Web Serial.
- The page must be served over **HTTPS**, or from `localhost` during development.
- Linux: the user needs access to the serial port. Install the desktop app's
  `.deb` once (it adds a udev rule), or run
  `sudo usermod -aG dialout $USER` and log in again.

## Running it locally

```bash
cd web
python3 -m http.server 8765
```

Then open <http://localhost:8765> in Chrome.

## Hosting

Copy the files in this folder (`index.html`, `app.js`, `serial.js`,
`styles.css`, `odak.png`) to any static HTTPS host (GitHub Pages, Netlify,
your own web server). Bootstrap, Chart.js and the fonts load from public CDNs.

## Differences from the desktop app

| Feature | Desktop | Web |
|---|---|---|
| Choosing the device | Port dropdown (ODAK devices are labelled and preselected) | Chrome's device picker (shows ODAK devices only) |
| Data logging | Written to a file as data arrives | Kept in the page; **Download CSV/JSON** when done |
| Console export | Save dialog | Browser download |
| Firmware update | Flash scripts | The device is restarted into update mode, then you select the **RPI-RP2** drive and the page writes the `.uf2` onto it. If that step fails, drag the file onto the drive yourself |

Both versions also share: the **Device Clock** card (Set Device Time, automatic
setting on connect, the device clock read back with `$GET_TIME`), the firmware
version and battery voltage display, and automatic reconnection after a reset,
firmware update or replug.

## Device clock protocol

The page sets the device clock with:

```
$SET_TIME,<unix seconds, UTC>,<UTC offset in minutes>
```

for example `$SET_TIME,1791971696,180` for 14 Oct 2026 12:54:56 in Türkiye (UTC+3).
The firmware answers:

```
Time set: 2026-10-14 09:54:56 UTC, offset +180 min
SET_TIME error: use $SET_TIME,<unix seconds UTC>,<UTC offset minutes>   (bad value)
Unknown command: SET_TIME                                              (older firmware)
```

`$GET_TIME` reads the clock back; the page shows the result in the Device Clock card:

```
Time: 2026-10-14 09:55:01 UTC (local 2026-10-14 12:55:01, offset +180 min)
Time: not set (clock reads 2000-01-01 00:03:12 since it last started)
```

The device only reads commands when it is not busy (booting or measuring), so
the page first sends `$GET_SETTINGS` and waits for its reply, then sends the time
right away so it is not stale.
