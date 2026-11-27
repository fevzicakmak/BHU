# BHU — App Store Connect kurulum rehberi

Mevcut BHU kaydı üzerinden ilerlenir; uygulama, ürün veya imzalama kayıtları yeniden oluşturulmaz. **27 Kasım 2026** tarihinde yetkili Apple API işlemleriyle Türkçe mağaza metinleri, gizlilik/destek bağlantıları, Finance kategorisi, inceleme iletişimi ve notları kaydedildi; **1.0 / build 5.1** taslağa bağlandı. Gerçek native iPhone/iPad ekran görüntülerinin ikisi de yükleme sonrası **COMPLETE** durumunda doğrulandı. Türkiye hem uygulama hem Çoklu Hesap satış kapsamına eklendi; diğer bölgeler korundu. [Güncel denetim](https://github.com/fevzicakmak/BHU/actions/runs/46033077370) ayrı bir salt okunur kontroldür. App Review gönderimi veya herkese açık yayın yapılmadı.

## Kullanılacak bilgiler

| Alan | Değer |
| --- | --- |
| Uygulama adı | **BHU** — uygulama Apple ID `6835483226`, API ile doğrulandı |
| Yayıncı / hizmet sağlayıcı | **Fevzi Çakmak** — Apple'daki satıcı kaydıyla karşılaştırın |
| Birincil dil | Türkçe |
| Apple Team ID | `T4F4D367KQ` — kullanıcıdan alındı; App Debug/Release yapılandırmasına yazıldı |
| Bundle ID | `com.fevzicakmak.bhu` — BHU kaydıyla eşleşmesi API ile doğrulandı |
| SKU | `BHU-IOS-001` — önerilen dahili kod; kayıttaki gerçek SKU ayrıca karşılaştırılacak |
| Uygulama indirme ücreti | Ücretsiz; Çoklu Hesap ayrıca uygulama içi satın alımdır |
| Satın alma Product ID | `com.fevzicakmak.bhu.multipleaccounts` — ürün ekranında görüldü |
| Satın alma ürününün Apple ID'si | `6835484249` — ürün ekranında görüldü |
| Satın alma türü | **Non-Consumable** — tek seferlik, kalıcı hak; abonelik değil |
| Türkiye kayıtlı fiyatı | **149,99 TL** — 27 Kasım Apple API sorgusunda kayıtlı TRY fiyatı doğrulandı |
| Destek e-postası | `fvzckmk35@gmail.com` |
| Destek URL'si | https://fevzicakmak.github.io/BHU/support.html |
| Gizlilik URL'si | https://fevzicakmak.github.io/BHU/privacy.html |

## 1. Kayıtlı takımın erişimini kontrol edin

Team ID **`T4F4D367KQ`** alındı ve Xcode App Debug/Release yapılandırmasına yazıldı; yeniden iletmeniz gerekmez. [Apple Developer hesabında](https://developer.apple.com/account/) bu takımın seçili olduğunu, Certificates, Identifiers & Profiles erişiminizi ve App Store Connect'te yayınlama yetkinizi kontrol edin. Yapılandırmaya bir Team ID yazılması bu yetkileri, sertifikayı veya Bundle ID sahipliğini doğrulamaz.

Apple parolanızı, iki aşamalı doğrulama kodunu veya özel anahtar dosyanızı paylaşmayın. Team ID bir yapılandırma kimliğidir; dağıtım sertifikasının özel anahtarı değildir.

## 2. Bundle ID kaydı tamamlandı

Kullanıcı **`com.fevzicakmak.bhu`** kaydını tamamladığını bildirdi. Aynı kimliği yeniden oluşturmayın. Takım `T4F4D367KQ` ve koddaki Bundle ID korunur; BHU uygulaması/bundle eşleşmesi güncel salt okunur REST sorgusuyla doğrulandı.

## 3. BHU uygulama kaydı tamamlandı

Kullanıcı App Store Connect'te **BHU** uygulamasını açtığını bildirdi. Yeni bir uygulama kaydı açmayın; mevcut BHU kaydı üzerinden ilerleyin. SKU `BHU-IOS-001` rehber önerisidir; gerçek kayıt değeri ayrıca karşılaştırılmalıdır. Türkçe mağaza metinleri, Support URL ve gizlilik URL’si 27 Kasım’da kaydedildi; App Privacy beyanları ayrı açık adımdır.

## 4. Mevcut Çoklu Hesap ürününü tamamlayın

1. BHU kaydında **Monetization → In-App Purchases** bölümündeki mevcut `com.fevzicakmak.bhu.multipleaccounts` ürününü açın; yeniden ürün oluşturmayın. Ürünün Apple ID'si **6835484249** ekran görüntüsünde görüldü.
2. API ile doğrulanan tür **Non-Consumable**; 27 Kasım denetiminde ürün **MISSING_METADATA** durumundaydı. Türkçe yerelleştirmesi **Prepare for Submission** durumunda ve satın alma inceleme görseli eksikti. İlk ürün uygulama sürümüyle birlikte incelemeye eklenir; henüz ürün onayı yoktur.
3. Türkçe ürün adı/açıklaması **Display Name and Description → Add** üzerinden girilir: `Çoklu Hesap` / `Ek ana hesaplar için kalıcı erişim.` Türkçe yerelleştirme kaydı API ile doğrulandı; yeniden girilmesi gerekmiyor.
4. Kural değişmedi: **bir ana hesap ve onun alt hesapları ücretsiz; ikinci ana hesap için tek seferlik kalıcı satın alma**. Abonelik veya alt hesap başına ücret yoktur.
5. Türkiye için kayıtlı **149,99 TL / TRY** fiyatı 27 Kasım’da Apple API ile bağımsız doğrulandı. Hazırlık işlemleri fiyatı değiştirmedi; uygulama gerçek üründen Apple’ın yerelleştirilmiş `displayPrice` bilgisini gösterir.
6. Apple API sorgusunda uygulama ve satın alma için **AB ülkelerinin dışarıda olduğu** doğrulandı. Türkiye’nin eksik olduğu görüldü ve yalnız Türkiye açılarak diğer bölgeler korundu. Çoklu Hesap ürünü Türkiye dahil **134** bölgede kullanılabilir; yeni bölge ayarı ve Family Sharing değiştirilmedi. Diğer para birimleri için tutar uydurulmaz.
7. Çoklu Hesap inceleme ekran görüntüsü hazırlığı sürüyor; henüz yüklenmiş sayılmaz. Yüklenen iPhone/iPad hesap ağacı görselleri bu satın alma görselinin yerine geçmez. Gerçek StoreKit satın alma/geri yükleme kabulü ayrıca tamamlanır.
8. İlk satın alma ürünü, Apple'ın istediği şekilde uygulama sürümüyle birlikte incelemeye eklenir. Yerel `.storekit` dosyası gerçek ürün onayının yerine geçmez.

## 5. Sözleşme durumu ve DSA onayı

Önceki App Store Connect ekran görüntüsünde **Paid Apps Agreement: Active**, **banka: Active** ve **W-8BEN: Active** görüldü. Bu kayıtları yeniden oluşturmayın; banka/vergi belgelerindeki kişisel bilgiler bu rehbere alınmaz.

DSA ekranında AB’de dağıtım yapmama gerekçesiyle **“I’m not a trader under the DSA or I don’t plan to distribute in the EU”** seçeneğiyle ilerlenmesi kararlaştırıldı; kullanıcı işlemi tamamladığını ve diğer uygulamasından da AB ülkelerini çıkardığını bildirdi. BHU ve Çoklu Hesap için AB kapsamının kapalı olduğu API ile doğrulandı. Diğer uygulamanın ve hesap genelindeki DSA bildiriminin son durumu bağımsız doğrulanmadı. Bu seçim genel bir hukuki non-trader statüsü ilanı değildir; ileride herhangi bir uygulamayı AB’ye açmadan önce beyan yeniden değerlendirilir.

## 6. Mac olmadan imzalı IPA ve TestFlight hazırlayın

Kullanıcının Mac'i yoktur. Mevcut hazırlıkta Apple Distribution sertifikasının Team/geçerlilik ve aynı CSR ile eşleşmesi, şifreli P12 ve gerçek App Store profilinin imza zinciri/Team/Bundle ID/sertifika eşleşmesi doğrulandı. Kullanıcı üç imzalama Secrets kaydını tamamladığını bildirdi; Secrets listesi bağımsız doğrulanmadı. [Codespaces rehberi](github-testflight.tr.md) gerektiğinde alternatif hazırlık yoludur; mevcut özel anahtar/CSR/sertifika/profil yeniden oluşturulmaz. Güncel 5.1 Apple yüklemesi/işlemesi doğrulandı; süresi dolmamış build için dahili dağıtım **IN_BETA_TESTING** durumunda. Grup/bir davet görünür; davetin e-posta teslimi/kabulü ve cihaz kurulumu henüz doğrulanmadı.

[Mac CI 43874034746 / job 133322286941](https://github.com/fevzicakmak/BHU/actions/runs/43874034746/job/133322286941), kaynak `7e5943e2744fc0bb6505236429f45e224fedd28c` için 9/9 sentetik imzalama politikası/P12 uyumluluk testini ve imzalama kapalı Team ID ayar çözümlemesini geçti. Bu sentetik testler gerçek Apple kimlik bilgileriyle imzalı archive/export/upload başarısı değildir; bu gerçek işlemler aşağıdaki 5.1 kanıtıyla doğrulandı. DSA son onayı ve yayın adımları ayrıca tamamlanır.

1. Bundle ID/BHU/ürün kayıtlarını, **Active** görülen sözleşme/banka/W-8BEN kayıtlarını ve hazırlanmış imzalama dosyalarını yeniden oluşturmayın. Kayıtlı fiyat doğrulandı; DSA son onayı ayrı açık maddedir.
2. Kullanıcı P12/parola/profil için üç GitHub Actions Secrets kaydını tamamladığını bildirdi. Bu kayıtlar bağımsız listelenmedi; gizli değerler sohbete veya depoya konmaz.
3. **18 Kasım yükleme kanıtı:** `c4d09beeb27ef6571210b83f31ce6357a406a2e0` kaynağında [yükleme 44312503648](https://github.com/fevzicakmak/BHU/actions/runs/44312503648/job/134829998804) başarılı: **15/15 Mac testi, 0 hata/0 atlama**. Gerçek Apple doğrulama/yükleme yanıtlarında `accepted=true`; iki işlemdeki **90725 SDK bildirimi kabulü engellemedi**. [IPA artifact'ı](https://github.com/fevzicakmak/BHU/actions/runs/44312503648/artifacts/14431257071) **1.0 / build 5.1** içerir (son erişim 25 Kasım 2026, 13:24:53 UTC). [27 Kasım canlı Apple sorgusu 46025212781](https://github.com/fevzicakmak/BHU/actions/runs/46025212781), doğru BHU/bundle için `found=true`, **processingState=VALID**, **expired=false**, **internalBuildState=IN_BETA_TESTING**, **externalBuildState=READY_FOR_BETA_SUBMISSION** ve `usesNonExemptEncryption=false` doğruladı. Yükleme/işleme tamamlandı, dahili dağıtım aktif. Kullanıcının ekranında grup ve **bir davet** görüldü; davetin e-posta teslimi/kabulü ve cihaz kurulumu doğrulanmadı. Dış Beta App Review, gerçek satın alma, App Review ve herkese açık yayın tamamlanmış sayılmaz.

**Önceki build:** 4.1, 17 Kasım'da hazırdı; [18 Kasım sorgusunda](https://github.com/fevzicakmak/BHU/actions/runs/44312149712/job/134828758919) **Expired** görüldü. Sona erme nedeni doğrulanmadı; güncel kurulum sürümü 5.1'dir.
4. Mevcut dahili grup ve bir davet ekranda görünüyor; grubu yeniden oluşturmayın. Kendi Apple hesabınıza ait mevcut davet e-postası ulaştıysa **View in TestFlight → Accept → Install** ile **1.0 / build 5.1** sürümünü kurun. Davetin e-posta teslimi/kabulü ve cihaz kurulumu henüz doğrulanmadı. 27 Kasım’da mevcut destek kaydına takip iletisi gönderildi; yeni davet veya yeni destek kaydı oluşturulmadı.
5. TestFlight'ta gerçek iPhone/iPad kabulünü, satın alma/geri yüklemeyi ve veri korunmasını [test planıyla](testflight-test-plan.md) tamamlayın. App Privacy, yaş derecelendirmesi, export compliance ve mağaza ekranlarını son build ile eşleştirin.

İleride bir Mac kullanılacaksa alternatif yol Xcode'da doğru Team/Bundle ID ile **Product → Archive → Validate App → Distribute App → App Store Connect** işlemidir. İki yolda da son imzalı gönderim arşivi ayrıca doğrulanır.

## Teknik hazırlığa geri iletilecekler

API kimlik doğrulaması çalışıyor; güncel 5.1 yükleme/işleme sonucu ve aktif dahili dağıtım doğrulandı. Önceki 4.1 Expired kalır. Sertifika/profil veya ürün kuralları değiştirilmez; yeni API anahtarı/CSR üretimi istenmez.

Team ID, Bundle ID, BHU/ürün kaydı, AB bölgelerinin çıkarılması ve **Active** görülen sözleşme/banka/W-8BEN bilgileri yeniden istenmez. Türkiye fiyatı **149,99 TL** olarak API ile doğrulandı; uygulama ve ürün için Türkiye satış kapsamına eklendi. DSA son onayı hâlâ doğrulanmadı. İmzalama dosyaları/Secrets gerçek Mac işinde kullanıldı ve imzalı IPA doğrulaması geçti; güncel 5.1 için Apple kabulü/işleme ve aktif dahili dağıtım doğrulandı; grup/bir davet görünür. Sıradaki adım kendi davetinin kabulü ve 5.1 cihaz kurulumudur; gerçek cihaz ve satın alma kabulü henüz tamamlanmadı. İmzalama/yükleme için gereken gizli bilgiler güvenli Xcode veya CI secret yönetiminde kalmalıdır.
