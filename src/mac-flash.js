// Firmware update on macOS inside the App Store sandbox, done by the app itself.
//
// The sandbox cannot run scripts/flash.sh or write to /Volumes on its own, so:
// 1. Reset Odak into its USB bootloader by opening the serial port at 1200 baud.
// 2. Ask the user to choose the RPI-RP2 drive in an Open dialog; choosing it is what gives
//    the sandboxed app permission to write there (com.apple.security.files.user-selected.read-write).
// 3. Copy the .uf2 file onto the drive; Odak flashes it and restarts, and the drive goes away.

const fs = require('fs');
const path = require('path');
const { resetToBootloader, copyToDrive, FlashError } = require('./linux-flash');

const LABEL = 'RPI-RP2';
const DEFAULT_DRIVE = path.join('/Volumes', LABEL);
const MOUNT_WAIT_MS = 8000;          // Finder mounts the drive a few seconds after the reset

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isBootloaderDrive = (dir) => fs.existsSync(path.join(dir, 'INFO_UF2.TXT'));

/**
 * Flash `firmwarePath` onto Odak. `portPath` may be null when the device is already in
 * bootloader mode. `chooseDrive(defaultPath)` shows the Open dialog and resolves to the chosen
 * folder, or null when cancelled. `progress(message)` uses the same words as flashLinux.
 */
async function flashMac({ portPath, firmwarePath, progress, chooseDrive }) {
  if (!fs.existsSync(firmwarePath)) throw new Error(`Firmware file not found at: ${firmwarePath}`);

  if (portPath) {
    progress(`Resetting Odak on ${portPath}...`);
    await resetToBootloader(portPath);
  } else {
    progress('No device connected. Hold BOOTSEL while plugging Odak in to start update mode.');
  }

  // Outside the sandbox (or when macOS lets us look) wait for the drive before asking
  progress(`Waiting for Odak to appear as ${LABEL}...`);
  const started = Date.now();
  while (!fs.existsSync(DEFAULT_DRIVE) && Date.now() - started < MOUNT_WAIT_MS) await sleep(500);

  progress(`Choose the ${LABEL} drive so the app can copy the firmware onto it.`);
  const drive = await chooseDrive(DEFAULT_DRIVE);
  if (!drive) {
    throw new FlashError(`Firmware update cancelled. Odak stays in update mode until you unplug it.`, 'not-mounted');
  }
  if (!isBootloaderDrive(drive)) {
    throw new FlashError(`${drive} is not the ${LABEL} drive. Try again and choose ${LABEL} in the sidebar.`, 'not-mounted');
  }

  progress(`Copying flash file to Odak (${drive})...`);
  await copyToDrive({ firmwarePath, drive, isDrive: () => isBootloaderDrive(drive) });
  progress('Flash successful');
}

module.exports = { flashMac };
