#!/bin/bash
# Bash script for resetting and flashing RP2040/Pico autonomously on macOS
# Argument 1 is the serial port which Pico is connected to
# Argument 2 is the firmware file path

# Check if firmware file path is provided
if [ -z "$2" ]; then
    echo "Firmware file path not provided. Aborting process."
    exit 1
fi

FIRMWARE_PATH="$2"

# Wait for the serial device to mount
echo "Waiting for Pico to mount..."
count=0
while [ ! -e $1 ]; do 
    sleep 0.5
    count=$((count+1))
    echo "."
    # Exit script if no serial device could be found
    if [ $count -ge 30 ]; then 
        echo "No device found on serial port $1 - Aborting process."
        exit 1
    fi
done

# Delete old Pico mass storage relics from the file system
echo "Deleting mass storage relics (if existing) in /Volumes/"
find /Volumes/ -type d -name 'RPI-RP*' -prune -exec rm -rf {} \;

# Reset Pico by setting the baud rate to 1200 (for macOS, use `stty -f`)
echo "Resetting Pico..."
stty -f $1 1200

# Wait until Pico has mounted as a mass storage device
count=0
while [ ! -d /Volumes/RPI-RP2 ]; do 
    sleep 0.5
    echo "."
    count=$((count+1))
    # Exit script if Pico did not mount as a mass storage device
    if [ $count -ge 30 ]; then 
        echo "Pico did not reboot - try again!"
        exit 1
    fi
done

# Give Pico some time to mount fully
sleep 5

# Copy flash file to Pico
echo "Copying flash file to Pico..."
cp -prv "$FIRMWARE_PATH" /Volumes/RPI-RP2

# Check if flash has been successful
count=0
while [ -d /Volumes/RPI-RP2 ]; do 
    sleep 1
    echo "."
    count=$((count+1))
    # Exit script if flash was not successful (Pico is still mounted as mass storage device)
    if [ $count -ge 10 ]; then 
        echo "Pico was reset but could not be flashed - please drag and drop .uf2-file manually!"
        exit 1
    fi
done

echo "Flash successful - black magic happened ~(o.O~)"
