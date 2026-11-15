# Veri akışı ve App Privacy kontrolü

Bu dosya mağaza beyanını hazırlamak içindir. “Data Not Collected” seçeneği otomatik olarak onaylanmış sayılmaz; son native derleme, SDK'lar ve gerçek ağ davranışı üzerinden karar verilir.

## İncelenen ve hedeflenen akışlar

| Veri / işlem | İşleme yeri | Geliştirici sunucusuna aktarım | Kullanıcı kontrolü / yayın kontrolü |
| --- | --- | --- | --- |
| Hesap adları, ana/alt hesap ilişkileri | Web'de tarayıcı; native iOS'ta uygulama alanı | Uygulamaya ait sunucu yok | Ekleme, düzenleme, silme, yedekleme |
| Tutar, gelir/gider, tarih, cari, açıklama | Aynı yerel veri kümesi | Otomatik aktarım tasarlanmadı | Düzenleme, filtreleme, silme |
| Ekli belge/fotoğraf içerikleri | Yerel kaydın eki | Otomatik aktarım tasarlanmadı | Kullanıcı dosyayı seçer, kaldırır veya dışa aktarır |
| Autocomplete indeksi ve önerileri | Cihaz belleği; mevcut kayıtlardan türetilir | Harici öneri/AI servisi yok | Yeni metin veya açık seçim; ayrı bir sunucu geçmişi tutulmaz |
| JSON yedeği dışa aktarma | iOS paylaşım sayfasında seçilen hedef | Geliştiriciye otomatik gönderilmez | Kullanıcı paylaşacağı uygulamayı/konumu seçer; üçüncü taraf hedef kendi koşullarına tabidir |
| Yazdırma | Kullanıcının seçtiği iOS yazdırma hizmeti/yazıcı | Geliştiriciye otomatik aktarım yok | Seçilen yazıcı finansal raporu alabilir; kullanıcı hedefi ve iptali yönetir |
| JSON içe aktarma | UIDocumentPicker ile kullanıcının seçtiği dosya | Geliştiriciye gönderilmez | İçerik doğrulanır; değiştirme öncesi kullanıcı onayı/yedek gerekir |
| Çoklu Hesap satın alma hakkı | Apple StoreKit ve cihazda doğrulanmış işlem bilgisi | Ayrı doğrulama sunucusu planlanmadı | Satın al, iptal et, satın alımları geri yükle; Apple hesabı/ödeme altyapısı Apple tarafından yönetilir |
| Destek için gönüllü gönderilen bilgiler | Fevzi Çakmak: fvzckmk35@gmail.com | Kullanıcı e-posta gönderirse destek kanalı bilgiyi alır | Kamuya açık politika destek amacı, gerekli saklama ve silme taleplerini açıklar; finansal defter gönderme zorunluluğu yok |
| Analiz / reklam / izleme | İncelenen uygulamada bu SDK'lar yok | Planlanan aktarım yok | Son bağımlılık ağacı ve derlemenin ağ kayıtları yeniden kontrol edilmeli |

## Native yapılandırma notları

Platform hazırlığında bildirilen yapılandırma:

- Capacitor 8.6.2; minimum deployment target iOS 15.
- iPhone ve iPad hedefleri açık; iki cihaz ailesi de test ve mağaza görselleri kapsamındadır.
- Web dosyaları native paketin içinde bulunur; üretim yapılandırmasında uzak `server.url` yoktur.
- Yerel JSON yolu: uygulama alanı içinde `Application Support/KasaPro/state.json`.
- Yazma: UTF-8 JSON, beklenen önceki veriyle karşılaştırma ve atomik dosya değiştirme.
- Dosya koruması: `NSFileProtectionCompleteUntilFirstUserAuthentication`. İlk cihaz kilidi açıldıktan sonra erişim mümkündür; ayrı bir uygulama parolası veya dışa aktarılan dosya şifrelemesi değildir.
- Uygulama katmanında native durum dosyası üst sınırı 24 MB; Swift köprüsünün savunma sınırı 32 MB; belge yedeği içe/dışa aktarmada 25 MB, tek belge paylaşımında 8 MB, yazdırılacak HTML'de 4 MB sınırı uygulanır. Hata halinde veri kırpılmamalıdır.
- Uygulama veri dosyası normal iOS cihaz yedeğine dahil olabilir. Bu, uygulamanın kendi iCloud eşitlemesi veya geliştirici sunucu yedeği değildir.
- JSON içe aktarmada sistem belge seçicisi ve security-scoped erişim; üst dosya sınırı 25 MB.
- JSON dışa aktarmada sistem paylaşım sayfası; paylaşımın tamamlanması ile kullanıcının iptali ayrılmalıdır. Yazdırmada sistem yazdırma arayüzü ve seçilen yazıcı kullanılır.
- Dosya seçicisinin isteğe bağlı kamera yolunu desteklemek için kamera kullanım açıklaması bulunur. Kamera yalnızca kullanıcı çekim yolunu seçerse kullanılmalı; izin reddi yerel kayıt takibini engellememeli. Mikrofon, konum veya geniş fotoğraf kitaplığı izni eklenmedi. Gerçek cihazdaki seçici/izin davranışı henüz kabul testi gerektirir.

