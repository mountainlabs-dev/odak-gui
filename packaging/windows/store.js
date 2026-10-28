// Microsoft Store identity and package manifest, shared by forge.config.js (the .appx maker, on
// Windows) and scripts/make-msix.js (the .msix packer, on any OS).

const fs = require('fs');
const path = require('path');
const { version, description } = require('../../package.json');

// From Partner Center (Product management > Product identity). The MSSTORE_* environment
// variables override them, e.g. to build for another Store listing.
const msStore = {
  identityName: process.env.MSSTORE_IDENTITY_NAME || 'MountainLabs.MountainLabs',
  publisher: process.env.MSSTORE_PUBLISHER || 'CN=0FAAF412-56E3-45CB-B0D7-4AB33CBF5B5E',
  publisherDisplayName: process.env.MSSTORE_PUBLISHER_DISPLAY_NAME || 'Mountain Labs',
  displayName: process.env.MSSTORE_DISPLAY_NAME || 'Mountain Labs',
};

/** AppxManifest.xml for this version, from packaging/windows/AppxManifest.xml. */
function manifestXml() {
  const xmlEscape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const values = { ...msStore, version: `${version}.0`, description };
  return fs.readFileSync(path.join(__dirname, 'AppxManifest.xml'), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => xmlEscape(values[key]));
}

module.exports = { msStore, manifestXml };
