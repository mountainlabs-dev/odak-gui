// Web Serial link to an ODAK device (Raspberry Pi RP2040, USB CDC serial).
//
// Replaces the Electron main process's `serialport` code. Lines from the
// device are delivered one at a time to `onLine`; connection changes go to
// `onStatus`. The device re-enumerates after SYS_RST, a firmware update or a
// replug; if that happens while we were connected, we reopen it as soon as
// Chrome reports it back (permission is remembered per device).

export const RPI_USB_VENDOR_ID = 0x2e8a;

// Opening the port at 1200 baud makes the Pico SDK reboot into the USB
// bootloader (RPI-RP2 drive). Never use this rate for normal communication.
const BOOTLOADER_BAUD = 1200;
const BAUD = 115200;

export class SerialLink {
  constructor({ onLine, onStatus, onError }) {
    this.onLine = onLine;
    this.onStatus = onStatus;
    this.onError = onError;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readDone = null;
    this.closing = false;
    this.reconnectWanted = false;  // true after an unexpected loss of the device
    this.waiters = new Set();

    if (SerialLink.supported) {
      navigator.serial.addEventListener('connect', (e) => this.handleDeviceArrived(e.target));
    }
  }

  static get supported() {
    return 'serial' in navigator;
  }

  get connected() {
    return this.port !== null;
  }

  /** Ask the user to pick a device (needs a click), then open it. */
  async requestAndOpen() {
    const port = await navigator.serial.requestPort({ filters: [{ usbVendorId: RPI_USB_VENDOR_ID }] });
    await this.open(port);
  }

  /** Reopen a device the user already granted, if exactly one is plugged in. */
  async openKnownDevice() {
    const ports = await navigator.serial.getPorts();
    if (ports.length === 1) {
      await this.open(ports[0]);
      return true;
    }
    return false;
  }

  async open(port) {
    if (this.port) await this.close();
    await port.open({ baudRate: BAUD });
    this.port = port;
    this.closing = false;
    this.reconnectWanted = false;
    this.writer = port.writable.getWriter();
    this.readDone = this.readLoop();
    this.onStatus({ connected: true, info: port.getInfo() });
  }

  async readLoop() {
    const decoder = new TextDecoderStream();
    const pipeDone = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += value;
        let m;
        while ((m = /\r?\n/.exec(buffer)) !== null) {
          const line = buffer.slice(0, m.index);
          buffer = buffer.slice(m.index + m[0].length);
          if (line.length > 0) this.deliver(line);
        }
      }
    } catch {
      // Device unplugged or rebooted: the stream errors out.
    } finally {
      this.reader.releaseLock();
      this.reader = null;
    }
    await pipeDone;
    if (!this.closing) {
      // Lost without the user asking: tidy up and reconnect when it comes back.
      await this.teardown();
      this.reconnectWanted = true;
      this.onStatus({ connected: false, lost: true });
    }
  }

  deliver(line) {
    for (const w of [...this.waiters]) {
      if (w.match(line)) {
        this.waiters.delete(w);
        clearTimeout(w.timer);
        w.resolve(line);
      }
    }
    this.onLine(line);
  }

  /** Resolve with the first line matching `match`, or null after `timeoutMs`. */
  waitForLine(match, timeoutMs) {
    return new Promise((resolve) => {
      const w = { match, resolve };
      w.timer = setTimeout(() => {
        this.waiters.delete(w);
        resolve(null);
      }, timeoutMs);
      this.waiters.add(w);
    });
  }

  /** Send one command line. A leading '$' is added if missing. */
  async send(command) {
    if (!this.writer) throw new Error('Not connected to device');
    const line = command.startsWith('$') ? command : `$${command}`;
    await this.writer.write(new TextEncoder().encode(`${line}\n`));
  }

  /** Send a command and wait for a matching reply line. */
  async request(command, match, timeoutMs) {
    const reply = this.waitForLine(match, timeoutMs);
    await this.send(command);
    return reply;
  }

  async close() {
    if (!this.port) return;
    this.closing = true;
    this.reconnectWanted = false;
    try {
      await this.reader?.cancel();
    } catch { /* already gone */ }
    await this.readDone;
    await this.teardown();
    this.onStatus({ connected: false, lost: false });
  }

  async teardown() {
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.resolve(null);
    }
    this.waiters.clear();
    try {
      this.writer?.releaseLock();
    } catch { /* ignore */ }
    this.writer = null;
    const port = this.port;
    this.port = null;
    try {
      await port?.close();
    } catch { /* port vanished */ }
  }

  /** Reboot the connected device into its USB bootloader (RPI-RP2 drive). */
  async rebootToBootloader() {
    const port = this.port;
    if (!port) throw new Error('Not connected to device');
    await this.close();
    await port.open({ baudRate: BOOTLOADER_BAUD });
    try {
      await port.close();
    } catch { /* device already rebooting */ }
    // Reopen automatically once the new firmware is running.
    this.reconnectWanted = true;
  }

  async handleDeviceArrived(port) {
    if (!this.reconnectWanted || this.port) return;
    const info = port.getInfo();
    if (info.usbVendorId !== RPI_USB_VENDOR_ID) return;
    // Give the device a moment to finish enumerating before opening it.
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await this.open(port);
    } catch (err) {
      this.onError?.({ message: 'Reconnect failed', details: err.message });
    }
  }
}
