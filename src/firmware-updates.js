// Firmware updates: find the latest firmware for the user's board and download it.
//
// The list of firmware lives in a small JSON manifest (see docs/FIRMWARE_UPDATES.md):
//   {
//     "boards": {
//       "v1": { "name": "Original board", "version": "1.7", "url": "https://.../odak-v1.7.uf2",
//               "sha256": "<hex>", "notes": "What changed", "notes_tr": "Neler değişti", "date": "2026-10-24" },
//       "v2": { ... }
//     }
//   }
// Board "v1" runs firmware 1.x, board "v2" runs 2.x: the major version number tells them apart.
// Every download is checked against its SHA-256 before it can be flashed.

const { net } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// firmware/firmware.json on the main branch of the public odak-gui repository
const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/mountainlabs-dev/odak-gui/main/firmware/firmware.json';
const manifestUrl = () => process.env.ODAK_FIRMWARE_MANIFEST || DEFAULT_MANIFEST_URL;
const TIMEOUT_MS = 15000;

/** HTTPS only, except a local test server. */
function checkUrl(url) {
  const u = new URL(url);
  const local = u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local) throw new Error(`Refusing to download over ${u.protocol} (${u.host})`);
}

async function fetchWithTimeout(url, ms) {
  checkUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await net.fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${new URL(url).host}`);
    return response;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`No answer from ${new URL(url).host} within ${ms / 1000} s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** The latest firmware per board: { v1: {...}, v2: {...} }. */
async function getManifest() {
  const response = await fetchWithTimeout(manifestUrl(), TIMEOUT_MS);
  const data = await response.json();
  const boards = {};
  for (const [board, entry] of Object.entries((data && data.boards) || {})) {
    if (!/^v\d+$/.test(board) || !entry || !/^\d+(\.\d+)+$/.test(String(entry.version))) continue;
    if (!entry.url || !/^[0-9a-f]{64}$/i.test(String(entry.sha256))) continue;
    boards[board] = {
      board,
      name: String(entry.name || `Board ${board}`),
      version: String(entry.version),
      url: String(entry.url),
      sha256: String(entry.sha256).toLowerCase(),
      notes: String(entry.notes || ''),
      notesTr: String(entry.notes_tr || ''),  // shown when the app is in Turkish
      date: String(entry.date || ''),
    };
  }
  return boards;  // may be empty until the first firmware is published
}

const sha256File = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});

/**
 * Download the firmware for `entry` into `dir` (reusing a verified earlier download) and return
 * its path. `progress(received, total)` follows the download.
 */
async function downloadFirmware(entry, dir, progress) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `odak-${entry.board}-${entry.version}.uf2`);
  if (fs.existsSync(file) && (await sha256File(file)) === entry.sha256) return file;

  const response = await fetchWithTimeout(entry.url, 120000);
  const total = Number(response.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  const chunks = [];
  let received = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    hash.update(value);
    received += value.length;
    progress(received, total);
  }
  const digest = hash.digest('hex');
  if (digest !== entry.sha256) {
    throw new Error('The downloaded firmware did not match its checksum, so it was not installed. Try again later.');
  }
  // A UF2 file is a whole number of 512-byte blocks, each starting with the UF2 magic
  const data = Buffer.concat(chunks);
  if (data.length === 0 || data.length % 512 !== 0 || data.readUInt32LE(0) !== 0x0a324655) {
    throw new Error('The downloaded file is not a UF2 firmware image.');
  }
  fs.writeFileSync(file, data);
  return file;
}

module.exports = { getManifest, downloadFirmware, manifestUrl };
