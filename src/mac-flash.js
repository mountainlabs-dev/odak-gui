// Firmware update on macOS inside the App Store sandbox, done by the app itself.
//
// The sandbox cannot run scripts/flash.sh or write to /Volumes on its own, so:
// 1. Reset Odak into its USB bootloader by opening the serial port at 1200 baud.
// 2. Ask the user to choose the RPI-RP2 drive in an Open dialog; choosing it is what gives
//    the sandboxed app permission to write there (com.apple.security.files.user-selected.read-write).
// 3. Copy the .uf2 file onto the drive; Odak flashes it and restarts, and the drive goes away.

const fs = require('fs');
const path = require('path');
const { resetToBootloader, FlashError } = require('./linux-flash');

const LABEL = 'RPI-RP2';
const DEFAULT_DRIVE = path.join('/Volumes', LABEL);
const MOUNT_WAIT_MS = 8000;          // Finder mounts the drive a few seconds after the reset
const COPY_TIMEOUT_MS = 20000;
const REBOOT_TIMEOUT_MS = 15000;

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
  const target = path.join(drive, path.basename(firmwarePath));
  try {
    await Promise.race([
      fs.promises.copyFile(firmwarePath, target),
      sleep(COPY_TIMEOUT_MS).then(() => { throw new Error(`timed out after ${COPY_TIMEOUT_MS / 1000} s`); }),
    ]);
  } catch (err) {
    // Odak restarts as soon as it has the whole image, which can fail the end of the copy
    if (isBootloaderDrive(drive)) throw new FlashError(`Copying the firmware to ${drive} failed: ${err.message}`, 'copy');
  }

  // The drive disappears when Odak restarts with the new firmware
  const copied = Date.now();
  while (isBootloaderDrive(drive) && Date.now() - copied < REBOOT_TIMEOUT_MS) await sleep(500);
  if (isBootloaderDrive(drive)) {
    throw new FlashError(`Odak was reset but did not take the firmware. Drag the .uf2 file onto the ${LABEL} drive yourself.`, 'not-flashed');
  }
  progress('Flash successful');
}

module.exports = { flashMac };
