# iOS ve App Store yayın dosyaları

**28 Kasım 2026, 09:05:42 UTC — Apple incelemesine gönderildi.** BHU **1.0 / build 5.1** ve ilk Non-Consumable **Çoklu Hesap** aynı mevcut inceleme taslağında ayrı öğeler olarak doğrulandı. `submitted=true` isteği kabul edildi; yeni GET ile gönderim tarihi ve uygulama, IAP sürümü, IAP ürünü için **WAITING_FOR_REVIEW** durumu doğrulandı. Önceki App Privacy/uyum engelleri, kullanıcının beyanları kaydetmesinden sonra uygulamayı pakete ekleme kontrolünü artık engellemedi. İnceleme onayı ve herkese açık yayın henüz gerçekleşmedi; mevcut **AFTER_APPROVAL** ayarı korunduğu için Apple onayından sonra otomatik yayın öngörülüyor. Ülke kapsamı, ücretsiz indirme ve Çoklu Hesap fiyatı değiştirilmedi. Bu kayıt, aşağıdaki daha eski hazırlık/gönderim engeli notlarının güncel sonucudur.


**28 Kasım 08:43 UTC — gerçek gönderim ön kontrolü:** Kullanıcı incelemeye göndermeyi açıkça istedi. Apple inceleme taslağı oluşturuldu, ancak uygulama sürümünü ekleme isteği `409 STATE_ERROR.ENTITY_STATE_INVALID` ile reddedildi; taslak boş ve gönderilmemiştir. İçerik hakları beyanı daha sonra `DOES_NOT_USE_THIRD_PARTY_CONTENT` olarak kaydedilip yeniden doğrulandı. Diğer gerçek engeller: App Privacy yanıtlarının yayımlanmaması (`APP_DATA_USAGES_REQUIRED`) ve iki tamamlanmamış Çin uyum formu (`SECURITYASF395E`, `AIGENERATEFD1DE`).

