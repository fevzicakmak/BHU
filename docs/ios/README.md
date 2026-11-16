# iOS ve App Store yayın dosyaları

Bu klasör, BHU'nun iOS sürümü için hazırlanmış yayın belgelerini ve mağaza hazırlık notlarını içerir. Mevcut web arayüzündeki Kasa Pro adı iç dosya/depolama adlarında kalabilir. Dosyaların varlığı, uygulamanın imzalandığı, gerçek iPhone'da test edildiği veya App Store'a gönderildiği anlamına gelmez.

İkonun kaynak dosyası [`assets/branding/BHU-AppIcon-1024.png`](../../assets/branding/BHU-AppIcon-1024.png) olmalıdır: 1024×1024 PNG, alfa kanalı/şeffaflık içermez. Pillow ile `python3 scripts/generate-ios-artwork.py` doğrulayıp Xcode AppIcon yuvasına aynı baytları kopyalar; `python3 scripts/generate-ios-artwork.py --check` yazmadan eşleşmeyi denetler. Bu betik yalnız uygulama ikonunu yönetir.

İkon doğrulaması: [`287c970` kaynağının macOS çalıştırması](https://github.com/fevzicakmak/BHU/actions/runs/43911561535) 1024×1024 opak PNG eşleşmesini ve Xcode `actool` ile iPhone/iPad asset kataloğu derlemesini geçti. Aynı çalıştırmada 9 imzalama yardımcısı testi ve Debug/Release takım ayarları da geçti. Bu sonuç imzalı IPA veya mağazaya yükleme kanıtı değildir; App Store Connect ikonu yeni derleme yüklendiğinde alır.

| Dosya | Amaç |
| --- | --- |
| [app-store-metadata.tr.md](app-store-metadata.tr.md) | Türkçe mağaza metinleri, satın alma açıklaması ve inceleme notları |
| [metadata.tr.json](metadata.tr.json) ve [kopyalanabilir alanlar](metadata/README.md) | Onaylı metinlerin 12 alanlı JSON kaynağı ve 10 düz metin kopyası; mağazaya henüz gönderilmedi |
| [app-store-connect-setup.tr.md](app-store-connect-setup.tr.md) | Hesap sahibi için kayıtlı takım, uygulama/IAP kaydı, imzalama ve TestFlight adımları |
| [github-testflight.tr.md](github-testflight.tr.md) | Mac olmadan Codespaces, Apple sertifika/profil, GitHub Secrets, manuel IPA ve isteğe bağlı TestFlight yüklemesi |
| [privacy-policy.tr.md](privacy-policy.tr.md) | Fevzi Çakmak ve onaylı destek adresini içeren gizlilik politikası |
| [privacy-data-map.md](privacy-data-map.md) | Veri akışları, App Privacy ve Privacy Manifest kontrolü |
| [release-checklist.md](release-checklist.md) | Apple hesabı, imzalama, ürün tanımı ve yayın sırası |
| [testflight-test-plan.md](testflight-test-plan.md) | Gerçek cihaz ve satın alma kabul senaryoları |
| [support-content.tr.md](support-content.tr.md) | Kamuya açık destek sayfasının Türkçe yardım metni |

## Onaylanmış ürün kuralı

- Ücretsiz iOS kullanımında **bir ana hesap ve bu ana hesabın alt hesapları** kullanılabilir. Alt hesap başına ücret alınmaz.
- İkinci ana hesabı açmak için **tek seferlik, kalıcı Çoklu Hesap satın alımı** gerekir. Abonelik yoktur.
- Türkiye mağazası için güncel hedef tek seferlik fiyat **149,99 TL**. Kullanıcı bu tutarı seçip **Next → Confirm** yaptığını bildirdi; ürün ana sayfasındaki son **Save** ve satış bölgeleri henüz doğrulanmadı. Apple API ile bağımsız fiyat doğrulaması yapılmadı; uygulama Apple'ın gerçek yerelleştirilmiş `displayPrice` değerini göstermeye devam eder.
- Satın alma, Apple'ın uygulama içi satın alma sistemiyle doğrulanır. Bir yerel ayar veya yedek dosyası ücretli hakkı açamaz.
- Satın alma doğrulanamasa veya geri alınmış olsa da mevcut kayıtların görüntülenmesi, düzenlenmesi ve dışa aktarılması engellenmez. Yeni ek ana hesap açma ve aynı sonucu doğuran taşıma/geri yükleme işlemleri ayrıca denetlenir.
- Web sürümünün mevcut tarayıcıda yerel kayıt düzeni korunur. Bu belgelerdeki StoreKit ve iOS dosya depolaması açıklamaları **native iOS sürümünü** anlatır; web sürümünde aynı satın alma altyapısının bulunduğu varsayılmaz.

## Onaylanan yayın bilgileri

- App Store görünen adı: **BHU**. Mağaza adı kullanılabilirliği App Store Connect'te ayrıca kontrol edilir.
- Yayıncı/hizmet sağlayıcı: **Fevzi Çakmak**.
- Apple Developer üyeliğinin etkin olduğu kullanıcı tarafından doğrulandı. **Team ID `T4F4D367KQ`** alındı ve App Debug/Release yapılandırmasına yazıldı; sertifika/profil yetkisi ayrıca doğrulanmalıdır. Kullanıcı `com.fevzicakmak.bhu` Bundle ID kaydını ve BHU App Store Connect uygulama kaydını tamamladığını bildirdi.
- [Mac CI 43871719871 / job 133314330319](https://github.com/fevzicakmak/BHU/actions/runs/43871719871/job/133314330319), CLI Team override kullanmadan App Debug/Release ayarlarını `DEVELOPMENT_TEAM=T4F4D367KQ`, `Automatic` ve doğru Bundle ID olarak çözdü; `CODE_SIGNING_ALLOWED=NO` idi. Bu ayar kontrolü Apple takımına erişim veya dağıtım imzası kanıtı değildir.
- [Mac CI 43874034746 / job 133322286941](https://github.com/fevzicakmak/BHU/actions/runs/43874034746/job/133322286941), kaynak `7e5943e2744fc0bb6505236429f45e224fedd28c` için **9/9 sentetik politika/P12 uyumluluk testini (0 hata, 0 atlama)** geçti; modern giriş P12 üretimdeki aynı yardımcıyla dönüştürülüp Mac keychain'e alındı ve Team ayarları tekrar doğrulandı. Gerçek Apple sertifikası/profili/API anahtarı kullanılmadı; imzalı archive/export/upload yapılmadı.
- Kullanıcının Mac'i yoktur. İmzalama yolu, Apple portalı ve GitHub Codespaces üzerinden hazırlanan dosyalarla GitHub macOS runner kullanır; [gereken erişimler ve adımlar](github-testflight.tr.md) ayrı anlatılır.
- Çoklu Hesap ürün kaydında `com.fevzicakmak.bhu.multipleaccounts`, ürün Apple ID'si **6835484249**, **Non-Consumable** ve **Prepare for Submission** durumu ekran görüntüsünde görüldü. Kullanıcı Türkçe adı/açıklamayı **Display Name and Description → Add** üzerinden kaydettiğini bildirdi; ürünün incelemesi/onayı henüz yok.
- Kamuya açık destek/gizlilik iletişimi: **fvzckmk35@gmail.com**; kullanıcı bu adresin yayımlanmasını açıkça onayladı.
- Gizlilik URL'si: https://fevzicakmak.github.io/BHU/privacy.html
- Destek URL'si: https://fevzicakmak.github.io/BHU/support.html
- Kamuya açık sayfaların geçerlilik tarihi: **15 Kasım 2026**. Sayfalar kökteki `privacy.html` ve `support.html` dosyalarıdır; native pakete de çevrimdışı eklenebilir.

## Son incelenen doğrulama kanıtı

16 Kasım 2026 tarihli [CI 43864667196](https://github.com/fevzicakmak/BHU/actions/runs/43864667196), kod `d0d4bbb1e595adf501e0224263e245bea3f96826` için aşağıdaki sonuçları verdi. iPhone güvenli alan düzeltmesi aynı üretim Swift/CSS/config dosyalarını taşıyan `a0d18d2` çalıştırmasında geçti. `d0d4bbb1` yalnız test yardımcı betiğinin ekran öncesi ölçüm sırasını sıkılaştırır; bu son iPhone işi iki denemede de OS açılışında başarısız oldu, dolayısıyla son CI matrisinin tamamı başarılı değildir.

| Kontrol | Kanıt ve kapsam |
| --- | --- |
| Node / Chromium / WebKit | 33 Node testi, 45 Chromium senaryosu ve gerçek CI WebKit başarılı. Dokuz kontrol sınırı, dikey ekran / CSS değerlerinin tekrarlı uygulanması, asimetrik yatay ekran, CSS env geri dönüşü ve işlem/autocomplete/dışa aktarma kontrolleri geçti. Native-adapter tarayıcı senaryoları taklit köprü kullanır |
| Fiziksel iOS hedefli Release arşivi | İmzasız `iphoneos` arşivi SDK 26.2 / arm64 olarak derlendi; 49 mekanik kontrol başarılı. 11 web dosyası `dist/` ile birebir eşleşti, 3 privacy manifest okundu, test/StoreKit payload'ı yok; SystemBars `DARK` ayarı doğru |
| Release çıktıları | [İmzasız arşiv](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14223574378) ve [mekanik rapor](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14224971626); CI çıktıları 7 gün saklanır |
| iPad native okuma ve güvenli alan | [Job 133290037553](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/job/133290037553) başarılı. SDK 26.5 / iPad Pro 13-inch M5 simülatöründe iki soğuk açılış, gerçek native okuma, sentetik kaydın JavaScript'e dönüşü, değişmeyen kayıt ve görünür içerik geçti. İki kararlı ölçümle dokuz kontrol UIKit güvenli alanı içinde: üst 32, alt 20 pt. [Kanıt paketi](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14224439235); iki açılış ekranı ayrı ayrı elle incelendi: başlık/hesap seçimi/+ ve dört alt menü güvenli alanda, hesap ağacı okunaklı |
| iPhone native okuma ve güvenli alan | `a0d18d2` / [CI 43864576524 job 133289724143](https://github.com/fevzicakmak/BHU/actions/runs/43864576524/job/133289724143) başarılı. SDK 26.5 / iPhone 17 Pro simülatöründe iki soğuk açılış/native okuma/JavaScript'e dönüş/paint/değişmeyen kayıt geçti. Dokuz kontrol güvenli alanda kararlı: üst 62, alt 34 pt. [Kanıt paketinin](https://github.com/fevzicakmak/BHU/actions/runs/43864576524/artifacts/14225102498) iki ekranı ayrı ayrı elle incelendi; başlık ve alt menü güvenli alanda, durum çubuğu yazıları beyaz |
| iPhone depolama testleri | Aynı a0 job'unda ayrı XCTest runner alanında **8 toplam / 7 başarılı / 1 dosya koruma metadata testi atlandı / 0 hata**. BHU arayüzünden kaydetme/yeniden açma veya donanım koruması kanıtı değildir |
| d0 iPhone kontrolünün teknik sınırı | İlk [job 133290037925](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/job/133290037925) ve yalnız bu işin [ikinci denemesi 133296529337](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/job/133296529337), OS boot 300 saniye sınırında BHU kurulmadan başarısız oldu (ikinci komut 322,62 saniye). Native XCTest/UI/geometri aşamaları başlamadı. [İlk hata](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14226106017), [tekrar hatası](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14225244147); diğer d0 işler yeniden çalıştırılmadı |

Native depolama testlerinde ilk yazma/okuma ve yeni plugin ile kalıcılık, eski kayıt çatışması, **birebir UTF-8 / Unicode NFC-NFD karşılaştırması**, eşzamanlı yazmalarda tek kazanan, geçersiz JSON/eksik karşılaştırma değeri, UTF-8 boyut sınırı ve gerçek yazma hatasında önceki dosyanın korunması başarılıdır. Koruma metadata testi, simülatör OS bu niteliği sunmadığı için atlandı. Ayrı test runner alanı **BHU arayüzünden kaydetme → yeniden açma**, gerçek cihaz kilit koruması ve StoreKit işlemini doğrulamaz.

Önceki iPhone ikinci açılışında güvenli alan hatası bulunduğu için okuma/paint kontrolüne dokuz gerçek kontrolün UIKit güvenli alanında kararlı kalması şartı eklendi. Üretim kodu güvenli alanı CSS'e aktarır; yeniden yükleme/görünme/yerleşim değişiminde yeniler. Bu denetim bütün modal, döndürme veya erişilebilirlik kontrollerinin yerine geçmez. İmzasız arşiv de fiziksel cihaza kurulum, dağıtım imzası, mağaza yüklemesi veya privacy beyanının hukuki yeterliliğini doğrulamaz.

Arşiv ve simülatör kanıtları belirtilen hash'lere aittir; Team ID ayar çözümlemesi ayrı Mac CI kontrolüyle doğrulandı, ancak önceki imzasız kanıtlar yeni workflow ile gerçek imzalı arşiv/export/upload yapıldığını göstermez; son imzalı gönderim arşivi yeniden doğrulanmalıdır.

[Gizlilik](https://fevzicakmak.github.io/BHU/privacy.html) ve [destek](https://fevzicakmak.github.io/BHU/support.html) sayfaları 15 Kasım 2026'da canlı HTTP 200, onaylı kimlik/e-posta ve mobil taşma kontrolünden geçti.

## Kopyalanabilir mağaza alanları

[metadata.tr.json](metadata.tr.json), onaylı Türkçe metinlerin düz alan kaynağıdır. [metadata/tr-TR/](metadata/tr-TR/) altında uygulama adı, alt başlık, tanıtım, açıklama, anahtar kelime, inceleme notları, ürün adı/açıklaması ve destek/gizlilik URL'leri için 10 `.txt` kopyası bulunur. Bunlar bir yükleme veya mağaza onayı değildir; gerçek ürün, son build ve gerçek cihaz/StoreKit kabulünden sonra [kurulum rehberiyle](app-store-connect-setup.tr.md) kullanılmalıdır.

## Tamamlanması gereken mağaza adımları

1. Dağıtım sertifikası/profili ve güvenli repository Secrets hazırlığı; kullanıcı tarafından tamamlandığı bildirilen Bundle ID/BHU uygulama kaydı yeniden oluşturulmaz.
2. Mevcut Çoklu Hesap ürününde hedef 149,99 TL fiyat seçiminin son **Save** ile kaydı, kullanıcının belirleyeceği satış bölgeleri ve ürünün uygulama sürümüyle incelemeye eklenmesi.
3. Dağıtım imzası, gerçek cihaz/TestFlight kabulü ve son derlemeye ait App Privacy / export-compliance yanıtları.
4. iPhone/iPad gerçek ekran görüntüleri, son sürüm ve mağaza gönderimi.

Mağaza metni ve kontrol listeleri bu adımları yapılmış saymaz. Gizlilik ve destek sayfaları onaylanmış kimlik/iletişim bilgisiyle yayımlandı ve canlı URL'leri kontrol edildi. İçerikleri son App Store build'inin veri akışıyla yeniden karşılaştırılmalıdır.

## Hesap sahibinden sıradaki bilgiler

1. Mevcut ürünün **Availability** satış bölgeleri ve ürün ana sayfasındaki son **Save** adımının tamamlandığı bilgisi; 149,99 TL seçimi için **Next → Confirm** yapıldığı zaten bildirildi.
2. Ücretli uygulama sözleşmeleri/vergi/banka adımlarının durumu.
3. Dağıtım sertifikası/profili ve GitHub Secrets hazırlığı; Team ID, Bundle ID, BHU uygulaması veya ürün kimliği yeniden istenmez.

Team ID `T4F4D367KQ` kayıtlıdır; Bundle ID ve BHU uygulama kaydı kullanıcı bildirimine, Product ID ve ürün Apple ID'si görülen ekran görüntüsüne dayanır. Bu ilerleme Apple API üzerinden bağımsız hesap/fiyat doğrulaması veya StoreKit kabulü değildir. Apple parolası, dağıtım özel anahtarı ve API özel anahtarı belgeye/sohbete yazılmaz; gereken gizli bilgiler yalnız güvenli GitHub Secrets akışıyla sağlanır.
