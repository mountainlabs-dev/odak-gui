const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icons/odak', // Point to the base filename without extension
  },
  rebuildConfig: {},
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
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: '/./assets/icons/odak.png'
        }
      }
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
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
