# BHU — App Store Connect kurulum rehberi

Bu adımlar uygulama sahibinin Apple hesabında yapılır; bu belgenin hazırlanması kayıt, satın alma ürünü veya mağaza gönderimi oluşturmaz. Apple hesabına bağlı bir yönetim aracı bu çalışmada kullanılmadı.

## Kullanılacak bilgiler

| Alan | Değer |
| --- | --- |
| Uygulama adı | **BHU** — kullanıcı uygulama kaydını tamamladığını bildirdi |
| Yayıncı / hizmet sağlayıcı | **Fevzi Çakmak** — Apple'daki satıcı kaydıyla karşılaştırın |
| Birincil dil | Türkçe |
| Apple Team ID | `T4F4D367KQ` — kullanıcıdan alındı; App Debug/Release yapılandırmasına yazıldı |
| Bundle ID | `com.fevzicakmak.bhu` — kullanıcı kaydı tamamladığını bildirdi |
| SKU | `BHU-IOS-001` — önerilen dahili kod; kayıttaki gerçek SKU ayrıca karşılaştırılacak |
| Uygulama indirme ücreti | Ücretsiz; Çoklu Hesap ayrıca uygulama içi satın alımdır |
| Satın alma Product ID | `com.fevzicakmak.bhu.multipleaccounts` — ürün ekranında görüldü |
| Satın alma ürününün Apple ID'si | `6835484249` — ürün ekranında görüldü |
| Satın alma türü | **Non-Consumable** — tek seferlik, kalıcı hak; abonelik değil |
| Türkiye hedef fiyatı | **149,99 TL** — kullanıcı **Next → Confirm** yaptı; son ürün **Save** adımı doğrulanmadı |
| Destek e-postası | `fvzckmk35@gmail.com` |
| Destek URL'si | https://fevzicakmak.github.io/BHU/support.html |
| Gizlilik URL'si | https://fevzicakmak.github.io/BHU/privacy.html |

## 1. Kayıtlı takımın erişimini kontrol edin

