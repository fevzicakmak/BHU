# BHU — App Store Connect kurulum rehberi

Bu adımlar uygulama sahibinin Apple hesabında yapılır; bu belgenin hazırlanması kayıt, satın alma ürünü veya mağaza gönderimi oluşturmaz. Apple hesabına bağlı bir yönetim aracı bu çalışmada kullanılmadı.

## Kullanılacak bilgiler

| Alan | Değer |
| --- | --- |
| Uygulama adı | **BHU** — adın mağazada kullanılabilirliği kontrol edilecek |
| Yayıncı / hizmet sağlayıcı | **Fevzi Çakmak** — Apple'daki satıcı kaydıyla karşılaştırın |
| Birincil dil | Türkçe |
| Apple Team ID | `T4F4D367KQ` — kullanıcıdan alındı; App Debug/Release yapılandırmasına yazıldı |
| Bundle ID | `com.fevzicakmak.bhu` — koddaki aday değer; kendi takımınıza kaydedilmelidir |
| SKU | `BHU-IOS-001` — önerilen, hesabınızda tekil olacak dahili takip kodu |
| Uygulama indirme ücreti | Ücretsiz; Çoklu Hesap ayrıca uygulama içi satın alımdır |
| Satın alma Product ID | `com.fevzicakmak.bhu.multipleaccounts` — koddaki aday değer |
| Satın alma türü | **Non-Consumable** — tek seferlik, kalıcı hak; abonelik değil |
| Türkiye hedef fiyatı | **399 TL** — gerçek Apple fiyat noktası henüz ayarlanmamış sayılır |
| Destek e-postası | `fvzckmk35@gmail.com` |
| Destek URL'si | https://fevzicakmak.github.io/BHU/support.html |
| Gizlilik URL'si | https://fevzicakmak.github.io/BHU/privacy.html |

## 1. Kayıtlı takımın erişimini kontrol edin

