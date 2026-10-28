const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { version, description, productName } = require('./package.json');

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

// Mac App Store build: `npm run make:mas` (electron-forge ... --platform=mas). See docs/PUBLISHING.md.
const platformArg = process.argv.findIndex((a) => a === '--platform' || a.startsWith('--platform='));
const isMas = platformArg >= 0 &&
  (process.argv[platformArg].split('=')[1] || process.argv[platformArg + 1]) === 'mas';

// Copy these from App Store Connect / developer.apple.com
const macStore = {
  bundleId: process.env.MAS_BUNDLE_ID || 'io.mountainlabs.app',
  teamId: process.env.MAS_TEAM_ID,
  // Mac App Store distribution profile for the bundle id (Certificates, IDs & Profiles > Profiles)
  provisioningProfile: process.env.MAS_PROVISIONING_PROFILE || path.join(__dirname, 'packaging/macos/embedded.provisionprofile'),
  // Matched by name in the keychain. osx-sign only looks for the older "3rd Party Mac Developer
  // Application" name by itself, so name the current "Apple Distribution" certificate; the
  // installer certificate still carries the old name and is found by default.
  appIdentity: process.env.MAS_APP_IDENTITY || 'Apple Distribution: Mountain Labs LLC',
  installerIdentity: process.env.MAS_INSTALLER_IDENTITY || undefined,
  // Must go up with every upload to App Store Connect
  buildVersion: process.env.MAS_BUILD_NUMBER || version,
};

if (isMas) {
  if (!fs.existsSync(macStore.provisioningProfile)) {
    throw new Error(`Mac App Store provisioning profile not found at ${macStore.provisioningProfile} (set MAS_PROVISIONING_PROFILE).`);
  }
}

const masPackagerConfig = isMas ? {
  appCategoryType: 'public.app-category.utilities',
  buildVersion: macStore.buildVersion,
  extendInfo: {
    // Without it, osx-sign reads the team from the provisioning profile
    ...(macStore.teamId && { ElectronTeamID: macStore.teamId }),
    // Only HTTPS (exempt), so App Store Connect doesn't ask about export compliance on each build
    ITSAppUsesNonExemptEncryption: false,
  },
  osxSign: {
    identity: macStore.appIdentity,
    provisioningProfile: macStore.provisioningProfile,
    // Fail the build instead of quietly producing an unsigned app the App Store rejects
    continueOnError: false,
    // The app gets the sandbox entitlements; helpers, frameworks and native modules inherit them
    optionsForFile: (filePath) => ({
      entitlements: filePath.endsWith(`${productName}.app`)
        ? path.join(__dirname, 'packaging/macos/entitlements.mas.plist')
        : path.join(__dirname, 'packaging/macos/entitlements.mas.child.plist'),
    }),
  },
} : {};

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icons/odak', // Point to the base filename without extension
    executableName: 'odak-gui', // Avoid spaces in the Linux binary name
    appBundleId: macStore.bundleId,
    ...masPackagerConfig,
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
  hooks: {
    // Electron's Mac App Store download comes signed per architecture, so its _CodeSignature files
    // differ between the x64 and arm64 halves and the universal merge refuses them. osxSign signs
    // everything again with our certificate, so drop the old signatures right after extracting.
    packageAfterExtract: async (_config, buildPath, _electronVersion, platform) => {
      if (platform !== 'mas') return;
      const strip = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
          const full = path.join(dir, entry.name);
          if (entry.name === '_CodeSignature') fs.rmSync(full, { recursive: true });
          else strip(full);
        }
      };
      strip(buildPath);
    },
    // serialport ships prebuilt binaries for every OS; a Mac app needs only darwin-x64+arm64, and the
    // App Store validates every binary in the bundle
    packageAfterPrune: async (_config, buildPath, _electronVersion, platform) => {
      if (platform !== 'darwin' && platform !== 'mas') return;
      const prebuilds = path.join(buildPath, 'node_modules/@serialport/bindings-cpp/prebuilds');
      if (!fs.existsSync(prebuilds)) return;
      for (const dir of fs.readdirSync(prebuilds)) {
        if (!dir.startsWith('darwin-')) fs.rmSync(path.join(prebuilds, dir), { recursive: true });
      }
    },
    // Packaging edits Info.plist and resources after Electron's own ad-hoc signature, and the fuses
    // plugin re-signs only the main binary, so the bundle seal is broken and macOS says the
    // downloaded app "is damaged". Without an Apple Developer ID, re-sign the whole bundle ad hoc.
    // (The Mac App Store build is signed properly by osxSign above.)
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform !== 'darwin') return;
      for (const dir of outputPaths) {
        for (const app of fs.readdirSync(dir).filter((f) => f.endsWith('.app'))) {
          const appPath = path.join(dir, app);
          execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
          execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
        }
      }
    },
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
          productName: 'Mountain Labs',
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
    },
    {
      // Mac App Store installer package, uploaded with Transporter (see docs/PUBLISHING.md)
      name: '@electron-forge/maker-pkg',
      platforms: ['mas'],
      config: {
        identity: macStore.installerIdentity,
      },
    },
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
      // No resetAdHocDarwinSignature: the plugin re-signs unsigned arm64 builds itself and skips
      // osxSign (App Store) builds, where forcing it broke the universal merge; the DMG builds are
      // re-signed in full by the postPackage hook above.
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
