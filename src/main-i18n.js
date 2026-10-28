// Turkish for the text the main process shows: menus, file dialogs, and the progress and error
// messages it sends to the window. The window's own text is in locales/tr.js (see i18n.js).
// The window tells the main process its language (ipc 'set-language'); until then the system
// language decides.

const TR = {
  // Menus
  'File': 'Dosya',
  'Edit': 'Düzen',
  'View': 'Görünüm',
  'Window': 'Pencere',
  'Help': 'Yardım',
  'About Mountain Labs': 'Mountain Labs Hakkında',
  'Services': 'Servisler',
  'Hide Mountain Labs': 'Mountain Labs\'i Gizle',
  'Hide Others': 'Diğerlerini Gizle',
  'Show All': 'Tümünü Göster',
  'Quit Mountain Labs': 'Mountain Labs\'ten Çık',
  'Quit': 'Çık',
  'Close Window': 'Pencereyi Kapat',
  'Undo': 'Geri Al',
  'Redo': 'Yinele',
  'Cut': 'Kes',
  'Copy': 'Kopyala',
  'Paste': 'Yapıştır',
  'Select All': 'Tümünü Seç',
  'Reload': 'Yeniden Yükle',
  'Force Reload': 'Zorla Yeniden Yükle',
  'Toggle Developer Tools': 'Geliştirici Araçlarını Aç/Kapat',
  'Actual Size': 'Gerçek Boyut',
  'Zoom In': 'Yakınlaştır',
  'Zoom Out': 'Uzaklaştır',
  'Toggle Full Screen': 'Tam Ekranı Aç/Kapat',
  'Minimize': 'Küçült',
  'Zoom': 'Büyüt',
  'Bring All to Front': 'Tümünü Öne Getir',
  'Close': 'Kapat',
  'Mountain Labs Website': 'Mountain Labs Web Sitesi',

  // File dialogs
  'JSON Files': 'JSON dosyaları',
  'CSV Files': 'CSV dosyaları',
  'UF2 Files': 'UF2 dosyaları',
  'Text Files': 'Metin dosyaları',
  'HTML Files': 'HTML dosyaları',
  'Save Device History': 'Cihaz Geçmişini Kaydet',
  'Export Odak Backup': 'Odak Yedeğini Dışa Aktar',
  'Odak Backup': 'Odak yedeği',
  'Import Odak Backup or History': 'Odak Yedeği veya Geçmişi İçe Aktar',
  'Odak Backup or History': 'Odak yedeği veya geçmişi',
  'Export Console Output': 'Konsol Çıktısını Dışa Aktar',
  'Choose the RPI-RP2 drive': 'RPI-RP2 sürücüsünü seçin',
  'Odak is in update mode. Choose the RPI-RP2 drive to install the firmware.':
    'Odak güncelleme modunda. Yazılımı yüklemek için RPI-RP2 sürücüsünü seçin.',
  'Install Firmware': 'Yazılımı Yükle',

  // Errors and notices sent to the window
  'Failed to list serial ports': 'Seri portlar listelenemedi',
  'Serial port error': 'Seri port hatası',
  'Data logging error': 'Veri kaydı hatası',
  'Not connected to device': 'Cihaza bağlı değil',
  'No device connected. Hold BOOTSEL while plugging Odak in to start update mode.':
    'Bağlı cihaz yok. Güncelleme modunu başlatmak için Odak\'ı BOOTSEL düğmesini basılı tutarak takın.',
  'Flash successful': 'Yükleme başarılı',
  'Odak was reset but did not take the firmware. Drag the .uf2 file onto the RPI-RP2 drive yourself.':
    'Odak yeniden başlatıldı ama yazılımı almadı. .uf2 dosyasını RPI-RP2 sürücüsüne kendiniz sürükleyin.',
  'Firmware update cancelled. Odak stays in update mode until you unplug it.':
    'Yazılım güncellemesi iptal edildi. Odak, fişten çekilene kadar güncelleme modunda kalır.',
  'The downloaded firmware did not match its checksum, so it was not installed. Try again later.':
    'İndirilen yazılımın sağlama toplamı tutmadı, bu yüzden yüklenmedi. Daha sonra yeniden deneyin.',
  'The downloaded file is not a UF2 firmware image.': 'İndirilen dosya bir UF2 yazılım dosyası değil.',
  'macOS Full Disk Access is required.\n\nTo grant access:\n1. Open System Settings > Privacy & Security > Full Disk Access.\n2. Add and enable this app (or your Terminal if running from CLI).\n3. Restart the app and try again.':
    'macOS Tam Disk Erişimi gerekli.\n\nErişim vermek için:\n1. Sistem Ayarları > Gizlilik ve Güvenlik > Tam Disk Erişimi\'ni açın.\n2. Bu uygulamayı ekleyip etkinleştirin (komut satırından çalıştırıyorsanız Terminal\'i).\n3. Uygulamayı yeniden başlatıp tekrar deneyin.',
  'Copying the firmware file timed out. Please check the Odak connection and try again.':
    'Yazılım dosyasının kopyalanması zaman aşımına uğradı. Odak bağlantısını kontrol edip tekrar deneyin.',
};

