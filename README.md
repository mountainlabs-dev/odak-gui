# ODAK Air Quality Monitor GUI

![Version](https://img.shields.io/badge/version-0.2.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A desktop application built with Electron for interfacing with ODAK Air Quality Monitoring devices.

## Features

- **Real-time Monitoring**: Live display of air quality parameters including temperature, humidity, CO₂, VOC, PM1.0, PM2.5, PM10, pressure, elevation, and battery levels
- **Visualized Data**: Line charts for all sensor readings with time-based tracking
- **CLI Interface**: Built-in command-line interface to communicate directly with the device
- **Device Configuration**: Easy adjustment of device settings like language, measurement frequency, and display units
- **Sensor Calibration**: Tools for calibrating all sensors with offset and multiplier values
- **Data Logging**: Export sensor data to log files for record keeping and analysis
- **Firmware Updates**: Simple interface for updating device firmware

## Installation

### Prerequisites
- Node.js (v22.13 or higher)
- npm (v11.2 or higher)

### Setup

1. Clone the repository
```bash
git clone https://github.com/Mountain-Labs/ODAK_GUI.git
cd ODAK_GUI/odak-gui
```

2. Install dependencies
```bash
npm install
```

3. Start the application
```bash
npm start
```

### Building Distributables

To build the application for distribution:

```bash
npm run make
```

This will create platform-specific distribution packages in the `out` directory.

## Usage

### Connecting to a Device

1. Connect your ODAK device to your computer via USB
2. In the application, select the appropriate port from the dropdown menu
3. Click the "Connect" button
4. Once connected, the dashboard will display real-time sensor readings

### CLI Interface

The application includes a built-in CLI that allows you to:

- View and modify device settings
- Calibrate sensors
- Reset the device
- Control logging levels

Common commands:

- `$HELP` - Display available commands
- `$GET_SETTINGS` - Show current device settings
- `$CAL_PRINT` - View all calibration values
- `$SYS_RST` - Reset the device
- `$EXIT` - Exit calibration mode

For detailed CLI documentation, refer to the [ODAK_CLI.md](./ODAK_CLI.md) file.

### Data Logging

1. Toggle the logging switch in the "Data Logging" panel
2. Select a location to save the log file
3. The application will automatically save sensor readings to the selected file

### Firmware Updates

1. Navigate to the "Firmware Update" tab
2. Select a firmware file (.uf2)
3. Click "Update Firmware" to begin the update process

## Configuration Options

### Device Settings

- **Language**: Turkish or English
- **Measurement Frequency**: 3, 5, or 10 minutes
- **Measurement Type**: Celsius/Meter or Fahrenheit/Feet
- **Buzzer**: Enable or disable sound alerts
- **Installation**: Request or cancel installation status
- **Startup Mode**: Configure automatic startup mode

### Sensor Calibration

Each sensor can be calibrated with:

- **Offset**: Adds or subtracts a fixed value
- **Multiplier**: Scales the measured value

## Sensor Parameters

The application monitors and displays the following parameters:

| Parameter | Unit | Description |
|-----------|------|-------------|
| Temperature | °C or °F | Ambient temperature |
| Humidity | % | Relative humidity |
| CO₂ | ppm | Carbon dioxide concentration |
| VOC | mg/m³ | Volatile organic compounds |
| PM1.0 | µg/m³ | Particulate matter (1.0 micron) |
| PM2.5 | µg/m³ | Particulate matter (2.5 microns) |
| PM10 | µg/m³ | Particulate matter (10 microns) |
| AQI | - | Air Quality Index |
| Pressure | hPa | Atmospheric pressure |
| Elevation | m or ft | Altitude above sea level |
| Battery | % | Device battery level |

## Development

### Project Structure

```
odak-gui/
│
├── src/
│   ├── index.html      # Main application layout
│   ├── index.js        # Main process entry point
│   ├── preload.js      # Bridge between renderer and main
│   ├── renderer.js     # Renderer process logic
│   ├── styles.css      # Application styling
│   │
│   └── modules/        # Feature modules
│       ├── chart-management.js   # Chart visualization
│       ├── cli-interface.js      # CLI functionality
│       ├── data-logging.js       # Data logging features
│       ├── dom-elements.js       # DOM element references
│       ├── error-handling.js     # Error management
│       ├── firmware-update.js    # Firmware update logic
│       └── port-management.js    # Serial port handling
│
├── forge.config.js     # Electron Forge configuration
├── package.json        # Project metadata and dependencies
└── README.md           # Project documentation
```

### Technologies Used

- **Electron**: Cross-platform desktop app framework
- **Chart.js**: Data visualization library
- **Bootstrap**: UI framework for responsive design
- **Serialport**: Serial communication library

## Troubleshooting

### Common Issues

- **Device Not Detected**: Ensure the device is properly connected
- **Connection Failed**: Try a different USB port or cable
- **Data Not Updating**: Restart the device and reconnect
- **Firmware Update Failed**: Ensure you're using the correct firmware file and the device is properly connected
