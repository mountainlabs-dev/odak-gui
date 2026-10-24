const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

const path = require('path');
const fs = require('fs');
const { version, description } = require('./package.json');

// Microsoft Store identity: copy these from Partner Center (Product management > Product identity).
// The defaults build a package you can sideload for testing; the Store rejects them.
const msStore = {
  identityName: process.env.MSSTORE_IDENTITY_NAME || 'MountainLabs.OdakAirQualityMonitor',
  publisher: process.env.MSSTORE_PUBLISHER || 'CN=Mountain Labs Teknoloji',
  publisherDisplayName: process.env.MSSTORE_PUBLISHER_DISPLAY_NAME || 'Mountain Labs',
  displayName: process.env.MSSTORE_DISPLAY_NAME || 'Odak Air Quality Monitor',
};

/** Fill in packaging/windows/AppxManifest.xml for this build and return its path. */
function storeManifest() {
  const xmlEscape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const values = { ...msStore, version: `${version}.0`, description };
  const xml = fs.readFileSync(path.join(__dirname, 'packaging/windows/AppxManifest.xml'), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => xmlEscape(values[key]));
  const out = path.join(__dirname, 'out', 'AppxManifest.xml');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, xml);
  return out;
}

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icons/odak', // Point to the base filename without extension
    executableName: 'odak-gui', // Avoid spaces in the Linux binary name
    // Keep files the desktop app doesn't use out of the package
    ignore: [
      /^\/web(\/|$)/,
      /^\/packaging(\/|$)/,
      /^\/snap(\/|$)/,
      /^\/docs(\/|$)/,
      /^\/firmware(\/|$)/,
      /^\/scripts\/publish-firmware\.sh$/,
      /^\/LICENSE$/,
      /^\/\.github(\/|$)/,
      /^\/out(\/|$)/,
      /^\/[^/]+\.(zip|md)$/,
      /^\/forge\.config\.js$/,
      /^\/\.gitignore$/,
    ],
  },
  // serialport ships N-API binaries for every platform (prebuilds/), which work in Electron as they
  // are; rebuilding from source needs a C++ toolchain and broke on newer Visual Studio versions.
  rebuildConfig: {
    ignoreModules: ['@serialport/bindings-cpp'],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Odak',
        authors: 'Odak Team',
        description: 'Odak GUI for Odak devices',
        setupIcon: './assets/icons/odak.ico',
        noMsi: true,
        setupExe: 'Odak-GUI-Setup.exe',
        setupIcon: './assets/icons/odak.ico',
      },
    },
    {
      // Path to a single image that will act as icon for the application
      // Debian-based distros (Pardus, Debian, Ubuntu)
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'odak-gui',
          bin: 'odak-gui',
          productName: 'ODAK Air Quality Monitor',
          genericName: 'Air Quality Monitor',
          icon: './assets/icons/odak.png',
          categories: ['Utility', 'Science'],
          // udisks2 mounts the RPI-RP2 drive during firmware updates
          depends: ['udisks2'],
          // Installs a udev rule so the device works without 'dialout' and ModemManager leaves it alone
          scripts: {
            postinst: './packaging/linux/postinst',
            postrm: './packaging/linux/postrm',
          },
        }
      }
    },
    {
      // Microsoft Store package (built on Windows only; see .github/workflows/release.yml)
      name: '@electron-forge/maker-appx',
      platforms: ['win32'],
      config: process.platform === 'win32' ? {
        packageName: 'OdakGui',
        identityName: msStore.identityName,
        publisher: msStore.publisher,
        publisherDisplayName: msStore.publisherDisplayName,
        packageDisplayName: msStore.displayName,
        packageDescription: description,
        packageExecutable: 'app\\odak-gui.exe',
        packageVersion: `${version}.0`,
        assets: path.join(__dirname, 'packaging/windows/assets'),
        manifest: storeManifest(),
        // A test certificate is made for local sideloading; the Store re-signs the package
        devCert: process.env.MSSTORE_DEV_CERT || undefined,
        certPass: process.env.MSSTORE_DEV_CERT_PASSWORD || undefined,
      } : {},
    },
    {
      // Path to the icon to use for the app in the DMG window
      name: '@electron-forge/maker-dmg',
      config: {
        icon: './assets/icons/odak.icns'
      }
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      // Unsigned Mac builds: re-sign ad hoc after flipping fuses, or Apple Silicon reports the app as damaged
      resetAdHocDarwinSignature: process.platform === 'darwin',
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
