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
6. Kullanıcı BHU ve uygulama içi satın alımın **Availability** bölümünden **AB ülkelerini çıkardığını** bildirdi; diğer uygun ülkeler korunur. Bu seçim bağımsız Apple API sorgusuyla doğrulanmadı. Ürün ana sayfasındaki son **Save** adımı ayrıca doğrulanmalıdır; diğer para birimleri için tutar uydurulmaz ve uygulama Apple'ın gerçek `displayPrice` bilgisini gösterir.
7. Satın alma inceleme ekran görüntüsü, gerçek native satın alma ekranı çalıştıktan sonra eklenmelidir; henüz tamamlanmış sayılmaz.
8. İlk satın alma ürünü, Apple'ın istediği şekilde uygulama sürümüyle birlikte incelemeye eklenir. Yerel `.storekit` dosyası gerçek ürün onayının yerine geçmez.

## 5. Sözleşme durumu ve DSA onayı

Önceki App Store Connect ekran görüntüsünde **Paid Apps Agreement: Active**, **banka: Active** ve **W-8BEN: Active** görüldü. Bu kayıtları yeniden oluşturmayın; banka/vergi belgelerindeki kişisel bilgiler bu rehbere alınmaz.

Kullanıcı diğer uygulamasından da AB ülkelerini çıkardığını bildirdi. AB'de dağıtım yapmama gerekçesiyle DSA ekranındaki **“I’m not a trader under the DSA or I don’t plan to distribute in the EU”** seçeneği için yönerge verildi; kullanıcı son seçimi/onayı tamamladığını henüz bildirmedi. **DSA onayı tamamlanmış sayılmaz.** Bu, genel bir hukuki non-trader statüsü ilanı değildir; ileride herhangi bir uygulamayı AB'ye açmadan önce beyan yeniden değerlendirilir.

## 6. Mac olmadan imzalı IPA ve TestFlight hazırlayın

Kullanıcının Mac'i yoktur. Mevcut hazırlıkta Apple Distribution sertifikasının Team/geçerlilik ve aynı CSR ile eşleşmesi, şifreli P12 ve gerçek App Store profilinin imza zinciri/Team/Bundle ID/sertifika eşleşmesi doğrulandı. Kullanıcı üç imzalama Secrets kaydını tamamladığını bildirdi; Secrets listesi bağımsız doğrulanmadı. [Codespaces rehberi](github-testflight.tr.md) gerektiğinde alternatif hazırlık yoludur; mevcut özel anahtar/CSR/sertifika/profil yeniden oluşturulmaz. TestFlight yüklemesi için API Secrets gerçek Mac işinde kullanıldı; yükleme kabul edildi, işleme/TestFlight hazırlığı henüz doğrulanmadı.

[Mac CI 43874034746 / job 133322286941](https://github.com/fevzicakmak/BHU/actions/runs/43874034746/job/133322286941), kaynak `7e5943e2744fc0bb6505236429f45e224fedd28c` için 9/9 sentetik imzalama politikası/P12 uyumluluk testini ve imzalama kapalı Team ID ayar çözümlemesini geçti. Bu sentetik testler gerçek Apple kimlik bilgileriyle imzalı archive/export/upload başarısı değildir; son fiyat **Save** adımı, DSA son onayı ve yayın adımları ayrıca tamamlanır.

1. Bundle ID/BHU/ürün kayıtlarını, **Active** görülen sözleşme/banka/W-8BEN kayıtlarını ve hazırlanmış imzalama dosyalarını yeniden oluşturmayın. Son ürün **Save** ve DSA onayı ayrı açık maddelerdir.
2. Kullanıcı P12/parola/profil için üç GitHub Actions Secrets kaydını tamamladığını bildirdi. Bu kayıtlar bağımsız listelenmedi; gizli değerler sohbete veya depoya konmaz.
3. [Mac CI 43945652513 / job 133574498195](https://github.com/fevzicakmak/BHU/actions/runs/43945652513/job/133574498195), kaynak `3be76547d3b5e8c9323cf1e9c44210aaef338cd3` için **10/10 test, 0 hata/0 atlama** ile başarılıdır. Gerçek dağıtım kimliği/profil eşleşmesi, imzalı Archive, 49 arşiv kontrolü, IPA export, derin/sıkı codesign doğrulaması, gömülü profil/Team/Bundle yetkileri ve imzalayan sertifika eşleşmesi geçti. [BHU-AppStore-IPA](https://github.com/fevzicakmak/BHU/actions/runs/43945652513/artifacts/14265645219) içindeki **1.0 / build 3.1** IPA ve özet bağımsız olarak da incelendi; özel anahtar/Secrets veya test içeriği bulunmadı (artifact son erişim: 23 Kasım 2026, 20:05 UTC); `upload_to_testflight=true` ile Apple `altool` doğrulama ve yüklemesi **16 Kasım 2026, 20:05:12 UTC** itibarıyla başarılı kabul edildi. App Store Connect işlemesinin tamamlandığı ve TestFlight hazırlığı henüz doğrulanmadı (**beklemede**); App Review, gerçek cihaz ve gerçek satın alma kabulü ayrıca tamamlanmalıdır.
4. API Secrets ile `upload_to_testflight=true` çalıştırması Apple doğrulamasını/yüklemesini geçti. Yeniden API anahtarı üretmeyin veya aynı build'i yüklemeyin; şimdi App Store Connect işleme ve TestFlight hazırlık sonucu doğrulanmalıdır. Yükleme kabulü, TestFlight testinin geçtiği anlamına gelmez.
5. TestFlight'ta gerçek iPhone/iPad kabulünü, satın alma/geri yüklemeyi ve veri korunmasını [test planıyla](testflight-test-plan.md) tamamlayın. App Privacy, yaş derecelendirmesi, export compliance ve mağaza ekranlarını son build ile eşleştirin.

İleride bir Mac kullanılacaksa alternatif yol Xcode'da doğru Team/Bundle ID ile **Product → Archive → Validate App → Distribute App → App Store Connect** işlemidir. İki yolda da son imzalı gönderim arşivi ayrıca doğrulanır.

## Teknik hazırlığa geri iletilecekler

Team ID, Bundle ID, BHU/ürün kaydı, AB bölgelerinin çıkarılması ve **Active** görülen sözleşme/banka/W-8BEN bilgileri yeniden istenmez. Kullanıcı 149,99 TL için **Next → Confirm** yaptığını bildirdi; son ürün **Save** ve DSA onayı hâlâ doğrulanmadı. İmzalama dosyaları/Secrets gerçek Mac işinde kullanıldı ve imzalı IPA doğrulaması geçti; API Secrets kullanılarak Apple doğrulaması/yüklemesi de kabul edildi. Sıradaki teknik adım App Store Connect işlemesi ve TestFlight hazırlığını doğrulamaktır; gerçek cihaz ve satın alma kabulü henüz tamamlanmadı. İmzalama/yükleme için gereken gizli bilgiler güvenli Xcode veya CI secret yönetiminde kalmalıdır.
