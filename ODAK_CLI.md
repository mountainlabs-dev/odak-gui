# ODAK Air Quality Monitor: CLI Usage and Configuration Steps

# Point Reset Procedure

Follow the steps below to reset the points on your ODAK device:

1.      **Power Off the Device:**  
Disconnect both the battery and the USB cable to completely power down the device.

2.      **Press and Hold Both Buttons:**  
While the device is powered off, press and hold both buttons on the device.

3.      **Reconnect Power:**  
While still holding the buttons, reconnect the battery to power the device back on.

4.      **Wait for Reset:**  
Continue holding the buttons for approximately **3 seconds**. The points will reset during this time.

5.      **Release the Buttons:**  
Once the reset is complete, release both buttons.

6.      **Configure if Needed:**  
Perform any additional configuration as needed.

# CLI Usage Guide

The ODAK Air Quality Monitor features a command line interface that allows you to adjust settings, calibrate sensors, and retrieve system information. This document provides instructions on how to use the CLI.

## Getting Started

1.      Connect your ODAK device to a computer via USB cable

2.      Open a terminal or serial monitor program (YAT Terminal recommended) with these settings:

o    Baud rate: 115200

o    Data bits: 8

o    Stop bit: 1

o    Parity: None

o    Flow control: Software (XON/XOFF)

## Command Format

All commands must begin with a dollar sign ($) and end with a newline character.

·         Basic command format: `$COMMAND`

·         Command with value: `$COMMAND,VALUE`

## Available Commands

| Command | Description | Example |
| --- | --- | --- |
| HELP | Show all available commands | $HELP |
| GET_SETTINGS | Show current device settings | $GET_SETTINGS |
| SYS_RST | Reset the device | $SYS_RST |
| EXIT | Exit calibration mode and return to normal operation | $EXIT |
| CAL_PRINT | Display all calibration values | $CAL_PRINT |
| CAL_RESET | Reset all calibration values to defaults | $CAL_RESET |

## Settings Commands

| Command | Description | Example |
| --- | --- | --- |
| SET_LANG | Set language (0=TR, 1=EN) | $SET_LANG,1 |
| SET_FREQ | Set measurement frequency (0=3 min, 1=5 min, 2=10 min) | $SET_FREQ,1 |
| SET_TYPE | Set measurement type (0=Celsius/Meter, 1=Fahrenheit/Feet) | $SET_TYPE,0 |
| SET_BUZZER | Set buzzer (0=ON, 1=OFF) | $SET_BUZZER,0 |
| SET_INSTALL | Set installation status (0=REQUESTED, 1=NOT REQUESTED) | $SET_INSTALL,0 |
| SET_STARTUP | Set startup mode (0=OFF, 1=ON) | $SET_STARTUP,1 |
| $POINT_RESET |  |  |

## Logging Commands

| Command | Description | Example |
| --- | --- | --- |
| LOG_TRACE | Set log level to TRACE | $LOG_TRACE |
| LOG_DEBUG | Set log level to DEBUG | $LOG_DEBUG |
| LOG_INFO | Set log level to INFO | $LOG_INFO |
| LOG_WARN | Set log level to WARN | $LOG_WARN |
| LOG_ERROR | Set log level to ERROR | $LOG_ERROR |
| LOG_FATAL | Set log level to FATAL | $LOG_FATAL |
| LOG_OFF | Turn logging off | $LOG_OFF |
| LOG_ON | Turn logging on | $LOG_ON |

## Calibration Commands

Each sensor can be calibrated with an offset and multiplier value:

| Command | Description | Example |
| --- | --- | --- |
| CAL_CO2_OFFSET | Set CO2 offset | $CAL_CO2_OFFSET,50.0 |
| CAL_CO2_MULT | Set CO2 multiplier | $CAL_CO2_MULT,1.1 |
| CAL_PM1_OFFSET | Set PM1.0 offset | $CAL_PM1_OFFSET,5.0 |
| CAL_PM1_MULT | Set PM1.0 multiplier | $CAL_PM1_MULT,1.0 |
| CAL_PM25_OFFSET | Set PM2.5 offset | $CAL_PM25_OFFSET,5.0 |
| CAL_PM25_MULT | Set PM2.5 multiplier | $CAL_PM25_MULT,1.0 |
| CAL_PM10_OFFSET | Set PM10 offset | $CAL_PM10_OFFSET,5.0 |
| CAL_PM10_MULT | Set PM10 multiplier | $CAL_PM10_MULT,1.0 |
| CAL_VOC_OFFSET | Set VOC offset | $CAL_VOC_OFFSET,0.2 |
| CAL_VOC_MULT | Set VOC multiplier | $CAL_VOC_MULT,1.0 |
| CAL_TEMP_OFFSET | Set temperature offset | $CAL_TEMP_OFFSET,-1.5 |
| CAL_TEMP_MULT | Set temperature multiplier | $CAL_TEMP_MULT,1.0 |
| CAL_HUM_OFFSET | Set humidity offset | $CAL_HUM_OFFSET,2.0 |
| CAL_HUM_MULT | Set humidity multiplier | $CAL_HUM_MULT,1.0 |
| CAL_EVAL_OFFSET | Set evaluation offset | $CAL_EVAL_OFFSET,0.0 |
| CAL_EVAL_MULT | Set evaluation multiplier | $CAL_EVAL_MULT,1.0 |
| CAL_BATT_OFFSET | Set battery voltage offset | $CAL_BATT_OFFSET,0.1 |
| CAL_BATT_MULT | Set battery voltage multiplier | $CAL_BATT_MULT,1.0 |

## Example Session

$HELP

Commands:

CAL\_CO2\_OFFSET: Set CO2 Offset

CAL\_CO2\_MULT: Set CO2 Multiplier

... (more commands listed)

$GET\_SETTINGS

Language: TR

Meas Freq: 5 mins

Meas Type: Celcius - Meter

Buzzer: ON

Installation: REQUESTED

$CAL\_TEMP\_OFFSET,-1.2

Temperature Offset: -1.200

$CAL\_PRINT

CO2 Offset: 0.000

CO2 Multiplier: 1.000

... (all calibration values listed)

$EXIT

Sensor Read Started...