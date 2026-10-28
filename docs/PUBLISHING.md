# Publishing on the Microsoft Store, the Ubuntu App Center and the Mac App Store

The repository builds every package on GitHub Actions (`.github/workflows/release.yml`) whenever a
version tag is pushed. The steps below are the ones that need a person: accounts, names and the
store submissions.

Order: do steps 1 and 2 on the first day (identity checks take the longest), then 3–5.

---

## 1. Accounts (day 1)

| Store | Account | Cost | Notes |
|---|---|---|---|
| Microsoft Store | Partner Center, **company** account for Mountain Labs Teknoloji AŞ — https://partner.microsoft.com/dashboard | Free | Verification is faster with a D-U-N-S number |
| Snap Store (feeds the Ubuntu App Center) | Ubuntu One account, then sign in at https://snapcraft.io | Free | Use a company e-mail; you can add teammates later |

## 2. Reserve the names (day 1)

**Snap Store** — on a Linux machine:

```bash
sudo snap install snapcraft --classic
snapcraft login
snapcraft register odak-gui
```

**Microsoft Store** — Partner Center → Apps and games → New product → MSIX or PWA app →
reserve **Odak Air Quality Monitor** (fallback: *Odak Air — Mountain Labs*; then also set
`MSSTORE_DISPLAY_NAME` below).

## 3. Connect the stores to GitHub

GitHub → repository → Settings → Secrets and variables → Actions.

**Variables** (Partner Center → your app → Product management → Product identity):

| Variable | Copy from |
|---|---|
| `MSSTORE_IDENTITY_NAME` | Package/Identity/Name (e.g. `12345MountainLabs.OdakAirQualityMonitor`) |
| `MSSTORE_PUBLISHER` | Package/Identity/Publisher (`CN=…`) |
| `MSSTORE_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName |
| `MSSTORE_DISPLAY_NAME` | The name you reserved |

**Secret** for the Snap Store:

```bash
snapcraft export-login --snaps odak-gui --channels edge,beta,candidate,stable --acls package_access,package_push,package_release - 
```

Paste the printed text as the secret `SNAPCRAFT_STORE_CREDENTIALS`.

## 4. Build a release

```bash
npm version 0.6.0 --no-git-tag-version   # or the next version
git commit -am "Release 0.6.0"
git tag v0.6.0
git push && git push --tags
```

The workflow then:
- builds the `.deb`, the `.snap`, the Microsoft Store `.appx` and `Setup.exe`,
- uploads the snap to the Snap Store **edge** channel (once the secret exists),
- drafts a GitHub release with all files attached.

You can also run it by hand: Actions → Build and release → Run workflow (builds only, no upload).

## 5a. Microsoft Store submission

1. Test first: from the workflow's `windows` artifact, install `Odak-test-certificate.cer` into
   *Local Machine → Trusted People* on a Windows 11 PC, then double-click the `.appx`. Check connect,
   Insights sync and a firmware update with a real Odak.
2. Partner Center → your app → Start submission:
   - **Packages**: upload the `.appx` from the workflow artifact.
   - **Properties**: category *Utilities & tools*; privacy policy URL (publish `docs/PRIVACY.md` on
     mountainlabs.io first); support contact.
   - **Age ratings**: the questionnaire (no user content, no purchases, no data collection).
   - **Store listing**: English and Turkish text from `docs/STORE_LISTING.md`, screenshots.
   - **Submission options → restricted capability `runFullTrust`**, reason:
     *"Desktop app that talks to the user's Odak air-quality monitor over its USB serial port and
     updates its firmware by copying a file to the device's bootloader drive."*
3. Submit. Certification usually takes a few business days. Microsoft signs the published package.

## 5b. Snap Store / Ubuntu App Center

1. Test the edge build on Ubuntu 24.04 (and Pardus) with a real Odak:
   ```bash
   sudo snap install odak-gui --edge
   sudo snap connect odak-gui:raw-usb
   sudo snap connect odak-gui:removable-media
   ```
   Your user must be in the `dialout` group (`sudo usermod -aG dialout $USER`, then log in again).
2. Ask for automatic connections, so users don't need the commands above: post in
   https://forum.snapcraft.io/c/store-requests with the text below.
3. Fill in the listing at https://snapcraft.io/odak-gui/listing: icon, screenshots, banner,
   categories (Utilities, Science), contact and website.
4. Promote: `snapcraft status odak-gui` shows the revision; then
   `snapcraft release odak-gui <revision> stable`. Stable snaps appear in the Ubuntu App Center.

Forum post for step 2 (title: *Auto-connect request for odak-gui: raw-usb, removable-media*):

> `odak-gui` is the desktop app for the Odak air-quality monitor (Mountain Labs). The device is a
> USB CDC serial device (Raspberry Pi RP2040, USB vendor 2e8a). The app needs:
>
> - **raw-usb**: to open the device's serial port (/dev/ttyACM*) to read measurements, set the
>   clock, schedule and priorities, and download stored history. The device is the app's only
>   purpose; without the connection the app cannot do anything.
> - **removable-media**: to copy a firmware file onto the device's RPI-RP2 bootloader drive
>   (mounted under /media) during firmware updates.
>
> Source: https://github.com/mountainlabs-dev/odak-gui

## 5c. Mac App Store

Built and uploaded from a Mac (not in GitHub Actions: it needs your signing certificates).

**One-time setup** at https://developer.apple.com/account (Apple Developer Program):

1. **Identifiers** → `+` → App IDs → App → Bundle ID (explicit) **`io.mountainlabs.app`**
   (or the one already used for the app in App Store Connect; then set `MAS_BUNDLE_ID`).
2. **Certificates** → `+`, once each: **Apple Distribution** and **Mac Installer Distribution**.
   Download both and double-click them so they land in this Mac's login keychain. Check with
   `security find-identity -v` (the installer one shows as *3rd Party Mac Developer Installer*).
3. **Profiles** → `+` → Distribution → **Mac App Store Connect** → the bundle id above → the Apple
   Distribution certificate. Download it and save it as `packaging/macos/embedded.provisionprofile`
   (git ignores it).
4. App Store Connect → Apps → `+` New App → macOS, the same bundle id, SKU e.g. `odak-gui`.

**Each release:**

```bash
MAS_BUILD_NUMBER=1 npm run make:mas
```

`MAS_BUILD_NUMBER` must go up with every upload, even for the same version. The result is
`out/make/Mountain Labs-<version>-universal.pkg` (Apple Silicon and Intel in one).
Upload it with Apple's **Transporter** app (free on the Mac App Store), then pick the build in
App Store Connect → your app → macOS App → Build.

**Review notes** for App Review (App Information → App Review Information):

> Mountain Labs is the companion app for the Odak air-quality monitor by Mountain Labs,
> connected over USB. It uses the serial-port entitlement to read measurements and settings from
> the device. Firmware updates restart the device into its USB bootloader, which appears as a drive
> named RPI-RP2; the user selects that drive in an Open panel and the app copies the firmware file
> onto it. Without an Odak device the app shows no live data; a demo video is attached.

Attach a short screen recording of connecting an Odak and running a firmware update: reviewers
don't have the hardware.

The App Store build differs from the DMG only in firmware updates: it is sandboxed, so instead of
`scripts/flash.sh` (which needs Full Disk Access) it uses `src/mac-flash.js` and asks the user to
choose the RPI-RP2 drive.

## Keep shipping the .deb

Pardus users get the `.deb` from the GitHub release: it installs a udev rule, so it works with no
extra steps (no `dialout` group, no `snap connect`).
