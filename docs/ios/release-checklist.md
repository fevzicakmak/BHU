# iOS / App Store yayın sırası

Bu liste, kod hazırlığından mağaza gönderimine kadar yapılacak somut işleri ayırır. İşaretlenmemiş maddeler yapılmış sayılmaz. Bir Linux kontrolü başarılı olsa bile imzalı iOS derlemesi veya gerçek cihaz kabulü yerine geçmez.

## 1. Kimlik ve Apple hesabı

- [x] App Store görünen adı **BHU** olarak seçildi.
- [x] Hak sahibi/yayıncı kimliği kullanıcı tarafından **Fevzi Çakmak** olarak doğrulandı.
- [ ] BHU adının mağaza kullanılabilirliği ve App Store Connect satıcı kaydı doğrulandı.
- [x] Apple Developer Program üyeliğinin etkin olduğu kullanıcı tarafından doğrulandı.
- [ ] Doğru Apple Developer Team ID ve erişimi yapılandırıldı.
- [ ] Kesin Bundle ID seçildi ve geliştirici hesabında kaydedildi. Geliştirme yapılandırmasındaki geçici ID üretim kimliği olarak yanlışlıkla kullanılmadı.
- [ ] App Store Connect uygulama kaydı ve SKU oluşturuldu.
- [ ] Paid Apps Agreement, vergi ve ödeme/banka bilgileri tamamlandı.
- [x] Kamuya açık destek adresi **fvzckmk35@gmail.com** olarak onaylandı; `privacy.html` ve `support.html` içerikleri Fevzi Çakmak kimliğiyle tamamlandı.
- [x] https://fevzicakmak.github.io/BHU/privacy.html ve https://fevzicakmak.github.io/BHU/support.html 15 Kasım 2026'da canlı HTTP 200, kimlik/iletişim, bağlantı ve mobil taşma kontrolünden geçti.

Kod veya depo içine Apple parolası, özel anahtar, dağıtım sertifikası, provisioning profile ya da App Store Connect API anahtarı yazılmaz. Bu kimlik bilgileri gerekli aşamada sahibinin güvenli hesabı/CI secret yönetimiyle sağlanır.

## 2. Uygulama paketi

