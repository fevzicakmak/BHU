# iOS ve App Store yayın dosyaları

Bu klasör, BHU'nun iOS sürümü için hazırlanmış yayın taslaklarını içerir. Mevcut web arayüzündeki Kasa Pro adı iç dosya/depolama adlarında kalabilir. Dosyaların varlığı, uygulamanın imzalandığı, gerçek iPhone'da test edildiği veya App Store'a gönderildiği anlamına gelmez.

| Dosya | Amaç |
| --- | --- |
| [app-store-metadata.tr.md](app-store-metadata.tr.md) | Türkçe mağaza metinleri, satın alma açıklaması ve inceleme notları |
| [privacy-policy.tr.md](privacy-policy.tr.md) | Geliştirici kimliği ve iletişim bilgisi tamamlanacak gizlilik politikası taslağı |
| [privacy-data-map.md](privacy-data-map.md) | Veri akışları, App Privacy ve Privacy Manifest kontrolü |
| [release-checklist.md](release-checklist.md) | Apple hesabı, imzalama, ürün tanımı ve yayın sırası |
| [testflight-test-plan.md](testflight-test-plan.md) | Gerçek cihaz ve satın alma kabul senaryoları |
| [support-content.tr.md](support-content.tr.md) | Destek sayfasına aktarılabilecek Türkçe yardım metni |

## Onaylanmış ürün kuralı

- Ücretsiz iOS kullanımında **bir ana hesap ve bu ana hesabın alt hesapları** kullanılabilir. Alt hesap başına ücret alınmaz.
- İkinci ana hesabı açmak için **tek seferlik, kalıcı Çoklu Hesap satın alımı** gerekir. Abonelik yoktur.
- Türkiye mağazası için hedef tek seferlik fiyat **399 TL**. Gerçek fiyat noktası App Store Connect'te doğrulanmalı; uygulama fiyatı Apple'ın yerelleştirilmiş ürün bilgisinden göstermeli.
- Satın alma, Apple'ın uygulama içi satın alma sistemiyle doğrulanır. Bir yerel ayar veya yedek dosyası ücretli hakkı açamaz.
- Satın alma doğrulanamasa veya geri alınmış olsa da mevcut kayıtların görüntülenmesi, düzenlenmesi ve dışa aktarılması engellenmez. Yeni ek ana hesap açma ve aynı sonucu doğuran taşıma/geri yükleme işlemleri ayrıca denetlenir.
- Web sürümünün mevcut tarayıcıda yerel kayıt düzeni korunur. Bu belgelerdeki StoreKit ve iOS dosya depolaması açıklamaları **native iOS sürümünü** anlatır; web sürümünde aynı satın alma altyapısının bulunduğu varsayılmaz.

## Yayın için sahibinden gereken bilgiler

Bu bilgiler bilinmediği için taslaklarda gerçek olmayan değerler kullanılmadı:

1. App Store adı **BHU** olarak seçildi; Apple Developer satıcı/geliştirici kimliği henüz eksik.
2. Düzenli takip edilen destek iletişim adresi ve yayımlanacak destek/gizlilik sayfalarının gerçek URL'leri.
3. Apple Developer Team, kullanılacak kesin Bundle ID ve App Store Connect uygulama kaydı.
4. Çoklu Hesap ürününün kesin Product ID'si, Türkiye için hedef 399 TL'nin gerçek Apple fiyat noktası ve satış bölgeleri.
5. Son derlemenin desteklediği cihaz ailesi ve minimum iOS sürümü doğrulaması.

Bu bilgiler tamamlanmadan gizlilik/destek taslaklarını kamuya açık nihai politika olarak veya App Store Connect'e tamamlanmış mağaza kaydı olarak göndermeyin. Teknik geliştirme ve otomatik kontroller bu bilgiler beklenirken ilerleyebilir.
