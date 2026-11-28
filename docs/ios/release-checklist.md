# iOS / App Store yayın sırası

Bu liste, kod hazırlığından mağaza gönderimine kadar yapılacak somut işleri ayırır. İşaretlenmemiş maddeler yapılmış sayılmaz. Bir Linux kontrolü başarılı olsa bile imzalı iOS derlemesi veya gerçek cihaz kabulü yerine geçmez.

**28 Kasım 2026 — güncel kayıtlar:** [Son mağaza kontrolü](https://github.com/fevzicakmak/BHU/actions/runs/46122268729) 07:40:23 UTC itibarıyla BHU 1.0 taslağındaki metinleri, kategori/URL’leri, inceleme alanlarını ve **5.1** bağlantısını doğruladı. iPhone/iPad hesap görselleri ve Çoklu Hesap inceleme görseli **COMPLETE**; Non-Consumable ürün **READY_TO_SUBMIT** durumunda. Kayıtlı Türkiye ürün fiyatı **149,99 TRY**; uygulama ve ürün **134 bölgede**, Türkiye açık ve AB ülkeleri kapalıdır.

**Ücretsiz indirme ve yaş:** Uygulamanın indirme fiyatı kaydedilip yeniden okundu: mevcut USA temeli korunarak **1 manuel + 174 otomatik fiyatın tamamı sıfır**, Türkiye de ücretsiz. Yaş anketindeki 26 boş yanıt uygulamanın mevcut özelliklerine göre doldurulup birebir geri okundu; Apple 175 ülke derecesi oluşturdu ve Türkiye için **FOUR_PLUS (4+)** hesapladı. Yaş sonucu zorlanmadı; mevcut yaş/ülke tercihleri korundu.

[28 Kasım canlı build sorgusu](https://github.com/fevzicakmak/BHU/actions/runs/46122271280), **1.0 / 5.1** için `VALID`, `expired=false`, `IN_BETA_TESTING` ve dış test için `READY_FOR_BETA_SUBMISSION` doğruladı. App Privacy beyanının **Publish** durumu API’den görülemiyor; davet teslimi/kabulü, fiziksel cihaz kurulumu ve gerçek satın alma/geri yükleme testleri henüz doğrulanmadı. **App Review gönderimi veya herkese açık yayın yapılmadı.** Kayıtlı `AFTER_APPROVAL` yayın seçeneği değiştirilmedi.

## 1. Kimlik ve Apple hesabı

- [x] App Store görünen adı **BHU** olarak seçildi.
- [x] Hak sahibi/yayıncı kimliği kullanıcı tarafından **Fevzi Çakmak** olarak doğrulandı.
- [x] BHU App Store Connect uygulama/bundle eşleşmesi canlı API ile doğrulandı.
- [ ] App Store Connect satıcı kaydı/yasal bilgiler son yayıncı bilgileriyle karşılaştırıldı.
- [x] Apple Developer Program üyeliğinin etkin olduğu kullanıcı tarafından doğrulandı.
- [x] Team ID **`T4F4D367KQ`** kullanıcıdan alındı ve App Debug/Release `DEVELOPMENT_TEAM` ayarlarına yazıldı.
- [x] [Mac CI 43871719871 / job 133314330319](https://github.com/fevzicakmak/BHU/actions/runs/43871719871/job/133314330319), CLI Team override olmadan Debug/Release için kayıtlı Team ID, Automatic ve doğru Bundle ID ayarlarını çözdü (`CODE_SIGNING_ALLOWED=NO`); gerçek imzalama yapılmadı.
- [ ] Bu takımda Apple Certificates/Identifiers/Profiles erişimi ve App Store Connect yayınlama yetkisi doğrulandı.
- [x] `com.fevzicakmak.bhu` uygulama/bundle ve Çoklu Hesap ürün eşleşmesi Apple API ile bağımsız doğrulandı.
- [ ] BHU uygulama kaydındaki gerçek SKU son gönderim bilgileriyle karşılaştırıldı; `BHU-IOS-001` rehberdeki öneridir.
- [x] Önceki ekran görüntüsünde Paid Apps Agreement, banka ve W-8BEN için **Active** durumu görüldü; başka vergi formları veya son gönderim kabulü çıkarımı yapılmaz.
- [x] [27 Kasım mağaza raporu](https://github.com/fevzicakmak/BHU/actions/runs/46033077370): BHU ve ürün 134 bölgede, Türkiye açık ve AB ülkeleri kapalı. Türkiye uygulama erişimi diğer mevcut bölgeler değiştirilmeden kaydedildi; bu rapor başka uygulamaları denetlemez.
- [ ] Kullanıcının tamamladığını bildirdiği hesap geneli DSA kaydının son durumu bağımsız doğrulandı. Kullanıcı adımının yeniden yapılması istenmez; hukuki sınıflama varsayılmaz.
- [x] Kamuya açık destek adresi **fvzckmk35@gmail.com** olarak onaylandı; `privacy.html` ve `support.html` içerikleri Fevzi Çakmak kimliğiyle tamamlandı.
- [x] https://fevzicakmak.github.io/BHU/privacy.html ve https://fevzicakmak.github.io/BHU/support.html 15 Kasım 2026'da canlı HTTP 200, kimlik/iletişim, bağlantı ve mobil taşma kontrolünden geçti.

Kod veya depo içine Apple parolası, özel anahtar, dağıtım sertifikası, provisioning profile ya da App Store Connect API anahtarı yazılmaz. Bu kimlik bilgileri gerekli aşamada sahibinin güvenli hesabı/CI secret yönetimiyle sağlanır.

## 2. Uygulama paketi

- [x] 28 Kasım’da ücretsiz uygulama indirme fiyatı kaydedildi ve geri okundu: mevcut USA temeli korundu; **1 manuel + 174 otomatik kaydın tamamı sıfır**, Türkiye de ücretsiz.
- [x] Paketleme betiği uygulama/gizlilik/destek dosyalarını ve yerel Capacitor köprüsünü `dist/` içine alıyor; CI native senkronizasyon ve derleme başarılı. Gerçek çevrimdışı açılış aşağıdaki ayrı kontroldür.
- [ ] Uçak modunda ilk açılış ve daha önce kaydedilmiş işlemler çalışıyor.
- [x] Kaynak Capacitor yapılandırmasında uzak `server.url` veya canlı yeniden yükleme adresi yok.
- [x] [CI 43864667196](https://github.com/fevzicakmak/BHU/actions/runs/43864667196) gerçek imzasız iPhoneOS Release arşivinde 49 mekanik kontrolü geçti: kimlik/sürüm, debug bayrağı, arm64, ikon, native config ve birebir web dosyaları. Bu sonuç dağıtım imzası veya cihaz testi değildir.
- [x] Native depolama motorunda gerçek yazma/okuma, birebir UTF-8 karşılaştırması, eşzamanlı tek kazanan ve yazma hatasında önceki dosyayı koruma XCTest runner alanında geçti (7 başarılı, koruma metadata testi atlandı).
- [ ] BHU arayüzünden kayıt oluşturma → kaydetme → yeniden açma ve native hata halinde formu koruma uçtan uca doğrulandı; ayrı runner dosya testleri bu maddeyi tamamlamaz.
- [ ] Web/Safari kayıtları JSON yedeğiyle native uygulamaya aktarılabiliyor. İki uygulama alanının kendiliğinden ortak veri kullandığı varsayılmıyor.
- [x] App Store Connect sürüm 1.0 taslağına doğrulanmış build **5.1** bağlandı; Türkçe görünen ad **BHU** olarak geri okundu.
- [ ] Görünen ad, ikon ve launch ekranının nihai cihaz kabulü tamamlandı.
- [ ] iPhone ve iPad düzenleri, güvenli alanlar, modal ve paylaşım popover'ları doğrulandı. Cihaz ailesi sonradan daraltılırsa mağaza alanları buna göre güncellendi.
- [ ] Minimum deployment target iOS 15 ile **yükleme için gerekli derleme SDK'sı/Xcode sürümü** birbirinden ayrıldı. Apple'ın gönderim günündeki SDK/Xcode gereksinimleri karşılanıyor.
- [x] Aynı Release incelemesinde `.storekit`, `.xctest`, `Tests` ve `test-artifacts` içeriği bulunmadı; 11 web dosyası yeni `dist/` ile birebir eşleşti. Son gönderilecek arşiv yeniden incelenmelidir.

## 3. Çoklu Hesap uygulama içi satın alımı

Ürün kuralı: **1 ücretsiz ana hesap + bu ana hesabın alt hesapları; ikinci ana hesap için tek seferlik kalıcı hak.** Alt hesap başına ücret veya abonelik yok.

- [x] API’de **NON_CONSUMABLE** ürün doğrulandı: `com.fevzicakmak.bhu.multipleaccounts` / **6835484249**. 28 Kasım durumu **READY_TO_SUBMIT**; yerelleştirme `PREPARE_FOR_SUBMISSION`. Bu durum ürün inceleme onayı değildir.
- [x] API'deki Product ID, kod/config ve StoreKit test dosyasıyla aynı; gerçek ürünün StoreKit'ten cihazda yüklenmesi ayrıca test edilmelidir.
- [x] Türkçe ürün adı/açıklamasının kaydı canlı API'de doğrulandı.
- [x] Gerçek native iPad uygulamasından alınan **2064×2752** Çoklu Hesap inceleme görseli Apple’da **COMPLETE** işlendi; mevcut kaynak dosyası yeniden doğrulandı, kopya görsel oluşturulmadı.
- [x] 27 Kasım UTC tarihi için kaydedilmiş aktif Türkiye ürün fiyatı API'de **149,99 TRY** olarak doğrulandı; fiyat değiştirilmedi.
- [x] Kaydedilmiş fiyat ve **Availability** bölgeleri API ile geri okundu: uygulama/ürün 134 bölgede, Türkiye açık, AB ülkeleri kapalı. Bu, gerçek satın alma kabulü değildir.
- [ ] Paywall son gerçek üründen `Product.displayPrice` gösteriyor; hedef tutar arayüze sabit yazılmıyor.
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
- [x] Politika ve destek HTTPS URL'leri 27 Kasım'da yeniden HTTP 200 ve onaylı kimlik/iletişim içeriğiyle doğrulandı; içerik geçerlilik tarihi 15 Kasım 2026'dır.
- [ ] App Privacy yanıtları son veri akışıyla tutarlı. “Data Not Collected” koşulsuz varsayılmadı.
- [x] Release arşivinde 3 privacy manifest okunabildi; uygulamanın CapApp kaynak manifesti kaynakla eşleşti ve gerçek içerikler raporlandı.
- [ ] Privacy Manifest / Required Reason API beyanlarının son kullanıma hukuki uygunluğu ve App Privacy yanıtları ayrıca değerlendirildi; mekanik rapor bunu onaylamaz.
- [ ] Kullanılmayan hassas izinler/yetenekler yok; dosya seçicisindeki isteğe bağlı kamera yolunun Türkçe kullanım açıklaması ve izin ret davranışı gerçek cihazda test edildi.
- [ ] Export-compliance yanıtları gerçek kriptografi kullanımına göre değerlendirildi.
- [x] Kanonik Türkçe [mağaza metinleri](app-store-metadata.tr.md), URL'ler, kategori ve telif App Store Connect taslağına kaydedildi; geri okuma karşılaştırması eşleşti. Gerçek cihaz/IAP kabulü ayrıca bekler.
- [x] Gerçek uygulamadan bir iPhone **1206×2622** ve bir iPad **2064×2752** hesap ağacı görseli kaydedildi; iki Apple asset durumu `COMPLETE`.
- [ ] Nihai cihaz ailesinin gerekli tüm görsel kapsamı ve son gönderim doğrulaması tamamlandı; iki asset'in `COMPLETE` olması bu maddeyi otomatik tamamlamaz.
- [x] Yaş anketindeki 26 boş yanıt gerçek içerik/özelliklere göre dolduruldu; tek PATCH kabul edildi ve birebir geri okundu. Apple 175 ülke derecesi oluşturdu; Türkiye **FOUR_PLUS (4+)**. Mevcut yaş/ülke tercihleri korundu, sonuç zorlanmadı.
- [x] [App Review notları](app-review-notes.en.txt), ücretsiz kullanım/ikinci ana hesap/geri yükleme adımlarını açıklar; notlar ve iletişim alanları kaydedildi. `demoAccountRequired=false`; özel iletişim değerleri depoda yayımlanmaz.

Kasa kayıtlarının silinmesi, bir giriş hesabının kapatılmasıyla aynı şey değildir. Şu tasarımda kullanıcı giriş hesabı yoktur. İleride giriş hesabı eklenirse Apple'ın hesap silme gereksinimleri ayrıca uygulanır.

## 5. Xcode ve TestFlight

- [x] [CI 43864667196](https://github.com/fevzicakmak/BHU/actions/runs/43864667196), kod `d0d4bbb1` üzerinde 33 Node testi, 45 Chromium senaryosu ve gerçek WebKit başarılı; dokuz kontrol sınırı/dikey-yatay ekran/CSS değerlerinin tekrarlı uygulanması/env geri dönüşü ve mevcut form/işlem akışları geçti.
- [x] Aynı kaynakta fiziksel iOS hedefli imzasız Release arşivi (SDK 26.2, arm64) ve 49 mekanik kontrol başarılı; [arşiv](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14223574378), [rapor](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14224971626) mevcut. 11 web dosyası birebir, 3 privacy manifest okunabilir, test içeriği yok.
- [x] Aynı kaynakta iPad Pro 13-inch M5 / SDK 26.5 simülatöründe iki soğuk açılış, gerçek native okuma, değişmeyen kayıt ve paint geçti; dokuz kontrol iki kararlı ölçümle güvenli alan içinde (üst 32 / alt 20 pt). [Kanıtlar](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14224439235) mevcut.
- [x] Güncel iPad iki açılış ekranı ayrı ayrı elle incelendi: başlık/hesap seçimi/+ ve dört alt menü sistem alanıyla çakışmıyor, hesap ağacı okunaklı. Bu kontrol bütün modal/döndürme/erişilebilirlik kabulü değildir.
- [x] Aynı üretim Swift/CSS/config koduyla `a0d18d2` / [iPhone job 133289724143](https://github.com/fevzicakmak/BHU/actions/runs/43864576524/job/133289724143) iki soğuk açılış/native okuma/paint/değişmeyen kayıt ve dokuz kararlı güvenli alan kontrolünü geçti (üst 62 / alt 34 pt). [İki ekran](https://github.com/fevzicakmak/BHU/actions/runs/43864576524/artifacts/14225102498) ayrı ayrı elle incelendi: başlık/alt menü güvenli alanda, durum çubuğu yazıları beyaz.
- [x] Aynı a0 iPhone işinde ayrı XCTest runner alanında 8 test yürütüldü: **7 başarılı, 1 dosya koruma metadata testi atlandı, 0 hata**. Unicode byte CAS, eşzamanlı tek kazanan ve salt okunur üst dizinde hata koruması geçti. BHU arayüzünden kaydetme/yeniden açma, donanım koruması ve gerçek StoreKit bu kapsamda değildir.
- [ ] Daha sıkı d0 ekran/ölçüm sırasıyla iPhone kontrolü kabul edildi. İki deneme de OS boot 300 saniye sınırında BHU kurulmadan başarısız oldu; [ikinci job 133296529337](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/job/133296529337) komutu 322,62 saniyede zaman aşımına uğradı ([ilk hata](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14226106017), [ikinci hata](https://github.com/fevzicakmak/BHU/actions/runs/43864667196/artifacts/14225244147)). Native XCTest/UI/geometri testleri başlamadı; son CI matrisinin tamamı başarılı değildir.
- [ ] Gerçek iPhone ve iPad'e kurulup [TestFlight planı](testflight-test-plan.md) uygulandı.
- [x] [Mac CI 43874034746 / job 133322286941](https://github.com/fevzicakmak/BHU/actions/runs/43874034746/job/133322286941), kaynak `7e5943e2744fc0bb6505236429f45e224fedd28c` için **9/9 sentetik imzalama politikası/P12 uyumluluk testini, 0 hata/0 atlama ile** geçti; modern P12 aynı üretim dönüşümünden sonra Mac keychain'e alındı. Debug/Release Team/Automatic/Bundle ID ayarları imzalama kapalıyken tekrar doğru çözüldü. Gerçek Apple sertifikası/profili/API anahtarı kullanılmadı; gerçek imzalı pipeline bu maddeyle tamamlanmaz.
- [x] Gerçek Apple Distribution sertifikasının Team/geçerlilik ve aynı CSR ile eşleşmesi, şifreli P12 ve App Store profilinin resmî imza zinciri/Team/Bundle ID/sertifika eşleşmesi doğrulandı; özel bilgiler yayımlanmadı.
- [x] Kullanıcı P12/parola/profil için üç repository Secrets kaydını tamamladığını bildirdi; bağımsız Secrets listesi doğrulaması yapılmadı.
- [x] `c4d09beeb27ef6571210b83f31ce6357a406a2e0` / [yükleme 44312503648](https://github.com/fevzicakmak/BHU/actions/runs/44312503648/job/134829998804): 15/15 Mac testi, 0 hata/0 atlama; gerçek imza/Archive/49 kontrol/export doğrulandı. [IPA artifact'ı](https://github.com/fevzicakmak/BHU/actions/runs/44312503648/artifacts/14431257071) **1.0 / build 5.1** olarak bağımsız incelendi.
- [x] Gerçek Apple doğrulama/yükleme yanıtlarında `accepted=true`; her iki işlemde 90725 SDK bildirimi var ve mevcut kabulü engellemedi. Bildirimler boş olarak yazılmaz.
- [x] [27 Kasım canlı Apple durumu 46025212781](https://github.com/fevzicakmak/BHU/actions/runs/46025212781/job/140594750047), doğru BHU/bundle/1.0/5.1 için `found=true`, `VALID`, `expired=false`, `IN_BETA_TESTING`, dış test için `READY_FOR_BETA_SUBMISSION` ve `usesNonExemptEncryption=false` doğruladı.
- [x] Kullanıcının ekranında dahili grup ve bir davet görüldü; bu çalışma otomatik davet/e-posta göndermedi.
- [x] Davet alıcı adresi kullanıcı ekranından doğrulandı; teslim sorunu için mevcut destek kaydına 27 Kasım'da takip iletisi gönderildi.
- [ ] Davetin e-posta teslimi/kabulü ve 5.1 cihaz kurulumu doğrulandı; son posta kontrolünde davet bulunmadı.
- [ ] Gerçek cihazda TestFlight kurulum/kayıt/yeniden açma ve satın alma kabulü tamamlandı.
- [ ] Dış test/Beta App Review tamamlandı; 5.1 için `READY_FOR_BETA_SUBMISSION` yalnız başvuruya hazırlık durumudur, inceleme onayı değildir.
- [ ] TestFlight iç test gerçekleştirildi. Dış test seçilirse gerekli Beta App Review süreci tamamlandı.
- [ ] Gerçek StoreKit sandbox/TestFlight satın alma ve geri yükleme akışı doğrulandı; yerel StoreKit testiyle karıştırılmadı.
- [ ] Crash ve veri kaybı bulguları çözüldü; son test edilen build ile gönderilecek build aynı.

Arşiv ve simülatör kanıtları belirtilen hash’lere aittir. 28 Kasım’da 5.1’in `VALID`/süresi dolmamış/aktif dahili dağıtımı, mağaza taslak kayıtları, ücretsiz indirme, yaş yanıtları, iki hesap görseli ve IAP inceleme görselinin `COMPLETE` durumları doğrulandı. Çoklu Hesap ürünü **READY_TO_SUBMIT** durumundadır. App Review gönderimi veya herkese açık yayın tetiklenmedi. Önceki 4.1, 18 Kasım sorgusunda Expired görüldü; neden doğrulanmadı. Gerçek cihaz/testçi ve inceleme aşamaları ayrıdır; sonraki gönderimlerde gönderilecek arşiv ayrıca doğrulanmalıdır.

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