- [x] Paketleme betiği uygulama/gizlilik/destek dosyalarını ve yerel Capacitor köprüsünü `dist/` içine alıyor; CI native senkronizasyon ve derleme başarılı. Gerçek çevrimdışı açılış aşağıdaki ayrı kontroldür.
- [ ] Uçak modunda ilk açılış ve daha önce kaydedilmiş işlemler çalışıyor.
- [x] Kaynak Capacitor yapılandırmasında uzak `server.url` veya canlı yeniden yükleme adresi yok.
- [x] [CI 43853676076](https://github.com/fevzicakmak/BHU/actions/runs/43853676076) gerçek imzasız iPhoneOS Release arşivinde 49 mekanik kontrolü geçti: kimlik/sürüm, debug bayrağı, arm64, ikon, native config ve birebir web dosyaları. Bu sonuç dağıtım imzası veya cihaz testi değildir.
- [ ] Native JSON depolaması başarıyı gerçekten dosyaya yazıldıktan sonra bildiriyor; hata halinde formu ve önceki dosyayı koruyor.
- [ ] Web/Safari kayıtları JSON yedeğiyle native uygulamaya aktarılabiliyor. İki uygulama alanının kendiliğinden ortak veri kullandığı varsayılmıyor.
- [ ] App Store sürüm/build numarası tekil ve doğru; görünen ad, ikon ve launch ekranı nihai.
- [ ] iPhone ve iPad düzenleri, güvenli alanlar, modal ve paylaşım popover'ları doğrulandı. Cihaz ailesi sonradan daraltılırsa mağaza alanları buna göre güncellendi.
- [ ] Minimum deployment target iOS 15 ile **yükleme için gerekli derleme SDK'sı/Xcode sürümü** birbirinden ayrıldı. Apple'ın gönderim günündeki SDK/Xcode gereksinimleri karşılanıyor.
- [x] Aynı Release incelemesinde `.storekit`, `.xctest`, `Tests` ve `test-artifacts` içeriği bulunmadı; 11 web dosyası yeni `dist/` ile birebir eşleşti. Son gönderilecek arşiv yeniden incelenmelidir.

## 3. Çoklu Hesap uygulama içi satın alımı

Ürün kuralı: **1 ücretsiz ana hesap + bu ana hesabın alt hesapları; ikinci ana hesap için tek seferlik kalıcı hak.** Alt hesap başına ücret veya abonelik yok.

- [ ] Kesin Product ID App Store Connect'te **Non-Consumable** olarak tanımlandı.
- [ ] Kod/config, StoreKit test dosyası ve App Store Connect'teki Product ID aynı. Geçici geliştirme ID'si nihai değerle doğrulandı.
- [ ] Türkçe ürün adı/açıklaması ve satın alma inceleme ekran görüntüsü yüklendi.
- [ ] Türkiye için hedef **399 TL** fiyat noktası App Store Connect'te doğrulandı; satış bölgeleri ve varsa diğer para birimleri hesap sahibi tarafından seçildi. Paywall fiyatı `Product.displayPrice` gibi gerçek StoreKit yerelleştirmesinden alıyor; sabit tutar yazmıyor.
- [ ] İlk ana hesap ve bütün alt hesapları ücretsiz oluşturulabiliyor.
- [ ] İkinci ana hesap, alt hesabı ana seviyeye çıkarma, çocukları ana seviyeye çıkaran silme ve ek ana hesap içeren yedek yükleme aynı yetki kontrolünü kullanıyor.
- [ ] Yeni satın alma yalnızca doğrulanmış StoreKit işlemiyle hakkı açıyor; iptal/pending/başarısız/unverified işlem açmıyor.
- [ ] Başarılı ve doğrulanmış işlem uygun şekilde tamamlanıyor; uygulama yeniden açılınca `currentEntitlements` üzerinden kalıcı hak yeniden değerlendiriliyor.
- [ ] “Satın alımları geri yükle” görünür; yeni kurulum/ikinci cihaz/sandbox hesabıyla doğrulandı.
- [ ] İade veya yetki geri alınması yeni ek ana hesap oluşturmayı sınırlar; mevcut kayıtları gizlemez, silmez veya dışa aktarmayı engellemez.
- [ ] Ürün bulunamadığında, internet yokken veya satın alma kısıtlandığında sahte fiyat/hak gösterilmiyor; finansal veri korunuyor.
- [ ] Family Sharing vaat edilecekse hem App Store Connect ayarı hem gerçek test sonucu mevcut. Aksi halde vaat edilmiyor.
- [ ] İlk IAP, Apple'ın güncel ilk ürün gönderim sürecine uygun şekilde uygulama sürümüyle birlikte incelemeye eklendi.

Geliştirme `.storekit` dosyasında başarılı satın alma görmek, gerçek ürünün App Store Connect'te oluşturulduğunu veya onaylandığını kanıtlamaz.

## 4. Gizlilik, izinler ve mağaza metni

- [ ] [Veri haritası](privacy-data-map.md) son native kod/bağımlılıklar/ağ kayıtlarıyla karşılaştırıldı.
- [x] [Gizlilik politikası](privacy-policy.tr.md) gerçek kimlik, onaylı iletişim ve 15 Kasım 2026 tarihiyle tamamlandı.
- [x] Politikanın kamuya açık HTTPS URL'si 15 Kasım 2026'da son canlı sayfada HTTP 200 ve onaylı kimlik/iletişim içeriğiyle doğrulandı.
- [ ] App Privacy yanıtları son veri akışıyla tutarlı. “Data Not Collected” koşulsuz varsayılmadı.
- [x] Release arşivinde 3 privacy manifest okunabildi; uygulamanın CapApp kaynak manifesti kaynakla eşleşti ve gerçek içerikler raporlandı.
- [ ] Privacy Manifest / Required Reason API beyanlarının son kullanıma hukuki uygunluğu ve App Privacy yanıtları ayrıca değerlendirildi; mekanik rapor bunu onaylamaz.
- [ ] Kullanılmayan hassas izinler/yetenekler yok; dosya seçicisindeki isteğe bağlı kamera yolunun Türkçe kullanım açıklaması ve izin ret davranışı gerçek cihazda test edildi.
- [ ] Export-compliance yanıtları gerçek kriptografi kullanımına göre değerlendirildi.
- [ ] [Mağaza metni](app-store-metadata.tr.md) son derlemenin gerçek özelliklerini ve çoklu hesap ücretini doğru anlatıyor.
- [ ] Nihai cihaz ailesinin gerekli ekran görüntüleri gerçek uygulama ve örnek verilerle çekildi.
- [ ] Yaş derecelendirme anketi gerçek içerik/özelliklere göre tamamlandı.
- [ ] App Review notları, satın alma ekranına ulaşma ve ücretsiz kullanım adımlarını açıklıyor; olmayan giriş hesabı bilgisi istenmiyor.

Kasa kayıtlarının silinmesi, bir giriş hesabının kapatılmasıyla aynı şey değildir. Şu tasarımda kullanıcı giriş hesabı yoktur. İleride giriş hesabı eklenirse Apple'ın hesap silme gereksinimleri ayrıca uygulanır.

## 5. Xcode ve TestFlight

- [x] [CI 43853676076](https://github.com/fevzicakmak/BHU/actions/runs/43853676076) üzerinde 33 Node testi, 45 Chromium senaryosu ve ayrı WebKit kontrolü başarılı.
- [x] Aynı çalıştırmada fiziksel iOS hedefli imzasız Release arşivi (SDK 26.2, arm64) ve 49 mekanik arşiv kontrolü başarılı; [arşiv](https://github.com/fevzicakmak/BHU/actions/runs/43853676076/artifacts/14219761788) ve [rapor](https://github.com/fevzicakmak/BHU/actions/runs/43853676076/artifacts/14219262140) mevcut.
- [x] Aynı sürümde SDK 26.5 / iPad Pro M5 simülatöründe iki soğuk açılış, gerçek `KasaStorage.read` ve görünür içerik kabulü başarılı. [Ekran görüntüleri ve kanıtlar](https://github.com/fevzicakmak/BHU/actions/runs/43853676076/artifacts/14220931775) elle incelendi; doğru BHU hesabı görünüyor. Bu simülatör kabulü gerçek cihaz testi değildir.
- [x] Önceki [iPhone çalıştırması 43772430952](https://github.com/fevzicakmak/BHU/actions/runs/43772430952) iki soğuk açılış ve gerçek native okumayı doğruladı; tarihsel sonuç güncel native yazma kabulü değildir.
- [x] Güncel iPhone hedefli 8 senaryolu SwiftPM XCTest paketi derlendi; derleme, test yürütmesi anlamına gelmez.
- [ ] Güncel iPhone native açılış/görünür içerik kabulü ve `--storage-tests` yürütmesi tamamlandı. Son denemede Simulator GUI açma isteği 20 saniyelik sınırda kaldı (25,57 saniye); native yazma testleri başlamadı. Yeni yardımcı GUI açmayı 60 saniyelik isteğe bağlı adım yapar, zorunlu boot/framebuffer/kayıt servisi/native/görünür içerik kontrollerini korur; tekrar test bekliyor.
- [ ] 8 native senaryonun çalışma sonuçları kabul edildi: ilk yazma/okuma ve yeni plugin ile kalıcılık, eski kayıt çatışması, birebir UTF-8/Unicode NFC-NFD karşılaştırması, eşzamanlı tek kazanan, geçersiz JSON/eksik karşılaştırma değeri, UTF-8 boyut sınırı, yazma hatasında dosyayı koruma ve sunuluyorsa koruma niteliği. Runner ayrı sandbox kullanır; donanım dosya korumasını veya gerçek StoreKit'i doğrulamaz.
- [ ] Gerçek iPhone ve iPad'e kurulup [TestFlight planı](testflight-test-plan.md) uygulandı.
- [ ] Dağıtım imzası/provisioning doğru; `Archive` ve `Validate App` başarılı.
- [ ] Organizer / onaylı yükleme aracıyla App Store Connect'e build yüklendi.
- [ ] App Store Connect işlemeyi tamamladı; privacy/SDK/ikon/yetenek hatası yok.
- [ ] TestFlight iç test gerçekleştirildi. Dış test seçilirse gerekli Beta App Review süreci tamamlandı.
- [ ] Gerçek StoreKit sandbox/TestFlight satın alma ve geri yükleme akışı doğrulandı; yerel StoreKit testiyle karıştırılmadı.
- [ ] Crash ve veri kaybı bulguları çözüldü; son test edilen build ile gönderilecek build aynı.

## 6. Son gönderim

- [ ] Nihai sürüm, IAP, ekran görüntüleri ve inceleme notları aynı özellik setini anlatıyor.
- [ ] Sürümün yayımlanma yöntemi (manuel/otomatik/tarihli) hesap sahibi tarafından seçildi.
- [ ] Sahibi son mağaza metnini, fiyatı, yasal kimliği ve üretim build'ini gözden geçirdi.
- [ ] App Store incelemesine gönderildi; inceleme sonucu takip ediliyor.

## Resmi kaynaklar

- [App Review Guidelines — In-App Purchase](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)
- [App Review Guidelines — Minimum Functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Submit an app for review](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app-for-review/)
- [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)

Yayına gönderme ve hesap/sözleşme işlemleri bu dosyanın oluşturulmasıyla gerçekleştirilmez.
