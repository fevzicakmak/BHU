# App Store Türkçe metadata taslağı

**Durum:** Kullanıcı Bundle ID `com.fevzicakmak.bhu` ve BHU uygulama kaydını tamamladığını bildirdi. Non-Consumable ürün `com.fevzicakmak.bhu.multipleaccounts`, ürün Apple ID'si `6835484249` ve **Prepare for Submission** durumu ekran görüntüsünde görüldü. Türkçe ürün adı/açıklamasının kaydedildiği bildirildi. 149,99 TL fiyat seçimi **Next → Confirm** aşamasında tamamlandı; kullanıcı BHU ve satın alma ürününden AB ülkelerini çıkardığını bildirdi. Son ürün **Save** ve DSA son onayı doğrulanmadı; imzalı IPA üretimi doğrulandı, gerçek cihaz/StoreKit kabulü ve mağaza gönderimi henüz tamamlanmadı. Apple API ile bağımsız fiyat/bölge doğrulaması yapılmadı.

**18 Kasım güncel TestFlight kanıtı:** `c4d09beeb27ef6571210b83f31ce6357a406a2e0` kaynağında [yükleme 44312503648](https://github.com/fevzicakmak/BHU/actions/runs/44312503648/job/134829998804) başarılı: **15/15 Mac testi, 0 hata/0 atlama**. Gerçek Apple doğrulama/yükleme yanıtlarında `accepted=true`; iki işlemdeki **90725 SDK bildirimi kabulü engellemedi**. [IPA artifact'ı](https://github.com/fevzicakmak/BHU/actions/runs/44312503648/artifacts/14431257071) **1.0 / build 5.1** içerir (son erişim 25 Kasım 2026, 13:24:53 UTC). [Güncel canlı Apple sorgusu 44341875903](https://github.com/fevzicakmak/BHU/actions/runs/44341875903/job/134933774627), doğru BHU/bundle için `found=true`, **processingState=VALID**, **expired=false**, **internalBuildState=IN_BETA_TESTING**, **externalBuildState=READY_FOR_BETA_SUBMISSION** ve `usesNonExemptEncryption=false` doğruladı. Yükleme/işleme tamamlandı, dahili dağıtım aktif. Kullanıcının ekranında grup ve **bir davet** görüldü; kendi alıcı hesabı, e-posta teslimi/kabulü ve cihaz kurulumu doğrulanmadı. Dış Beta App Review, gerçek satın alma, App Review ve herkese açık yayın tamamlanmış sayılmaz.

**Önceki build:** 4.1, 17 Kasım'da hazırdı; [18 Kasım sorgusunda](https://github.com/fevzicakmak/BHU/actions/runs/44312149712/job/134828758919) **Expired** görüldü. Sona erme nedeni doğrulanmadı; güncel kurulum sürümü 5.1'dir.

## Önerilen alanlar

| App Store Connect alanı | Taslak / yapılacak iş |
| --- | --- |
| Ad | `BHU` — kullanıcı uygulama kaydını tamamladığını bildirdi |
| Alt başlık | `Ana ve alt hesaplarla kasa` |
| Birincil kategori | Finance önerisi; nihai sınıflandırma satıcıya ait |
| İkincil kategori | Productivity değerlendirilebilir |
| Birincil dil | Türkçe |
| Yayıncı / hizmet sağlayıcı | Fevzi Çakmak |
| Kamuya açık destek e-postası | fvzckmk35@gmail.com |
| Ücret | Uygulama ücretsiz indirilir; Çoklu Hesap uygulama içi satın alımı ayrı tanımlanır |
| Satın alma türü | Non-Consumable; tek seferlik, kalıcı çoklu ana hesap hakkı |
| Destek URL'si | https://fevzicakmak.github.io/BHU/support.html |
| Gizlilik politikası URL'si | https://fevzicakmak.github.io/BHU/privacy.html |
| Pazarlama URL'si | İsteğe bağlı; bir URL uydurulmadı |
| Telif hakkı | 2026 Fevzi Çakmak |
| Bundle ID / SKU | `com.fevzicakmak.bhu` kaydının tamamlandığı bildirildi; SKU `BHU-IOS-001` öneridir, gerçek kayıt değeri ayrıca karşılaştırılacak |

Bu metinler finansal kayıt takibini anlatır. Uygulamanın banka hesabına bağlandığı, para transfer ettiği, fatura kestiği, vergi beyanı hazırladığı veya resmi muhasebe hizmeti sunduğu iddia edilmez.

## Tanıtım metni

> Gelir ve giderlerinizi ana ve alt hesaplarla takip edin. İlk ana hesap ve alt hesapları ücretsiz. Ek ana hesapları tek seferlik satın alımla açın.

## Açıklama

> BHU, gelir ve giderlerinizi hesaplar halinde düzenlemenize yardımcı olur.
>
> Bir ana hesap oluşturun, ihtiyaç duyduğunuz alt hesapları ekleyin ve işlemlerinizi tarih, tutar, cari ve açıklama bilgileriyle kaydedin. Hesap ağacında sürükleyerek veya dokunarak düzen kurun. Gelir, gider ve bakiye toplamlarını birlikte görün.
>
> • Ana ve alt hesaplarla kasa takibi
> • Gelir/gider kaydı, düzenleme ve filtreleme
> • Geçmiş kayıtlarınızdan cari ve açıklama önerileri
> • İşlemlere belge ve fotoğraf ekleme
> • JSON yedeğini dışa aktarma ve doğrulayarak geri yükleme
> • iOS'ta cihazda yerel kayıt ve paketlenmiş uygulama dosyalarıyla çevrimdışı çalışma
>
> Ücretsiz kullanım bir ana hesabı ve bu ana hesabın alt hesaplarını kapsar. İkinci ana hesabı oluşturmak için tek seferlik Çoklu Hesap satın alımı gerekir. Alt hesaplar için ayrıca ücret alınmaz. Bu bir abonelik değildir. Satın alımlar uygulamadaki “Satın alımları geri yükle” seçeneğiyle yeniden doğrulanabilir.
>
> Verilerinizi düzenli olarak yedekleyin. Cihazlar arasında uygulamaya ait otomatik eşitleme yoktur. Yedek dosyası finansal kayıtlarınızı ve ekli belgelerinizi içerir; paylaşacağınız konumu ve alıcıyı siz seçersiniz.

Çevrimdışı kullanım, yerel dosya depolaması ve iOS paylaşımı ifadeleri son imzalı derlemede TestFlight planıyla doğrulandıktan sonra aynen kullanılmalıdır. Uygulamayı yalnızca uzak bir web sitesini açacak şekilde paketlemek bu vaatleri sağlamaz.

## Anahtar kelime önerisi

`kasa,gelir,gider,bakiye,cari,harcama,hesap,işlem,bütçe,kayıt`

Yayın öncesi App Store Connect alan sınırlarını ve son metnin uzunluğunu kontrol edin. Rakip marka ve desteklenmeyen özellik eklemeyin.

## Uygulama içi satın alma yerelleştirmesi

- Görünen ad: **Çoklu Hesap**.
- Açıklama: **Ek ana hesaplar için kalıcı erişim.**
- Kullanıcı Türkçe alanları **Display Name and Description → Add** üzerinden doldurup kaydettiğini bildirdi; bu ürünün inceleme/onayı değildir.
- Türkiye mağazası güncel hedef fiyatı **149,99 TL**. Kullanıcı tutarı seçip **Next → Confirm** yaptı; ürün ana sayfasındaki son **Save** ve **Availability** ülkeleri/bölgeleri henüz doğrulanmadı. Apple API ile bağımsız fiyat kontrolü yapılmadı; diğer para birimleri için fiyat uydurulmadı.
- Fiyat, StoreKit ürününden yerel para birimiyle gösterilir. Metinlere sabit veya henüz belirlenmemiş fiyat yazılmaz.
- Paywall, ücretsiz ana hesap/alt hesap hakkını ve satın alımları geri yükleme seçeneğini açıkça gösterir.
- Geliştirme StoreKit yapılandırması gerçek App Store Connect ürününün onaylandığını göstermez.
- Family Sharing, kullanıcı tarafından etkinleştirilip test edilmedikçe mağaza metninde vaat edilmez.

## App Review notları taslağı

> Uygulama giriş hesabı gerektirmez. “Hesap”, kullanıcının cihazında tuttuğu kasa/finansal hesap anlamındadır.
>
> Ücretsiz senaryo: İlk ana hesabı oluşturun; bu ana hesabın altına birden fazla alt hesap ekleyin. Gelir/gider oluşturun, filtreleyin ve JSON yedeği dışa aktarın.
>
> Ücretli senaryo: İkinci ana hesabı oluşturmayı deneyin. Çoklu Hesap ekranı açılır. Satın alma Apple StoreKit üzerinden gerçekleştirilir. Ürün tipi Non-Consumable'dır; abonelik veya harici ödeme yönlendirmesi yoktur. “Satın alımları geri yükle” seçeneği bulunur.
>
> Hesap ağacında bir alt hesabı ana seviyeye taşımak veya yedekten ek ana hesaplar yüklemek de aynı yetki kontrolüne tabidir. Mevcut kayıtları görüntülemek, düzenlemek ve dışa aktarmak satın alma ekranına bağlanmaz.
>
> Uygulama banka bağlantısı veya gerçek para transferi yapmaz. “İşlemleri taşı”, mevcut kayıtların hesap bağlantısını değiştirir.

İnceleme notuna son Product ID, derleme numarası, satın alma ekranına ulaşma adımları ve gerekirse açıklayıcı ekran görüntüsü eklenir. Gerçek kişi finansal verisi, kişisel Apple hesabı bilgisi veya gerçek makbuz eklenmez.

## Ekran görüntüsü çekim listesi

1. Ana hesap ve alt hesap ağacı; bir ücretsiz ana hesabın alt hesaplarının gösterimi.
2. Gelir/gider formu ve yerel otomatik tamamlama.
3. Filtrelenmiş işlem listesi ve toplamlar.
4. İşlem belgesi/ayrıntı ekranı.
5. Yerel yedekleme ve iOS paylaşım akışı.
6. Çoklu Hesap ekranı; gerçek mağaza fiyatı ve geri yükleme seçeneği.

Yalnızca son derlemeyi ve örnek verileri kullanın. Son hedef cihaz ailesi ve App Store Connect'in o tarihte istediği ekran boyutlarına göre ekran görüntüsü yükleyin. iPad desteği açık bırakıldıysa iPad düzeni ve ekran görüntüleri de tamamlanmalıdır.