Bu formlar **Apps → BHU → General → App Compliance** sayfasındaki **Security Assessment** ve **AI-Generated or Synthetic Content** alanlarından tamamlanır. [Apple’ın güncel rehberi](https://developer.apple.com/help/app-store-connect/manage-compliance-information/view-china-mainland-compliance-information), bu özellikleri sunmayan uygulamalar için `No` seçeneğini açıklar; BHU’nun kaynaklarında bu AI/mesajlaşma özellikleri yoktur. App Privacy için ayrı `Publish` işlemi gerekir. Mevcut App Manager API bağlantısı bu uyum formlarını düzenleyemez; hesap sahibi/Admin web ekranı gerekir. Çin veya başka ülke otomatik kapatılmadı. **App Review gönderimi ve herkese açık yayın gerçekleşmedi.** İlk IAP uygulama sürümüyle aynı gönderimde tutulmalıdır; yeniden denemede yeni taslak açmadan mevcut taslak ve öğeleri yeniden okuyun.


Bu klasör, BHU'nun iOS sürümü için hazırlanmış yayın belgelerini ve mağaza hazırlık notlarını içerir. Mevcut web arayüzündeki Kasa Pro adı iç dosya/depolama adlarında kalabilir. Dosyaların varlığı, uygulamanın imzalandığı, gerçek iPhone'da test edildiği veya App Store'a gönderildiği anlamına gelmez.

İkonun kaynak dosyası [`assets/branding/BHU-AppIcon-1024.png`](../../assets/branding/BHU-AppIcon-1024.png) olmalıdır: 1024×1024 PNG, alfa kanalı/şeffaflık içermez. Pillow ile `python3 scripts/generate-ios-artwork.py` doğrulayıp Xcode AppIcon yuvasına aynı baytları kopyalar; `python3 scripts/generate-ios-artwork.py --check` yazmadan eşleşmeyi denetler. Bu betik yalnız uygulama ikonunu yönetir.

İkon doğrulaması: [`287c970` kaynağının macOS çalıştırması](https://github.com/fevzicakmak/BHU/actions/runs/43911561535) 1024×1024 opak PNG eşleşmesini ve Xcode `actool` ile iPhone/iPad asset kataloğu derlemesini geçti. Aynı çalıştırmada 9 imzalama yardımcısı testi ve Debug/Release takım ayarları da geçti. Bu sonuç imzalı IPA veya mağazaya yükleme kanıtı değildir; App Store Connect ikonu yeni derleme yüklendiğinde alır.

| Dosya | Amaç |
| --- | --- |
| [app-store-metadata.tr.md](app-store-metadata.tr.md) | Türkçe mağaza metinleri, satın alma açıklaması ve inceleme notları |
| [metadata.tr.json](metadata.tr.json) ve [kopyalanabilir alanlar](metadata/README.md) | Onaylı metinlerin 12 alanlı JSON kaynağı ve 10 düz metin kopyası; 27 Kasım mağaza taslağı kayıtlarının kaynağı, App Review gönderimi değil |
| [app-review-notes.en.txt](app-review-notes.en.txt) | Türkçe arayüz adımlarıyla 5.1 için İngilizce App Review notu |
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
- Türkiye mağazası için kaydedilmiş aktif tek seferlik fiyat **149,99 TRY**, 27 Kasım Apple API okumasında doğrulandı. Uygulama ve ürün 134 bölgede; Türkiye açık ve AB ülkeleri kapalıdır. Fiyat değiştirilmedi; uygulama Apple'ın gerçek yerelleştirilmiş `displayPrice` değerini göstermeye devam eder.
- Satın alma, Apple'ın uygulama içi satın alma sistemiyle doğrulanır. Bir yerel ayar veya yedek dosyası ücretli hakkı açamaz.
- Satın alma doğrulanamasa veya geri alınmış olsa da mevcut kayıtların görüntülenmesi, düzenlenmesi ve dışa aktarılması engellenmez. Yeni ek ana hesap açma ve aynı sonucu doğuran taşıma/geri yükleme işlemleri ayrıca denetlenir.
- Web sürümünün mevcut tarayıcıda yerel kayıt düzeni korunur. Bu belgelerdeki StoreKit ve iOS dosya depolaması açıklamaları **native iOS sürümünü** anlatır; web sürümünde aynı satın alma altyapısının bulunduğu varsayılmaz.

## Onaylanan yayın bilgileri

- App Store görünen adı: **BHU**; Türkçe mağaza kaydı API'de doğrulandı.
- Yayıncı/hizmet sağlayıcı: **Fevzi Çakmak**.
- Apple Developer üyeliğinin etkin olduğu kullanıcı tarafından doğrulandı. **Team ID `T4F4D367KQ`** alındı ve App Debug/Release yapılandırmasına yazıldı; sertifika/profil yetkisi ayrıca doğrulanmalıdır. Kullanıcı `com.fevzicakmak.bhu` Bundle ID kaydını ve BHU App Store Connect uygulama kaydını tamamladığını bildirdi.
- [Mac CI 43871719871 / job 133314330319](https://github.com/fevzicakmak/BHU/actions/runs/43871719871/job/133314330319), CLI Team override kullanmadan App Debug/Release ayarlarını `DEVELOPMENT_TEAM=T4F4D367KQ`, `Automatic` ve doğru Bundle ID olarak çözdü; `CODE_SIGNING_ALLOWED=NO` idi. Bu ayar kontrolü Apple takımına erişim veya dağıtım imzası kanıtı değildir.
- [Mac CI 43874034746 / job 133322286941](https://github.com/fevzicakmak/BHU/actions/runs/43874034746/job/133322286941), kaynak `7e5943e2744fc0bb6505236429f45e224fedd28c` için **9/9 sentetik politika/P12 uyumluluk testini (0 hata, 0 atlama)** geçti; modern giriş P12 üretimdeki aynı yardımcıyla dönüştürülüp Mac keychain'e alındı ve Team ayarları tekrar doğrulandı. Gerçek Apple sertifikası/profili/API anahtarı kullanılmadı; imzalı archive/export/upload yapılmadı.
- Kullanıcının Mac'i yoktur. İmzalama yolu, Apple portalı ve GitHub Codespaces üzerinden hazırlanan dosyalarla GitHub macOS runner kullanır; [gereken erişimler ve adımlar](github-testflight.tr.md) ayrı anlatılır.
- Çoklu Hesap ürünü `com.fevzicakmak.bhu.multipleaccounts` / **6835484249**, API’de **NON_CONSUMABLE** olarak doğrulandı. Türkçe yerelleştirme ve `COMPLETE` inceleme görseli mevcut; 28 Kasım ürün durumu **READY_TO_SUBMIT**. Gerçek satın alma/geri yükleme kabulü ve ürün inceleme onayı ayrıca bekler.
- Kamuya açık destek/gizlilik iletişimi: **fvzckmk35@gmail.com**; kullanıcı bu adresin yayımlanmasını açıkça onayladı.
- Gizlilik URL'si: https://fevzicakmak.github.io/BHU/privacy.html
- Destek URL'si: https://fevzicakmak.github.io/BHU/support.html
- Kamuya açık sayfaların geçerlilik tarihi: **15 Kasım 2026**. Sayfalar kökteki `privacy.html` ve `support.html` dosyalarıdır; native pakete de çevrimdışı eklenebilir.

## Son incelenen doğrulama kanıtı

**28 Kasım 2026 — güncel kayıtlar:** [Son mağaza kontrolü](https://github.com/fevzicakmak/BHU/actions/runs/46122268729) 07:40:23 UTC itibarıyla BHU 1.0 taslağındaki metinleri, kategori/URL’leri, inceleme alanlarını ve **5.1** bağlantısını doğruladı. iPhone/iPad hesap görselleri ve Çoklu Hesap inceleme görseli **COMPLETE**; Non-Consumable ürün **READY_TO_SUBMIT** durumunda. Kayıtlı Türkiye ürün fiyatı **149,99 TRY**; uygulama ve ürün **134 bölgede**, Türkiye açık ve AB ülkeleri kapalıdır.

**Ücretsiz indirme ve yaş:** Uygulamanın indirme fiyatı kaydedilip yeniden okundu: mevcut USA temeli korunarak **1 manuel + 174 otomatik fiyatın tamamı sıfır**, Türkiye de ücretsiz. Yaş anketindeki 26 boş yanıt uygulamanın mevcut özelliklerine göre doldurulup birebir geri okundu; Apple 175 ülke derecesi oluşturdu ve Türkiye için **FOUR_PLUS (4+)** hesapladı. Yaş sonucu zorlanmadı; mevcut yaş/ülke tercihleri korundu.

[28 Kasım canlı build sorgusu](https://github.com/fevzicakmak/BHU/actions/runs/46122271280), **1.0 / 5.1** için `VALID`, `expired=false`, `IN_BETA_TESTING` ve dış test için `READY_FOR_BETA_SUBMISSION` doğruladı. App Privacy beyanının **Publish** durumu API’den görülemiyor; davet teslimi/kabulü, fiziksel cihaz kurulumu ve gerçek satın alma/geri yükleme testleri henüz doğrulanmadı. **App Review gönderimi veya herkese açık yayın yapılmadı.** Kayıtlı `AFTER_APPROVAL` yayın seçeneği değiştirilmedi.

**27 Kasım önceki mağaza durumu (tarihsel):** [27 Kasım salt okunur mağaza kontrolü 46033077370](https://github.com/fevzicakmak/BHU/actions/runs/46033077370), 16:22 UTC itibarıyla Türkçe ad/alt başlık/açıklama, destek ve gizlilik URL'leri, kategori, telif ve App Review alanlarının kaydını doğruladı; **5.1** sürüme bağlandı. Uygulama ve Çoklu Hesap ürünü **134 bölgede**, **Türkiye açık / AB ülkeleri kapalı**; kaydedilmiş aktif Türkiye ürün fiyatı **149,99 TRY**. Fiyat değiştirilmedi. Birer iPhone **1206×2622** ve iPad **2064×2752** hesap ağacı görseli Apple'da **COMPLETE** işlendi. Bu okuma bütün gönderim koşullarının veya görsel kapsamının tamamlandığını göstermez. IAP ürünü **MISSING_METADATA** durumunda; bu kontrolde satın alma inceleme görseli henüz yoktu.

**27 Kasım TestFlight doğrulaması:** [27 Kasım canlı build sorgusu 46025212781](https://github.com/fevzicakmak/BHU/actions/runs/46025212781/job/140594750047), doğru BHU/bundle/1.0/**5.1** için `VALID`, `expired=false`, `IN_BETA_TESTING` ve dış test için `READY_FOR_BETA_SUBMISSION` doğruladı. Davet teslimi için mevcut destek kaydına takip iletisi gönderildi; kullanıcının daveti posta kutusunda bulunmadı. Davet kabulü/cihaz kurulumu, gerçek StoreKit satın alma/geri yükleme, App Privacy yayını ve yasal son kontroller bekliyor. **App Review gönderimi veya herkese açık yayın tetiklenmedi.**

**İmzalı yükleme kanıtı (18 Kasım):** `c4d09beeb27ef6571210b83f31ce6357a406a2e0` / [yükleme 44312503648](https://github.com/fevzicakmak/BHU/actions/runs/44312503648/job/134829998804), **15/15 Mac testi, 0 hata/0 atlama** ile başarılıydı. Gerçek Apple doğrulama/yükleme yanıtlarında `accepted=true`; iki işlemdeki **90725 SDK bildirimi kabulü engellemedi**. Orijinal IPA artifact'ının yedi günlük saklama süresi 25 Kasım'da sona erdi; bu durum Apple'daki 5.1 build'inin süresinin dolduğu anlamına gelmez.

**Önceki build:** 4.1, 17 Kasım'da hazırdı; [18 Kasım sorgusunda](https://github.com/fevzicakmak/BHU/actions/runs/44312149712/job/134828758919) **Expired** görüldü. Sona erme nedeni doğrulanmadı; güncel kurulum sürümü 5.1'dir.

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

[Gizlilik](https://fevzicakmak.github.io/BHU/privacy.html) ve [destek](https://fevzicakmak.github.io/BHU/support.html) sayfaları 15 Kasım 2026'da canlı HTTP 200, onaylı kimlik/e-posta ve mobil taşma kontrolünden geçti. 27 Kasım'da HTTP 200 ve onaylı yayıncı/iletişim içeriği yeniden doğrulandı.

Önceki 3.1 CLI çıkış kodu yükleme kabulü sayılmadı. Güncel **5.1** Apple yükleme yanıtı ve canlı REST sorgusuyla doğrulandı; **VALID**, süresi dolmamış ve dahili dağıtımı **IN_BETA_TESTING** durumundadır. Bu, gerçek cihaz testi veya dış Beta App Review onayı değildir.

## Kopyalanabilir mağaza alanları

[metadata.tr.json](metadata.tr.json), onaylı Türkçe metinlerin düz alan kaynağıdır. [metadata/tr-TR/](metadata/tr-TR/) altında uygulama adı, alt başlık, tanıtım, açıklama, anahtar kelime, inceleme notları, ürün adı/açıklaması ve destek/gizlilik URL'leri için 10 `.txt` kopyası bulunur. Kanonik Türkçe uygulama metinleri 27 Kasım'da mağaza taslağına kaydedildi; bu, App Review gönderimi veya onayı değildir. Son Product ID ve 5.1 arayüz yollarını içeren [İngilizce inceleme notu](app-review-notes.en.txt) da hazırdır. Gerçek cihaz/StoreKit kabulü ve son gönderim kontrolü sürer.

## Tamamlanması gereken mağaza adımları

1. 5.1 geçerli ve dahili dağıtımı aktif; davet teslimi için destek takibi sürüyor. Fiziksel cihazda kurulum, kayıt/yeniden açma ve StoreKit satın alma/geri yükleme kabulü tamamlanmalı.
2. `COMPLETE` inceleme görseli bulunan **READY_TO_SUBMIT** Çoklu Hesap ürünü, ilk ürün olarak uygulama sürümüyle birlikte incelemeye hazırlanmalı. Ücretsiz indirme, 149,99 TRY ürün fiyatı ve Türkiye/AB bölgeleri doğrulandı; bu kayıtlar yeniden oluşturulmaz.
3. App Privacy beyanının yayımlanması, export-compliance ve hesap genelindeki yasal kayıtların son kontrolü tamamlanmalı. Yaş anketi kaydedildi; Apple’ın Türkiye sonucu **4+** olarak geri okundu.
4. Kaydedilen iPhone/iPad görsellerinin son mağaza kapsamı kontrol edilmeli. İki görselin `COMPLETE` olması inceleme onayı değildir; App Review gönderimi ve yayın ayrı aşamalardır.

Mağaza metni ve kontrol listeleri bu adımları yapılmış saymaz. Gizlilik ve destek sayfaları onaylanmış kimlik/iletişim bilgisiyle yayımlandı ve canlı URL'leri kontrol edildi. İçerikleri son App Store build'inin veri akışıyla yeniden karşılaştırılmalıdır.

## Kalan doğrulamalar

1. Gerçek iPhone kurulumu, kayıt/yeniden açma ve satın alma/geri yükleme sonuçları bekleniyor. Mağaza metinleri, inceleme notları/iletişim alanları ve build 5.1 kaydedildi; bu kayıtlar cihaz testini tamamlamaz.
2. Kullanıcı DSA adımını tamamladığını bildirdi. Hesap genelindeki DSA/hukuki kayıtlar bu salt okunur uygulama raporuyla bağımsız doğrulanmaz; önceki tamamlanmış kullanıcı adımları tekrar istenmez. Paid Apps Agreement, banka ve W-8BEN için önceki ekranda **Active** görüldü.
3. İmzalı IPA üretiminde kullanılan sertifika/profil/Secrets yeniden hazırlanmaz. 5.1 aktif dahili dağıtımı ve davet alıcı adresi doğrulandı; teslim/kabul ve cihaz kurulumu bekliyor. Team ID, Bundle ID, BHU uygulaması veya ürün kimliği yeniden istenmez.

Team ID `T4F4D367KQ` kayıtlıdır. BHU uygulaması/bundle ve ürün eşleşmesi REST API ile doğrulandı; 27 Kasım sorgusu kaydedilmiş fiyat/bölgeleri de doğruladı. Bu, gerçek StoreKit satın alma/geri yükleme kabulü değildir. Apple parolası, dağıtım özel anahtarı ve API özel anahtarı belgeye/sohbete yazılmaz; gereken gizli bilgiler yalnız güvenli GitHub Secrets akışıyla sağlanır.
