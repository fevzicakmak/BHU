# iOS ve App Store yayın dosyaları

Bu klasör, BHU'nun iOS sürümü için hazırlanmış yayın belgelerini ve mağaza hazırlık notlarını içerir. Mevcut web arayüzündeki Kasa Pro adı iç dosya/depolama adlarında kalabilir. Dosyaların varlığı, uygulamanın imzalandığı, gerçek iPhone'da test edildiği veya App Store'a gönderildiği anlamına gelmez.

| Dosya | Amaç |
| --- | --- |
| [app-store-metadata.tr.md](app-store-metadata.tr.md) | Türkçe mağaza metinleri, satın alma açıklaması ve inceleme notları |
| [metadata.tr.json](metadata.tr.json) ve [kopyalanabilir alanlar](metadata/README.md) | Onaylı metinlerin 12 alanlı JSON kaynağı ve 10 düz metin kopyası; mağazaya henüz gönderilmedi |
| [app-store-connect-setup.tr.md](app-store-connect-setup.tr.md) | Hesap sahibi için Team ID, uygulama/IAP kaydı, imzalama ve TestFlight adımları |
| [privacy-policy.tr.md](privacy-policy.tr.md) | Fevzi Çakmak ve onaylı destek adresini içeren gizlilik politikası |
| [privacy-data-map.md](privacy-data-map.md) | Veri akışları, App Privacy ve Privacy Manifest kontrolü |
| [release-checklist.md](release-checklist.md) | Apple hesabı, imzalama, ürün tanımı ve yayın sırası |
| [testflight-test-plan.md](testflight-test-plan.md) | Gerçek cihaz ve satın alma kabul senaryoları |
| [support-content.tr.md](support-content.tr.md) | Kamuya açık destek sayfasının Türkçe yardım metni |

## Onaylanmış ürün kuralı

- Ücretsiz iOS kullanımında **bir ana hesap ve bu ana hesabın alt hesapları** kullanılabilir. Alt hesap başına ücret alınmaz.
- İkinci ana hesabı açmak için **tek seferlik, kalıcı Çoklu Hesap satın alımı** gerekir. Abonelik yoktur.
- Türkiye mağazası için hedef tek seferlik fiyat **399 TL**. Gerçek fiyat noktası App Store Connect'te doğrulanmalı; uygulama fiyatı Apple'ın yerelleştirilmiş ürün bilgisinden göstermeli.
- Satın alma, Apple'ın uygulama içi satın alma sistemiyle doğrulanır. Bir yerel ayar veya yedek dosyası ücretli hakkı açamaz.
- Satın alma doğrulanamasa veya geri alınmış olsa da mevcut kayıtların görüntülenmesi, düzenlenmesi ve dışa aktarılması engellenmez. Yeni ek ana hesap açma ve aynı sonucu doğuran taşıma/geri yükleme işlemleri ayrıca denetlenir.
- Web sürümünün mevcut tarayıcıda yerel kayıt düzeni korunur. Bu belgelerdeki StoreKit ve iOS dosya depolaması açıklamaları **native iOS sürümünü** anlatır; web sürümünde aynı satın alma altyapısının bulunduğu varsayılmaz.

## Onaylanan yayın bilgileri

- App Store görünen adı: **BHU**. Mağaza adı kullanılabilirliği App Store Connect'te ayrıca kontrol edilir.
- Yayıncı/hizmet sağlayıcı: **Fevzi Çakmak**.
- Apple Developer üyeliğinin etkin olduğu kullanıcı tarafından doğrulandı. Team erişimi, sertifika ve mağaza kaydı işlemleri ayrıca tamamlanmalıdır.
- Kamuya açık destek/gizlilik iletişimi: **fvzckmk35@gmail.com**; kullanıcı bu adresin yayımlanmasını açıkça onayladı.
- Gizlilik URL'si: https://fevzicakmak.github.io/BHU/privacy.html
- Destek URL'si: https://fevzicakmak.github.io/BHU/support.html
- Kamuya açık sayfaların geçerlilik tarihi: **15 Kasım 2026**. Sayfalar kökteki `privacy.html` ve `support.html` dosyalarıdır; native pakete de çevrimdışı eklenebilir.

## Son incelenen doğrulama kanıtı

