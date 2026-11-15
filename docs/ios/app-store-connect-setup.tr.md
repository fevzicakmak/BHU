# BHU — App Store Connect kurulum rehberi

Bu adımlar uygulama sahibinin Apple hesabında yapılır; bu belgenin hazırlanması kayıt, satın alma ürünü veya mağaza gönderimi oluşturmaz. Apple hesabına bağlı bir yönetim aracı bu çalışmada kullanılmadı.

## Kullanılacak bilgiler

| Alan | Değer |
| --- | --- |
| Uygulama adı | **BHU** — adın mağazada kullanılabilirliği kontrol edilecek |
| Yayıncı / hizmet sağlayıcı | **Fevzi Çakmak** — Apple'daki satıcı kaydıyla karşılaştırın |
| Birincil dil | Türkçe |
| Bundle ID | `com.fevzicakmak.bhu` — koddaki aday değer; kendi takımınıza kaydedilmelidir |
| SKU | `BHU-IOS-001` — önerilen, hesabınızda tekil olacak dahili takip kodu |
| Uygulama indirme ücreti | Ücretsiz; Çoklu Hesap ayrıca uygulama içi satın alımdır |
| Satın alma Product ID | `com.fevzicakmak.bhu.multipleaccounts` — koddaki aday değer |
| Satın alma türü | **Non-Consumable** — tek seferlik, kalıcı hak; abonelik değil |
| Türkiye hedef fiyatı | **399 TL** — gerçek Apple fiyat noktası henüz ayarlanmamış sayılır |
| Destek e-postası | `fvzckmk35@gmail.com` |
| Destek URL'si | https://fevzicakmak.github.io/BHU/support.html |
| Gizlilik URL'si | https://fevzicakmak.github.io/BHU/privacy.html |

## 1. Team ID'yi bulun

1. [Apple Developer hesabınızı](https://developer.apple.com/account/) açın.
2. **Membership details / Üyelik ayrıntıları** bölümündeki **Team ID** değerini kopyalayın; genellikle 10 karakterlidir.
3. Birden fazla takım varsa uygulamanın yayımlanacağı takımı seçin. Team ID ve o takımda uygulama yayımlama yetkinizin bulunduğu doğrulaması teknik hazırlık için yeterlidir.

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

## 6. Xcode ile imzalayın ve TestFlight'a yükleyin

1. Mac'te proje için `npm ci` ve `npm run ios:sync` çalıştırın; ardından `npm run ios:open` ile Xcode'u açın.
2. **App target → Signing & Capabilities** içinde doğru Team'i seçin; Bundle Identifier önceki kaydınızla aynı olmalıdır. Otomatik imzalama kullanılıyorsa yetkili Apple hesabına kendi Mac'inizde giriş yapın.
3. Önce native açılış/kalıcı kayıt kontrolünü ve gerçek iPhone/iPad testlerini tamamlayın. Simülatörde yalnızca derlenebilmesi bu kabulün yerine geçmez.
4. Sürüm ve build numarasını ayarlayın; simülatör yerine **Any iOS Device (arm64)** dağıtım hedefini seçin; **Product → Archive**, ardından Organizer'da **Validate App** ve **Distribute App → App Store Connect** adımlarını uygulayın.
5. Build işlendikten sonra **TestFlight** iç testini açın. Gerçek sandbox satın alma, iptal, geri yükleme, dosya paylaşımı ve güncellemede veri korunmasını [test planıyla](testflight-test-plan.md) doğrulayın.
6. App Privacy, yaş derecelendirmesi, export compliance, gerçek iPhone/iPad ekran görüntüleri ve inceleme notlarını tamamlayın. Son onaydan sonra mağaza incelemesine gönderin.

## Teknik hazırlığa geri iletilecekler

**Team ID**, kayıtlı **Bundle ID**, BHU App Store Connect kaydının oluşturulduğu bilgisi, **Non-Consumable Product ID** ve Türkiye'de seçilmiş gerçek fiyat yeterlidir. İmzalama/yükleme için gereken gizli bilgiler güvenli Xcode veya CI secret yönetiminde kalmalıdır.
