#!/usr/bin/env node
// Build the Microsoft Store package (.msix) on any OS, from the Windows app that
// `electron-forge package --platform=win32 --arch=x64` leaves in out/.
//
//   npm run make:msix          (packages the Windows app first, then runs this)
//
// An MSIX is a ZIP with three extra parts, written the way MakeAppx writes them:
//   AppxManifest.xml     from packaging/windows/AppxManifest.xml (see packaging/windows/store.js)
//   AppxBlockMap.xml     every file's size, ZIP header size and a SHA-256 per 64 KB block; each
//                        block is deflated on its own (full flush), and its compressed size listed
//   [Content_Types].xml  the MIME type of every part
// The package is unsigned: the Store signs it. To try it on a Windows PC first, unzip it and run
// `Add-AppxPackage -Register AppxManifest.xml` in PowerShell with Developer Mode on.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { version, productName } = require('../package.json');
const { hasStoreIdentity, manifestXml } = require('../packaging/windows/store');

const ROOT = path.join(__dirname, '..');
const APP_DIR = process.argv[2] || path.join(ROOT, 'out', `${productName}-win32-x64`);
const ASSETS_DIR = path.join(ROOT, 'packaging', 'windows', 'assets');
const OUT_FILE = path.join(ROOT, 'out', 'make', 'msix', `${productName}-${version}-x64.msix`);
const BLOCK = 64 * 1024;

const CONTENT_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', ico: 'image/vnd.microsoft.icon', html: 'text/html', json: 'application/json',
  xml: 'application/xml', txt: 'text/plain', exe: 'application/x-msdownload', dll: 'application/x-msdownload',
};

// ─── CRC-32 (ZIP) ───────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP item name of a part (OPC): '/'-separated, characters outside the allowed set percent-encoded. */
const zipName = (rel) => rel.split('/').map((seg) => seg.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]/g,
  (ch) => [...Buffer.from(ch, 'utf8')].map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`).join(''))).join('/');
const xmlEscape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function listFiles(dir, prefix) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(full, rel));
    else if (entry.isFile()) out.push({ rel, read: () => fs.readFileSync(full) });
  }
  return out;
}

/** Deflate 64 KB blocks independently; returns the stream and each block's hash and compressed size. */
function compressBlocks(data) {
  const parts = [];
  const blocks = [];
  for (let off = 0; off < data.length; off += BLOCK) {
    const chunk = data.subarray(off, Math.min(off + BLOCK, data.length));
    const last = off + BLOCK >= data.length;
    const compressed = zlib.deflateRawSync(chunk, { level: 9, finishFlush: last ? zlib.constants.Z_FINISH : zlib.constants.Z_FULL_FLUSH });
    parts.push(compressed);
    blocks.push({ hash: crypto.createHash('sha256').update(chunk).digest('base64'), size: compressed.length });
  }
  return { data: Buffer.concat(parts), blocks };
}

function main() {
  if (!fs.existsSync(path.join(APP_DIR, 'odak-gui.exe'))) {
    throw new Error(`No Windows app at ${APP_DIR}. Run: npx electron-forge package --platform=win32 --arch=x64`);
  }
  if (!hasStoreIdentity()) {
    console.warn('Warning: MSSTORE_* identity not set; this package is for testing and the Store will reject it.');
  }

  const parts = [
    ...listFiles(APP_DIR, 'app'),
    ...listFiles(ASSETS_DIR, 'assets'),
    { rel: 'AppxManifest.xml', read: () => Buffer.from(manifestXml(), 'utf8') },
  ];

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const fd = fs.openSync(OUT_FILE, 'w');
  let offset = 0;
  const central = [];
  const write = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };

  /** Local file header + data; remembers the central directory entry. */
  function addEntry(name, raw, stored, compressed) {
    const nameBuf = Buffer.from(name, 'utf8');
    const method = stored ? 0 : 8;
    const body = stored ? raw : compressed;
    const crc = crc32(raw);
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);           // version needed
    lfh.writeUInt16LE(0, 6);            // flags
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10);           // time
    lfh.writeUInt16LE(0x21, 12);        // date: 1980-01-01
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(body.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);           // extra length
    central.push({ nameBuf, method, crc, csize: body.length, usize: raw.length, offset });
    write(lfh);
    write(nameBuf);
    write(body);
    return 30 + nameBuf.length;         // LfhSize in the block map
  }

  const blockMapFiles = [];
  const extensions = new Map();
  const overrides = [];
  for (const part of parts) {
    const raw = part.read();
    const name = zipName(part.rel);
    const ext = path.extname(part.rel).slice(1).toLowerCase();
    if (ext) extensions.set(ext, CONTENT_TYPES[ext] || 'application/octet-stream');
    else overrides.push([`/${name}`, 'application/octet-stream']);
    if (raw.length === 0) {
      const lfhSize = addEntry(name, raw, true);
      blockMapFiles.push(`<File Name="${xmlEscape(part.rel.replace(/\//g, '\\'))}" Size="0" LfhSize="${lfhSize}"/>`);
      continue;
    }
    const { data, blocks } = compressBlocks(raw);
    const lfhSize = addEntry(name, raw, false, data);
    blockMapFiles.push(`<File Name="${xmlEscape(part.rel.replace(/\//g, '\\'))}" Size="${raw.length}" LfhSize="${lfhSize}">`
      + blocks.map((b) => `<Block Hash="${b.hash}" Size="${b.size}"/>`).join('') + '</File>');
  }

  const blockMap = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\r\n'
    + '<BlockMap xmlns="http://schemas.microsoft.com/appx/2010/blockmap" HashMethod="http://www.w3.org/2001/04/xmlenc#sha256">'
    + blockMapFiles.join('') + '</BlockMap>', 'utf8');
  addEntry('AppxBlockMap.xml', blockMap, false, zlib.deflateRawSync(blockMap, { level: 9 }));

  overrides.push(['/AppxManifest.xml', 'application/vnd.ms-appx.manifest+xml'], ['/AppxBlockMap.xml', 'application/vnd.ms-appx.blockmap+xml']);
  const contentTypes = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\r\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + [...extensions].map(([ext, type]) => `<Default Extension="${xmlEscape(ext)}" ContentType="${type}"/>`).join('')
    + overrides.map(([part, type]) => `<Override PartName="${xmlEscape(part)}" ContentType="${type}"/>`).join('')
    + '</Types>', 'utf8');
  addEntry('[Content_Types].xml', contentTypes, false, zlib.deflateRawSync(contentTypes, { level: 9 }));

  // Central directory and its end record
  const cdStart = offset;
  for (const e of central) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE(20, 4);             // version made by
    h.writeUInt16LE(20, 6);             // version needed
    h.writeUInt16LE(0, 8);
    h.writeUInt16LE(e.method, 10);
    h.writeUInt16LE(0, 12);
    h.writeUInt16LE(0x21, 14);
    h.writeUInt32LE(e.crc, 16);
    h.writeUInt32LE(e.csize, 20);
    h.writeUInt32LE(e.usize, 24);
    h.writeUInt16LE(e.nameBuf.length, 28);
    h.writeUInt32LE(e.offset, 42);
    write(h);
    write(e.nameBuf);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(offset - cdStart, 12);
  eocd.writeUInt32LE(cdStart, 16);
  write(eocd);
  fs.closeSync(fd);

  if (offset >= 0xffffffff || central.length >= 0xffff) throw new Error('Package too large for a plain ZIP (needs ZIP64).');
  console.log(`${path.relative(ROOT, OUT_FILE)}: ${parts.length} files, ${(offset / 1048576).toFixed(1)} MB`);
}

main();