Team ID **`T4F4D367KQ`** alındı ve Xcode App Debug/Release yapılandırmasına yazıldı; yeniden iletmeniz gerekmez. [Apple Developer hesabında](https://developer.apple.com/account/) bu takımın seçili olduğunu, Certificates, Identifiers & Profiles erişiminizi ve App Store Connect'te yayınlama yetkinizi kontrol edin. Yapılandırmaya bir Team ID yazılması bu yetkileri, sertifikayı veya Bundle ID sahipliğini doğrulamaz.

Apple parolanızı, iki aşamalı doğrulama kodunu veya özel anahtar dosyanızı paylaşmayın. Team ID bir yapılandırma kimliğidir; dağıtım sertifikasının özel anahtarı değildir.

## 2. Uygulama kimliğini takımınıza kaydedin

1. Developer hesabında **Certificates, Identifiers & Profiles → Identifiers → +** yolunu açın.
2. **App IDs → App** seçin; açıklamaya `BHU` yazın.
3. **Explicit Bundle ID** alanında `com.fevzicakmak.bhu` kullanın ve kaydı tamamlayın. Gereksiz yetenekleri etkinleştirmeyin.
4. Kimlik başka bir takıma aitse veya hesabınızda kullanılamıyorsa burada durun; yeni kimlik seçimi ve kodun aynı değere güncellenmesi birlikte yapılmalıdır.

## 3. App Store Connect'te uygulamayı açın

1. [App Store Connect](https://appstoreconnect.apple.com/) içinde **Apps → + → New App** seçin.
2. Platform **iOS**, ad **BHU**, dil **Turkish**, Bundle ID önceki adımda kaydedilen kimlik, SKU `BHU-IOS-001` olacak şekilde oluşturun.
3. Ad veya SKU uygun değilse hesap içindeki uyarıya göre karar verin; Bundle ID'nin uygulamanın Xcode kimliğiyle aynı kalmasını sağlayın.
4. **App Privacy** bölümüne gizlilik URL'sini, mağaza sürümünün yerelleştirme alanındaki **Support URL** bölümüne destek adresini ekleyin. [Türkçe metadata metnindeki](app-store-metadata.tr.md) açıklama ve alt başlık hazırlanmıştır.

## 4. Çoklu Hesap satın alımını oluşturun

1. BHU kaydında **Monetization → In-App Purchases → +** bölümünü açın.
2. Türü **Non-Consumable**, referans adını `BHU Çoklu Hesap`, Product ID'yi `com.fevzicakmak.bhu.multipleaccounts` yapın.
3. Türkçe yerelleştirme için görünen ad: `Çoklu Hesap`; açıklama: `Ek ana hesaplar için kalıcı erişim.`
4. Kural: **bir ana hesap ve onun alt hesapları ücretsiz; ikinci ana hesap için kalıcı satın alma**. Ürün bir abonelik olarak açılmamalı, alt hesap başına ücret tanımlanmamalıdır.
5. Türkiye fiyatlandırmasında **399 TL** gerçekten sunulan bir fiyat noktasıysa seçin. Sunulmuyorsa en yakın tutarı kendiliğinizden seçmeyin; mevcut seçenekleri uygulama sahibine gösterip karar alın.
6. Diğer satış bölgelerini ve Apple'ın hesapladığı yerel fiyatları gözden geçirin. Uygulama satın alma ekranında sabit metin yerine Apple'ın gerçek yerelleştirilmiş fiyatını gösterir.
7. Satın alma inceleme ekran görüntüsünü, gerçek native satın alma ekranı çalıştıktan sonra ekleyin; test dosyası veya taslak görsel gerçek inceleme kanıtı değildir.
8. İlk satın alma ürünü için Apple'ın istediği şekilde ürünü uygulama sürümüyle birlikte incelemeye ekleyin. Yerel `.storekit` dosyası bu ürün kaydının yerine geçmez.

## 5. Sözleşmeleri tamamlayın

App Store Connect'teki **Business / Agreements, Tax, and Banking** bölümünde ücretli uygulama sözleşmesini, vergi ve banka bilgilerini tamamlayın. Gerekli sözleşmeler etkin değilse ürün/fiyat görünürlüğü veya satış işlemi tamamlanmayabilir. Bu bilgiler geliştirici hesabınızda girilir; depoya veya sohbete yazılmaz.

## 6. Mac olmadan imzalı IPA ve TestFlight hazırlayın

Kullanıcının Mac'i yoktur. [GitHub ile Mac olmadan TestFlight rehberi](github-testflight.tr.md), tarayıcıdaki Codespaces terminalinde sertifika isteği hazırlama, Apple portalından sertifika/profil alma ve GitHub macOS runner ile imzalama yolunu açıklar. Codespaces erişimi, repo Secrets yönetme yetkisi ve Apple Certificates erişimi gerekir; TestFlight yüklemesi için ayrıca App Store Connect API anahtarı yetkisi gerekir.

[Mac CI 43874034746 / job 133322286941](https://github.com/fevzicakmak/BHU/actions/runs/43874034746/job/133322286941), kaynak `7e5943e2744fc0bb6505236429f45e224fedd28c` için 9/9 sentetik imzalama politikası/P12 uyumluluk testini ve imzalama kapalı Team ID ayar çözümlemesini geçti. Gerçek Apple kimlik bilgisiyle imzalı archive/export/upload yapılmadı; hesap, sertifika/profil ve mağaza kayıtları aşağıdaki adımlarda ayrıca tamamlanır.

1. Önce bu rehberin 2–5. adımlarındaki Bundle ID, BHU uygulaması, Non-Consumable ürün ve sözleşmeleri Apple hesabınızda tamamlayın.
2. İmzalama dosyalarını yalnız GitHub Actions Secrets'a ekleyin; parola/sertifika özel anahtarını sohbete veya depoya koymayın.
3. **iOS Signing and TestFlight** workflow'unu önce `upload_to_testflight=false` ile çalıştırın. Bu seçim yalnız imzalı IPA üretir; Apple'a yükleme yapmaz. API anahtarı bu aşamada gerekmez.
4. Yükleme zamanı geldiğinde gerekli API anahtarı Secrets'ını ekleyip aynı workflow'u `upload_to_testflight=true` ile manuel çalıştırın. Başarılı yükleme, TestFlight işlemenin bittiği veya testin geçtiği anlamına gelmez.
5. TestFlight'ta gerçek iPhone/iPad kabulünü, satın alma/geri yüklemeyi ve veri korunmasını [test planıyla](testflight-test-plan.md) tamamlayın. App Privacy, yaş derecelendirmesi, export compliance ve mağaza ekranlarını son build ile eşleştirin.

İleride bir Mac kullanılacaksa alternatif yol Xcode'da doğru Team/Bundle ID ile **Product → Archive → Validate App → Distribute App → App Store Connect** işlemidir. İki yolda da son imzalı gönderim arşivi ayrıca doğrulanır.

## Teknik hazırlığa geri iletilecekler

Team ID zaten kayıtlıdır. Takım erişiminin doğrulandığı, kayıtlı **Bundle ID**, BHU App Store Connect kaydının oluşturulduğu, **Non-Consumable Product ID** ve Türkiye'de seçilmiş gerçek fiyat bilgileri yeterlidir. İmzalama/yükleme için gereken gizli bilgiler güvenli Xcode veya CI secret yönetiminde kalmalıdır.