Bu liste son Xcode projesi, `Info.plist`, Swift köprü kodu ve test sonuçlarıyla karşılaştırılmalıdır. Bir izin eklemek gerekiyorsa kullanım amacı ve açıklama metni de bu veri akışına eklenir.

## App Privacy karar adımları

1. Release bağımlılık ağacını ve paketlenen native framework'leri listeleyin. Geliştirme/test bağımlılıklarını uygulamaya paketlemeyin.
2. Yeni kurulum, ilk kayıt, dosya seçimi, yedek paylaşımı, satın alma ve geri yükleme sırasında ağ trafiğini gözleyin. Finansal JSON'un geliştiriciye veya üçüncü taraf bir analize gönderilmediğini doğrulayın.
3. Apple'ın “collect” tanımını son akışa uygulayın. Yalnızca cihazda işlenen ve cihaz dışına aktarılmayan finansal kayıtlar, geliştirici tarafından uzaktan toplanan verilerle aynı değildir.
4. StoreKit'in cihazdaki doğrulama bilgisini geliştiricinin ayrıca alıp almadığını değerlendirin. Sunucuya işlem/makbuz veya tanımlayıcı gönderme eklenirse satın alma geçmişi ve bağlantı beyanları yeniden değerlendirilir.
5. Onaylı destek e-postası için kullanıcının gönüllü gönderdiği iletişim/ek dosyaları değerlendirin. Apple'ın isteğe bağlı açıklama istisnasını koşulları karşılamadan varsaymayın.
6. Gerçek akış uygunsa “Data Not Collected” beyanı değerlendirilebilir. Aksi durumda tür, amaç, kullanıcıyla bağlantı ve takip durumunu doğru seçin.
7. App Privacy yanıtları, uygulama içi politika, kamuya açık politika ve mağaza açıklaması birbirini tutmalı.

“Sunucu yok” tek başına yeterli inceleme değildir. Son pakete eklenen SDK, destek formu veya üçüncü taraf hizmeti bu sonucu değiştirebilir.

## Privacy Manifest ve izinler

- Son paket içindeki uygulama ve üçüncü taraf `PrivacyInfo.xcprivacy` dosyalarını Xcode arşivinden inceleyin.
- Kullanılan Required Reason API'leri ve bu kullanıma uyan Apple onaylı nedenleri gerçek koda göre eşleyin. Kodda olmayan bir API veya gelişigüzel bir reason code eklemeyin.
- Kapasite/SDK manifesti, App Store Connect App Privacy yanıtının yerine geçmez; ikisi farklı beyanlardır.
- Dosya API'si veya tercih depolaması kullanan bağımlılıkların manifestlerinin pakete girdiğini doğrulayın. Mevcut Capacitor 8.6.2 KeyValueStore uygulaması dosya tabanlıdır; varsayımla UserDefaults gerekçesi eklenmez. Boş Required Reason API dizisi ancak son kod gerçekten listelenen API'leri kullanmıyorsa korunmalıdır.
- Kullanılmayan kamera, fotoğraf kitaplığı, mikrofon, konum, reklam takibi, push, arka plan ve keychain yeteneklerini eklemeyin.
- Gerçek kullanımın ihtiyaç duyduğu izin varsa amacı açıklayan Türkçe ve desteklenen diğer dil metinleri eklenir, izin reddi senaryosu test edilir.

## Export compliance

iOS dosya koruması ve Apple'ın satın alma/ağ hizmetleri işletim sistemi güvenlik mekanizmaları kullanır. Bu bilgi tek başına hukuki bir export-compliance sonucu değildir.

- Son uygulamanın gerçekten hangi kriptografi API/SDK'larını kullandığını listeleyin.
- Apple'ın güncel export-compliance sorularını bu listeye göre yanıtlayın.
- `ITSAppUsesNonExemptEncryption` değeri veya ek belge gerekliliği gerçek kullanım değerlendirmesine göre belirlenir; sırf uyarıyı kaldırmak için işaretlenmez.
- Sonradan özel şifreleme, bulut yedek, VPN veya başka bir kripto kütüphanesi eklenirse değerlendirmeyi yenileyin.

## Resmi başvuru kaynakları

Yayın gününde kaynakların güncel halini kullanın:

- [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)
- [App Review Guidelines: Privacy](https://developer.apple.com/app-store/review/guidelines/#privacy)

## Onaylı yayın kimliği ve sayfalar

- Yayıncı: Fevzi Çakmak.
- Destek/gizlilik e-postası: fvzckmk35@gmail.com (kamuya açık kullanım onaylandı).
- Politika: https://fevzicakmak.github.io/BHU/privacy.html
- Destek: https://fevzicakmak.github.io/BHU/support.html
- Geçerli tarih: 15 Kasım 2026.
