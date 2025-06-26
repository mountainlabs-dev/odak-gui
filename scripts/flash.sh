#!/bin/bash
# Bash script for resetting and flashing Odak autonomously on macOS
# Argument 1 is the serial port which Odak is connected to
# Argument 2 is the firmware file path

# Check if firmware file path is provided
if [ -z "$2" ]; then
    echo "Firmware file path not provided. Aborting process."
    exit 1
fi

FIRMWARE_PATH="$2"

# Wait for the serial device to mount
echo "Waiting for Odak to mount..."
count=0
# while [ ! -e $1 ]; do 
#     sleep 0.5
#     count=$((count+1))
#     echo "."
#     # Exit script if no serial device could be found
#     if [ $count -ge 30 ]; then 
#         echo "No device found on serial port $1 - Aborting process."
#         exit 1
#     fi
# done

# Delete old Odak mass storage relics from the file system, but do NOT delete if currently mounted
echo "Deleting Odak mass storage relics (if existing) in /Volumes/ (excluding currently mounted RPI-RP2)"
for relic in /Volumes/RPI-RP*; do
    if [ -d "$relic" ] && [ "$relic" != "/Volumes/RPI-RP2" ]; then
        echo "Deleting relic: $relic"
        rm -rf "$relic"
    fi
done

# Reset Odak by setting the baud rate to 1200 (for macOS, use `stty -f`)
echo "Resetting Odak..."
stty -f $1 1200

# Wait until Odak has mounted as a mass storage device
count=0
while [ ! -d /Volumes/RPI-RP2 ]; do 
    sleep 0.5
    echo "."
    count=$((count+1))
    # Exit script if Odak did not mount as a mass storage device
    if [ $count -ge 30 ]; then 
        echo "Odak did not reboot - try again!"
        exit 1
    fi
done

# Give Odak some time to mount fully
sleep 5

# Copy flash file to Odak with timeout
CP_LOG="/tmp/cp_error_$$.log"
COPY_TIMEOUT=20  # seconds

copy_with_timeout() {
    command="$1"
    timeout="$2"
    eval "( $command ) &"
    pid=$!
    SECONDS=0
    while kill -0 $pid 2>/dev/null; do
        if [ $SECONDS -ge $timeout ]; then
            echo "Copy operation timed out after $timeout seconds. Killing process..."
            kill -9 $pid 2>/dev/null
            wait $pid 2>/dev/null
            return 124
        fi
        sleep 1
    done
    wait $pid
    return $?
}

echo "Copying flash file to Odak..."
if ! copy_with_timeout "cp -prv \"$FIRMWARE_PATH\" /Volumes/RPI-RP2 2>$CP_LOG" $COPY_TIMEOUT; then
    if grep -q "Operation not permitted" $CP_LOG; then
        echo "\n================ PERMISSION ERROR ================"
        echo "macOS Full Disk Access is required to update firmware."
        echo "To grant access:"
        echo "1. Open System Settings > Privacy & Security > Full Disk Access."
        echo "2. Add and enable this app (or your Terminal if running from CLI)."
        echo "3. Restart the app and try again."
        echo "==================================================\n"
        cat $CP_LOG
        rm -f $CP_LOG
        exit 11  # Use a unique exit code for permission error
    fi
    if grep -q "Copy operation timed out" $CP_LOG; then
        echo "\n================ COPY TIMEOUT ================"
        echo "Copying the firmware file timed out after $COPY_TIMEOUT seconds."
        echo "Please check the Odak connection and try again."
        echo "==============================================\n"
        cat $CP_LOG
        rm -f $CP_LOG
        exit 12
    fi
    echo "Error: Could not copy firmware to /Volumes/RPI-RP2. Aborting."
    cat $CP_LOG
    rm -f $CP_LOG
    exit 1
else
    rm -f $CP_LOG
fi

# Check if flash has been successful
count=0
while [ -d /Volumes/RPI-RP2 ]; do 
    sleep 1
    echo "."
    count=$((count+1))
    # Exit script if flash was not successful (Odak is still mounted as mass storage device)
    if [ $count -ge 10 ]; then 
        echo "Odak was reset but could not be flashed - please drag and drop .uf2-file manually!"
        exit 1
    fi
done

echo "Flash successful - black magic happened ~(o.O~)"
