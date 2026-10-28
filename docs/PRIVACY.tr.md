# Mountain Labs: Gizlilik Politikası

*English: [PRIVACY.md](PRIVACY.md)*

Son güncelleme: 28 Ekim 2026

Bu politika, Mountain Labs Teknoloji AŞ'nin ("Mountain Labs") Odak hava kalitesi monitörü için
geliştirdiği Mountain Labs masaüstü uygulamasını (önceki adıyla *Odak Air Quality Monitor*) kapsar:
macOS (Mac App Store ve .dmg), Windows (Microsoft Store ve indirme) ve Linux (Snap Store ve .deb
paketi).

## Uygulama verilerinizle ne yapar

Uygulama, Odak cihazınızla USB kablosu üzerinden iletişim kurar. Okuduğu her şey bilgisayarınızda
kalır:

- **Ölçümler ve Hava Koçu geçmişi**, uygulamanın bilgisayarınızdaki kendi klasöründe saklanır;
  böylece sonraki eşitlemelerde yalnızca yeni ölçümler alınır.
- **Kaydettiğiniz dosyalar** (kayıtlar, geçmiş dışa aktarımları, yedekler, konsol çıktıları)
  yalnızca seçtiğiniz yere kaydedilir.
- **Planınız ve öncelikleriniz** (günlük plan; alerji / enfeksiyon / yorgunluk / odak) Odak
  cihazınızda ve bilgisayarınızdaki uygulamada saklanır.
- **Ayarlarınız** (arayüz dili, kart türü, saatin otomatik ayarlanması) bilgisayarınızdaki
  uygulamada saklanır.

## Uygulamanın yapmadıkları

- Mountain Labs'e veya başka birine hiçbir veri göndermez.
- Analiz, hata raporlama, reklam veya izleme araçları kullanmaz.
- Hesap oluşturmaz ve kişisel bilgi istemez.
- İnternete yalnızca Odak yazılım güncellemelerini denetlemek ve indirmek için bağlanır: yazılım
  listesini okur ve siz bir güncellemeyi onayladığınızda yazılım dosyasını Mountain Labs'in
  GitHub'daki yayın sayfasından indirir. Bu istekler kişisel veri veya cihaz verisi içermez; her
  indirmede olduğu gibi sunucu IP adresinizi görür.
- Kendiniz tıkladığınız bağlantılar (örneğin *Yardım → Mountain Labs Web Sitesi*) web
  tarayıcınızda açılır.

## Sağlık bilgileri

Hava Koçu önerileri ve öncelikler, bilinen iç ortam hava tetikleyicilerine maruziyetinizi
azaltmanıza yardımcı olur. Bunlar tıbbi tavsiye değildir; uygulama herhangi bir hastalığı teşhis
etmez, tedavi etmez veya önlemez. Öncelikleriniz bilgisayarınızdan ve cihazınızdan hiçbir zaman
dışarı çıkmaz.

## Verilerinizi silme

Uygulama verilerini tek bir klasörde tutar:

- **macOS, Mac App Store:** `~/Library/Containers/io.mountainlabs.app`
- **macOS, .dmg:** `~/Library/Application Support/Mountain Labs` (uygulamayı adı değişmeden önce
  kullandıysanız `ODAK Air Quality Monitor`)
- **Windows:** `%APPDATA%\Mountain Labs` (veya `ODAK Air Quality Monitor`); Microsoft Store
  sürümünü kaldırmak bu klasörü de siler
- **Linux:** `~/.config/Mountain Labs` (veya `ODAK Air Quality Monitor`); snap paketini kaldırmak
  bu klasörü de siler

Uygulamanın sakladığı her şeyi silmek için bu klasörü silin. Kendiniz dışa aktardığınız dosyalar
kaydettiğiniz yerde kalır. Cihazın kendi belleğindeki ölçümleri silmek için uygulamanın Komut Satırı
sekmesinde `$DATA_ERASE,1` komutunu kullanın.

## Çocuklar

Uygulama, çocuklar dahil hiç kimseden veri toplamaz.

## Değişiklikler ve iletişim

Bu politika değişirse yeni sürümü yeni bir tarihle aynı adreste yayımlanır.
Sorularınız için: Mountain Labs, https://mountainlabs.io
