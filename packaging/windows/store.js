// Microsoft Store identity and package manifest, shared by forge.config.js (the .appx maker, on
// Windows) and scripts/make-msix.js (the .msix packer, on any OS).

const fs = require('fs');
const path = require('path');
const { version, description } = require('../../package.json');

// Copy these from Partner Center (Product management > Product identity).
// The defaults build a package you can sideload for testing; the Store rejects them.
const msStore = {
  identityName: process.env.MSSTORE_IDENTITY_NAME || 'MountainLabs.OdakAirQualityMonitor',
  publisher: process.env.MSSTORE_PUBLISHER || 'CN=Mountain Labs Teknoloji',
  publisherDisplayName: process.env.MSSTORE_PUBLISHER_DISPLAY_NAME || 'Mountain Labs',
  displayName: process.env.MSSTORE_DISPLAY_NAME || 'Odak Air Quality Monitor',
};

/** True when every identity value came from Partner Center (environment), not the defaults. */
const hasStoreIdentity = () => ['MSSTORE_IDENTITY_NAME', 'MSSTORE_PUBLISHER', 'MSSTORE_PUBLISHER_DISPLAY_NAME', 'MSSTORE_DISPLAY_NAME']
  .every((name) => process.env[name]);

/** AppxManifest.xml for this version, from packaging/windows/AppxManifest.xml. */
function manifestXml() {
  const xmlEscape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const values = { ...msStore, version: `${version}.0`, description };
  return fs.readFileSync(path.join(__dirname, 'AppxManifest.xml'), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => xmlEscape(values[key]));
}

module.exports = { msStore, hasStoreIdentity, manifestXml };
