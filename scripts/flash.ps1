<# powershell script for resetting and flashing rp2040/pico autonomously #>
param(
    [string]$ComPort,
    [string]$FirmwarePath
)

$ErrorActionPreference = "Stop"

function Get-BootloaderDrive {
    $drives = Get-WmiObject Win32_LogicalDisk
    foreach ($drive in $drives) {
        if ($drive.VolumeName -match "RPI" -or $drive.VolumeName -match "BOOTLOADER") {
            return $drive.DeviceID
        }
    }
    return $null
}

<# reset pico over baud rate change to 1200 baud #>
if ($ComPort) {
    Write-Host "Resetting Pico on $ComPort"
    mode $ComPort baud=12 parity=n data=8 stop=1
} else {
    Write-Host "No COM port specified. Please manually put the device in bootloader mode."
}

# Reset device if COM port is provided
if ($ComPort) {
    Write-Host "Resetting device on $ComPort..."
    try {
        mode $ComPort baud=12 parity=n data=8 stop=1
    } catch {
        Write-Host "Failed to reset device on $ComPort : $_"
    }
} else {
    Write-Host "No COM port provided. Please manually put the device in bootloader mode."
    Start-Sleep -Seconds 2
}

Write-Host "Waiting for Pico to mount in bootloader mode..."
$i = 0
$drive = Get-BootloaderDrive
while ($null -eq $drive) {
    Write-Host "." -NoNewline
    Start-Sleep -Milliseconds 500
    $i++

    if ($i -ge 60) {
        Write-Host "`nNo Pico device found in bootloader mode after 30 seconds."
        Write-Host "Please check:"
        Write-Host "1. The device is properly connected"
        Write-Host "2. No other application is using the device"
        Exit 1
    }
    $drive = Get-BootloaderDrive
}

Write-Host "`nPico detected at drive $drive"

# Check firmware file path (remove any extra quotes)
$FirmwarePath = $FirmwarePath.Trim('"')
if (-not (Test-Path -Path $FirmwarePath)) {
    Write-Host "Firmware file not found at: $FirmwarePath"
    Exit 1
}

Write-Host "Copying firmware to drive: $drive"

# Copy firmware file to the device
try {
    Copy-Item -Path $FirmwarePath -Destination $drive -Force
    Write-Host "Firmware file copied successfully"
} catch {
    Write-Host "Failed to copy firmware: $_"
    Exit 1
}

# Wait for device to process firmware
Write-Host "Waiting for device to process firmware..."
Start-Sleep -Seconds 3

# Check if flash was successful (device should no longer be in bootloader mode)
$bootloaderDrive = Get-BootloaderDrive
if ($null -ne $bootloaderDrive) {
    Write-Host "Warning: Device is still in bootloader mode. Flashing may have failed."
    Exit 1
} else {
    Write-Host "Success: Device has rebooted with new firmware!"
    Exit 0
}