16 Kasım 2026 tarihindeki [CI çalıştırması 43853676076](https://github.com/fevzicakmak/BHU/actions/runs/43853676076), kod `6005053` için aşağıdaki sonuçları verdi. Çalıştırmanın tamamı başarılı değildir; derleme, native okuma ve test yürütmesi ayrı değerlendirilir.

| Kontrol | Güncel sonuç |
| --- | --- |
| Node veri/öneri/native-adapter testleri | 33 test başarılı |
| Chromium uygulama/taşıma/autocomplete/native-adapter senaryoları | 45 senaryo başarılı; native-adapter senaryoları taklit köprü kullanır |
| Playwright WebKit kontrolü | Başarılı; gerçek iOS WKWebView veya cihaz kabulü yerine geçmez |
| Fiziksel iOS hedefli Release arşivi | İmzasız `iphoneos` arşivi başarıyla derlendi; SDK 26.2, arm64 |
| Gerçek Release arşivi incelemesi | 49 mekanik kontrol başarılı; 11 web dosyası yeni `dist/` ile birebir eşleşti, 3 privacy manifest okundu, test/StoreKit payload'ı bulunmadı |
| Release çıktıları | [İmzasız arşiv](https://github.com/fevzicakmak/BHU/actions/runs/43853676076/artifacts/14219761788) ve [mekanik inceleme raporu](https://github.com/fevzicakmak/BHU/actions/runs/43853676076/artifacts/14219262140); CI çıktıları 7 gün saklanır |
| iPad native kabulü | SDK 26.5 / iPad Pro M5 simülatöründe iki soğuk açılış, gerçek `KasaStorage.read`, değişmeyen sentetik kayıt ve görünür içerik kontrolü başarılı. [Kanıt paketi](https://github.com/fevzicakmak/BHU/actions/runs/43853676076/artifacts/14220931775) ekran görüntüleri elle incelendi; doğru BHU hesabı görünür |
| iPhone native test paketi | 8 XCTest senaryosu başarıyla derlendi. Simulator GUI açılışı 20 saniyelik sınırda kaldı (ölçülen 25,57 saniye); gerçek test yürütmesi başlamadı. Native yazma başarısı henüz kanıtlanmadı |
| Yeni yardımcı değişiklik | GUI açma isteği isteğe bağlı ve 60 saniye sınırlı; zorunlu OS boot, framebuffer, uygulama kayıt servisi, native okuma ve görünür içerik kapıları korunuyor. Değişiklik tekrar test bekliyor |

Native yazma, beklenen önceki kaydı Unicode eşdeğerliğiyle değil **UTF-8 baytlarını birebir karşılaştırarak** denetler. 8 XCTest senaryosu ilk yazma/okuma ve yeni plugin ile kalıcılık, eski kayıt çatışması, Unicode NFC/NFD farkı, eşzamanlı yazmalarda tek kazanan, geçersiz JSON/eksik karşılaştırma değeri, UTF-8 boyut sınırı, gerçek yazma hatasında önceki dosyanın korunması ve sunuluyorsa dosya koruma niteliğini kapsar. Paket derlendi; bu senaryoların çalışma sonuçları bekleniyor. Test runner ayrı sandbox kullanır; BHU'nun gerçek cihaz saklama alanı, donanım kilit koruması veya gerçek StoreKit işlemi doğrulanmaz.

Bu arşiv fiziksel iOS için **derlenmiştir**; fiziksel cihaza kurulduğu veya App Store imzası taşıdığı anlamına gelmez. Mekanik inceleme imza/provisioning, App Store yüklemesi, privacy beyanının hukuki yeterliliği, gerçek dosya koruması veya gerçek StoreKit işlemini doğrulamaz. Önceki [iPhone kanıtı 43772430952](https://github.com/fevzicakmak/BHU/actions/runs/43772430952), önceki kodda iki soğuk açılış ve gerçek native okumayı doğrulamıştır; güncel native yazma kabulü değildir.

[Gizlilik](https://fevzicakmak.github.io/BHU/privacy.html) ve [destek](https://fevzicakmak.github.io/BHU/support.html) sayfaları 15 Kasım 2026'da canlı HTTP 200, onaylı kimlik/e-posta ve mobil taşma kontrolünden geçti.

## Kopyalanabilir mağaza alanları

[metadata.tr.json](metadata.tr.json), onaylı Türkçe metinlerin düz alan kaynağıdır. [metadata/tr-TR/](metadata/tr-TR/) altında uygulama adı, alt başlık, tanıtım, açıklama, anahtar kelime, inceleme notları, ürün adı/açıklaması ve destek/gizlilik URL'leri için 10 `.txt` kopyası bulunur. Bunlar bir yükleme veya mağaza onayı değildir; gerçek ürün, son build ve gerçek cihaz/StoreKit kabulünden sonra [kurulum rehberiyle](app-store-connect-setup.tr.md) kullanılmalıdır.

## Tamamlanması gereken mağaza adımları

1. Gerçek Apple Developer Team ID / erişimi, kesin Bundle ID ve App Store Connect uygulama kaydı.
2. Çoklu Hesap ürününün gerçek App Store Connect kaydı; Türkiye için hedef 399 TL fiyat noktası, satış bölgeleri ve uygulama sürümüyle incelemeye eklenmesi.
3. Dağıtım imzası, gerçek cihaz/TestFlight kabulü ve son derlemeye ait App Privacy / export-compliance yanıtları.
4. iPhone/iPad gerçek ekran görüntüleri, son sürüm ve mağaza gönderimi.

Mağaza metni ve kontrol listeleri bu adımları yapılmış saymaz. Gizlilik ve destek sayfaları onaylanmış kimlik/iletişim bilgisiyle yayımlandı ve canlı URL'leri kontrol edildi. İçerikleri son App Store build'inin veri akışıyla yeniden karşılaştırılmalıdır.

## Hesap sahibinden sıradaki bilgiler

1. Apple Developer üyeliğindeki **10 karakterli Team ID** ve bu takımda App Store yayınlama yetkisinin bulunduğu doğrulaması.
2. `com.fevzicakmak.bhu` Bundle ID'sinin kendi takımında kayıt durumu ve bu kimlikle açılmış **BHU App Store Connect uygulama kaydı**.
3. `com.fevzicakmak.bhu.multipleaccounts` ürününün aynı uygulama altında **Non-Consumable** olarak oluşturulup oluşturulmadığı; Türkiye hedef 399 TL fiyatı ve gerekli ücretli uygulama sözleşmeleri/vergi/banka adımlarının durumu.

Bu kimlikler şu anda koddaki aday değerlerdir. Team ID, Bundle ID ve ürün kimliği yapılandırma bilgisidir; Apple parolası, dağıtım özel anahtarı veya App Store Connect API özel anahtarı belgeye/sohbete yazılmamalıdır. Dağıtım imzası ve yükleme sahibinin güvenli Xcode/CI kimlik bilgileriyle tamamlanır.
