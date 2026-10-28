# Mountain Labs: Privacy Policy

*Türkçe: [PRIVACY.tr.md](PRIVACY.tr.md)*

Last updated: 28 October 2026

This policy covers the Mountain Labs desktop app for the Odak air quality monitor (previously
called *Odak Air Quality Monitor*), by Mountain Labs Teknoloji AŞ ("Mountain Labs"), on macOS (Mac
App Store and .dmg), Windows (Microsoft Store and download) and Linux (Snap Store and .deb package).

## What the app does with your data

The app talks to your Odak device over its USB cable. Everything it reads stays on your computer:

- **Measurements and Air Coach history** are kept in the app's own folder on your computer, so
  later syncs only fetch new readings.
- **Files you save** (logs, history exports, backups, console exports) go only where you choose.
- **Your plan and priorities** (schedule, allergy / infection / fatigue / focus) are stored on your
  Odak device and in the app on your computer.
- **Your settings** (interface language, board type, automatic clock setting) are kept in the app
  on your computer.

## What the app does not do

- It does not send any data to Mountain Labs or anyone else.
- It does not use analytics, crash reporting, advertising or tracking.
- It does not create accounts or ask for personal details.
- It connects to the internet only to check for and download Odak firmware updates: it reads
  the firmware list and, when you agree to an update, downloads the firmware file from
  Mountain Labs' release page on GitHub. These requests carry no personal data or device data;
  like any download, the server sees your IP address.
- Links you click yourself (for example *Help → Mountain Labs Website*) open in your web browser.

## Health information

Air Coach suggestions and priorities help you lower your exposure to known indoor-air triggers.
They are not medical advice, and the app does not diagnose, treat or prevent any condition.
Your priorities never leave your computer and device.

## Deleting your data

The app keeps its data in one folder:

- **macOS, Mac App Store:** `~/Library/Containers/io.mountainlabs.app`
- **macOS, .dmg:** `~/Library/Application Support/Mountain Labs` (or `ODAK Air Quality Monitor`
  if you used the app before it was renamed)
- **Windows:** `%APPDATA%\Mountain Labs` (or `ODAK Air Quality Monitor`); uninstalling the Microsoft
  Store version removes it
- **Linux:** `~/.config/Mountain Labs` (or `ODAK Air Quality Monitor`); removing the snap removes it

Delete that folder to remove everything the app stored. Files you exported yourself stay where you
saved them. To clear the device's own stored measurements, use the `$DATA_ERASE,1` command in the
app's CLI tab.

## Children

The app does not collect data from anyone, including children.

## Changes and contact

If this policy changes, the new version will be published at the same address with a new date.
Questions: Mountain Labs, https://mountainlabs.io
