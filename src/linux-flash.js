// Firmware update on Linux, done by the app itself (works in the .deb and in the strict snap).
//
// 1. Reset Odak into its USB bootloader by opening the serial port at 1200 baud.
// 2. Wait for the RPI-RP2 drive the desktop mounts under /media/$USER or /run/media/$USER
//    (a snap reaches those through the removable-media interface). Outside a snap, if the
//    desktop does not mount it, ask udisks to.
// 3. Copy the .uf2 file onto the drive; Odak flashes it and restarts, and the drive goes away.
//
// Replaces scripts/flash-linux.sh, which needed stty, findmnt and udisksctl.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { SerialPort } = require('serialport');

const LABEL = 'RPI-RP2';
const BOOTLOADER_BAUD = 1200;
const MOUNT_TIMEOUT_MS = 60000;      // includes time for the user to open the drive themselves
const UDISKS_AFTER_MS = 6000;        // give the desktop this long to mount it before asking udisks
const COPY_TIMEOUT_MS = 20000;
const REBOOT_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class FlashError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;  // 'permission' | 'not-mounted' | 'copy' | 'not-flashed'
  }
}

/** Folders a desktop mounts removable drives in. */
function mediaRoots() {
  const user = os.userInfo().username;
  return [path.join('/media', user), path.join('/run/media', user), '/media'];
}

/** The mounted bootloader drive (a folder with INFO_UF2.TXT, named RPI-RP2...), or null. */
function findBootloaderDrive(roots = mediaRoots()) {
  for (const root of roots) {
    let names;
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.startsWith(LABEL)) continue;
      const dir = path.join(root, name);
      if (fs.existsSync(path.join(dir, 'INFO_UF2.TXT'))) return dir;
    }
  }
  return null;
}

/** Open the port at 1200 baud and close it: the Pico SDK reboots into the bootloader. */
async function resetToBootloader(portPath) {
  const port = new SerialPort({ path: portPath, baudRate: BOOTLOADER_BAUD, autoOpen: false });
  try {
    await new Promise((resolve, reject) => port.open((err) => (err ? reject(err) : resolve())));
  } catch (err) {
    if (/permission denied|EACCES/i.test(err.message)) throw new FlashError(err.message, 'permission');
    throw err;
  }
  await new Promise((resolve) => port.close(() => resolve()));  // the device may already be gone
}

/** Ask udisks to mount the drive (only outside a snap, where udisksctl exists). */
function mountWithUdisks() {
  if (process.env.SNAP) return;
  const device = `/dev/disk/by-label/${LABEL}`;
  if (!fs.existsSync(device)) return;
  try {
    const child = spawn('udisksctl', ['mount', '-b', device, '--no-user-interaction'], { stdio: 'ignore' });
    child.on('error', () => { /* udisks not installed */ });
  } catch { /* ignore */ }
}

/**
 * Flash `firmwarePath` onto Odak. `portPath` may be null when the device is already in
 * bootloader mode (BOOTSEL held while plugging in). `progress(message)` reports each step
 * with the words the firmware tab listens for (Resetting / Waiting / Copying / Flash successful).
 */
async function flashLinux({ portPath, firmwarePath, progress, roots = mediaRoots() }) {
  if (!fs.existsSync(firmwarePath)) throw new Error(`Firmware file not found at: ${firmwarePath}`);

  if (portPath) {
    progress(`Resetting Odak on ${portPath}...`);
    await resetToBootloader(portPath);
  } else {
    progress('No device connected. Hold BOOTSEL while plugging Odak in to start update mode.');
  }

  progress(`Waiting for Odak to appear as ${LABEL}...`);
  const started = Date.now();
  let askedUdisks = false;
  let hinted = false;
  let drive = findBootloaderDrive(roots);
  while (!drive && Date.now() - started < MOUNT_TIMEOUT_MS) {
    await sleep(500);
    const waited = Date.now() - started;
    if (!askedUdisks && waited > UDISKS_AFTER_MS) {
      askedUdisks = true;
      mountWithUdisks();
    }
    if (!hinted && waited > 12000) {
      hinted = true;
      progress(`Waiting for ${LABEL}... if it does not open by itself, open the ${LABEL} drive in your file manager.`);
    }
    drive = findBootloaderDrive(roots);
  }
  if (!drive) {
    throw new FlashError(
      `The ${LABEL} drive did not appear. Open it in your file manager and try again, ` +
      'or drag the .uf2 file onto it yourself.',
      'not-mounted',
    );
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
    if (fs.existsSync(drive)) throw new FlashError(`Copying the firmware to ${drive} failed: ${err.message}`, 'copy');
  }

  // The drive disappears when Odak restarts with the new firmware
  const copied = Date.now();
  while (findBootloaderDrive(roots) && Date.now() - copied < REBOOT_TIMEOUT_MS) await sleep(500);
  if (findBootloaderDrive(roots)) {
    throw new FlashError('Odak was reset but did not take the firmware. Drag the .uf2 file onto the RPI-RP2 drive yourself.', 'not-flashed');
  }
  progress('Flash successful');
}

module.exports = { flashLinux, findBootloaderDrive, FlashError };