// Messages with values in them: [English pattern, Turkish with $1, $2 ...]
const PATTERNS = [
  [/^Resetting Odak on (.+?)\.\.\.$/, 'Odak yeniden başlatılıyor ($1)...'],
  [/^Waiting for Odak to appear as (\S+)\.\.\.$/, 'Odak\'ın $1 olarak görünmesi bekleniyor...'],
  [/^Waiting for (\S+)\.\.\. if it does not open by itself, open the \S+ drive in your file manager\.$/,
    '$1 bekleniyor... kendiliğinden açılmazsa $1 sürücüsünü dosya yöneticinizde açın.'],
  [/^Choose the (\S+) drive so the app can copy the firmware onto it\.$/,
    'Uygulamanın yazılımı kopyalayabilmesi için $1 sürücüsünü seçin.'],
  [/^Copying flash file to Odak \((.+)\)\.\.\.$/, 'Yazılım dosyası Odak\'a kopyalanıyor ($1)...'],
  [/^Copying the firmware to (.+) failed: (.+)$/, 'Yazılım $1 konumuna kopyalanamadı: $2'],
  [/^(.+) is not the (\S+) drive\. Try again and choose \S+ in the sidebar\.$/,
    '$1, $2 sürücüsü değil. Tekrar deneyin ve kenar çubuğunda $2 sürücüsünü seçin.'],
  [/^The (\S+) drive did not appear\. Open it in your file manager and try again, or drag the \.uf2 file onto it yourself\.$/,
    '$1 sürücüsü görünmedi. Dosya yöneticinizde açıp tekrar deneyin veya .uf2 dosyasını kendiniz sürükleyin.'],
  [/^Firmware file not found at: (.+)$/, 'Yazılım dosyası bulunamadı: $1'],
  [/^No firmware is published for board (\S+)\.$/, '$1 kartı için yayımlanmış yazılım yok.'],
  [/^No answer from (\S+) within (\d+) s$/, '$1 adresinden $2 sn içinde yanıt gelmedi'],
  [/^Refusing to download over (\S+) \((.+)\)$/, '$1 üzerinden indirme yapılmıyor ($2)'],
  [/^timed out after (\d+) s$/, '$1 sn sonra zaman aşımı'],
];

function translate(lang, text) {
  if (lang !== 'tr' || typeof text !== 'string') return text;
  if (TR[text] !== undefined) return TR[text];
  for (const [pattern, turkish] of PATTERNS) {
    if (pattern.test(text)) return text.replace(pattern, turkish);
  }
  return text;
}

/** What a flasher progress line (English) means for the progress bar. */
function progressStage(line) {
  if (/^Resetting/.test(line)) return 'reset';
  if (/^(Waiting|Choose the|No device connected)/.test(line)) return 'wait';
  if (/^Copying flash file/.test(line)) return 'copy';
  if (/Flash successful/.test(line)) return 'done';
  if (/Error|failed/.test(line)) return 'error';
  return null;
}

/** Linux: the user is not allowed to open the serial port. */
function linuxSerialPermissionMessage(lang, port, inSnap) {
  if (lang === 'tr') {
    const snapStep = inSnap
      ? 'Odak\'ın USB cihazlarını kullanmasına izin verin:\n    sudo snap connect odak-gui:raw-usb\n\nArdından kullanıcınızı'
      : 'Kullanıcınızı';
    return `${port || 'Seri port'} için erişim izni yok.\n\n` +
      `${snapStep} "dialout" grubuna ekleyin, sonra oturumu kapatıp yeniden açın:\n` +
      '    sudo usermod -aG dialout $USER';
  }
  const snapStep = inSnap
    ? 'Allow Odak to use USB devices:\n    sudo snap connect odak-gui:raw-usb\n\nThen add'
    : 'Add';
  return `No permission to access ${port || 'the serial port'}.\n\n` +
    `${snapStep} your user to the "dialout" group, then log out and back in:\n` +
    '    sudo usermod -aG dialout $USER';
}

module.exports = { translate, progressStage, linuxSerialPermissionMessage };