Team ID **`T4F4D367KQ`** alındı ve Xcode App Debug/Release yapılandırmasına yazıldı; yeniden iletmeniz gerekmez. [Apple Developer hesabında](https://developer.apple.com/account/) bu takımın seçili olduğunu, Certificates, Identifiers & Profiles erişiminizi ve App Store Connect'te yayınlama yetkinizi kontrol edin. Yapılandırmaya bir Team ID yazılması bu yetkileri, sertifikayı veya Bundle ID sahipliğini doğrulamaz.

Apple parolanızı, iki aşamalı doğrulama kodunu veya özel anahtar dosyanızı paylaşmayın. Team ID bir yapılandırma kimliğidir; dağıtım sertifikasının özel anahtarı değildir.

## 2. Bundle ID kaydı tamamlandı

Kullanıcı **`com.fevzicakmak.bhu`** kaydını tamamladığını bildirdi. Aynı kimliği yeniden oluşturmayın. Takım `T4F4D367KQ` ve koddaki Bundle ID korunur; hesap kaydı bağımsız Apple API sorgusuyla kontrol edilmedi.

## 3. BHU uygulama kaydı tamamlandı

Kullanıcı App Store Connect'te **BHU** uygulamasını açtığını bildirdi. Yeni bir uygulama kaydı açmayın; mevcut BHU kaydı üzerinden ilerleyin. SKU `BHU-IOS-001` rehber önerisidir; gerçek kayıt değeri ayrıca karşılaştırılmalıdır. App Privacy / Support URL / mağaza metinlerinin son sürüm için doldurulması ayrı yayın adımıdır.

## 4. Mevcut Çoklu Hesap ürününü tamamlayın

1. BHU kaydında **Monetization → In-App Purchases** bölümündeki mevcut `com.fevzicakmak.bhu.multipleaccounts` ürününü açın; yeniden ürün oluşturmayın. Ürünün Apple ID'si **6835484249** ekran görüntüsünde görüldü.
2. Tür **Non-Consumable**, durum **Prepare for Submission**. İlk satın alma ürününü uygulama sürümüyle gönderme uyarısı da görüldü; bunlar ürünün onaylandığı anlamına gelmez.
3. Türkçe ürün adı/açıklaması **Display Name and Description → Add** üzerinden girilir: `Çoklu Hesap` / `Ek ana hesaplar için kalıcı erişim.` Kullanıcı bu alanları doldurup kaydettiğini bildirdi; yeniden girilmesi gerekmiyor.
4. Kural değişmedi: **bir ana hesap ve onun alt hesapları ücretsiz; ikinci ana hesap için tek seferlik kalıcı satın alma**. Abonelik veya alt hesap başına ücret yoktur.
5. Güncel Türkiye hedefi **149,99 TL**. Kullanıcı tutarı seçip **Next → Confirm** yaptığını bildirdi. Bu işlem ürün ana sayfasındaki son **Save** adımının tamamlandığını veya Apple API ile bağımsız fiyat doğrulamasını göstermez.
6. **Availability** bölümündeki satış ülkeleri/bölgeleri için kullanıcının seçimi henüz alınmadı. Bu seçim tamamlandığında ürün ana sayfasındaki son **Save** ile kaydedip fiyat/bölge özetini kontrol edin. Diğer ülkeler veya para birimleri için tutar uydurulmaz; uygulama Apple'ın gerçek `displayPrice` bilgisini gösterir.
7. Satın alma inceleme ekran görüntüsü, gerçek native satın alma ekranı çalıştıktan sonra eklenmelidir; henüz tamamlanmış sayılmaz.
8. İlk satın alma ürünü, Apple'ın istediği şekilde uygulama sürümüyle birlikte incelemeye eklenir. Yerel `.storekit` dosyası gerçek ürün onayının yerine geçmez.

## 5. Sözleşmeleri tamamlayın

App Store Connect'teki **Business / Agreements, Tax, and Banking** bölümünde ücretli uygulama sözleşmesini, vergi ve banka bilgilerini tamamlayın. Gerekli sözleşmeler etkin değilse ürün/fiyat görünürlüğü veya satış işlemi tamamlanmayabilir. Bu bilgiler geliştirici hesabınızda girilir; depoya veya sohbete yazılmaz.

## 6. Mac olmadan imzalı IPA ve TestFlight hazırlayın

Kullanıcının Mac'i yoktur. [GitHub ile Mac olmadan TestFlight rehberi](github-testflight.tr.md), tarayıcıdaki Codespaces terminalinde sertifika isteği hazırlama, Apple portalından sertifika/profil alma ve GitHub macOS runner ile imzalama yolunu açıklar. Codespaces erişimi, repo Secrets yönetme yetkisi ve Apple Certificates erişimi gerekir; TestFlight yüklemesi için ayrıca App Store Connect API anahtarı yetkisi gerekir.

[Mac CI 43874034746 / job 133322286941](https://github.com/fevzicakmak/BHU/actions/runs/43874034746/job/133322286941), kaynak `7e5943e2744fc0bb6505236429f45e224fedd28c` için 9/9 sentetik imzalama politikası/P12 uyumluluk testini ve imzalama kapalı Team ID ayar çözümlemesini geçti. Gerçek Apple kimlik bilgisiyle imzalı archive/export/upload yapılmadı; sertifika/profil, son fiyat kaydı, satış bölgeleri ve yayın adımları ayrıca tamamlanır.

1. Tamamlandığı bildirilen Bundle ID/BHU/ürün kayıtlarını yeniden oluşturmayın; önce mevcut üründe son fiyat **Save** adımını, satış bölgelerini ve ücretli uygulama sözleşmelerini tamamlayın.
2. İmzalama dosyalarını yalnız GitHub Actions Secrets'a ekleyin; parola/sertifika özel anahtarını sohbete veya depoya koymayın.
3. **iOS Signing and TestFlight** workflow'unu önce `upload_to_testflight=false` ile çalıştırın. Bu seçim yalnız imzalı IPA üretir; Apple'a yükleme yapmaz. API anahtarı bu aşamada gerekmez.
4. Yükleme zamanı geldiğinde gerekli API anahtarı Secrets'ını ekleyip aynı workflow'u `upload_to_testflight=true` ile manuel çalıştırın. Başarılı yükleme, TestFlight işlemenin bittiği veya testin geçtiği anlamına gelmez.
5. TestFlight'ta gerçek iPhone/iPad kabulünü, satın alma/geri yüklemeyi ve veri korunmasını [test planıyla](testflight-test-plan.md) tamamlayın. App Privacy, yaş derecelendirmesi, export compliance ve mağaza ekranlarını son build ile eşleştirin.

İleride bir Mac kullanılacaksa alternatif yol Xcode'da doğru Team/Bundle ID ile **Product → Archive → Validate App → Distribute App → App Store Connect** işlemidir. İki yolda da son imzalı gönderim arşivi ayrıca doğrulanır.

## Teknik hazırlığa geri iletilecekler

Team ID, Bundle ID, BHU uygulama kaydı ve ürün kimliği yeniden istenmez. Sıradaki bilgiler **Availability** satış bölgeleri, son ürün **Save** adımının tamamlanması ve sözleşme/vergi/banka durumudur; kullanıcı 149,99 TL için **Next → Confirm** yaptığını zaten bildirdi. İmzalama/yükleme için gereken gizli bilgiler güvenli Xcode veya CI secret yönetiminde kalmalıdır.
